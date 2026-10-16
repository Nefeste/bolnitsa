// Больница для пробы: синтетическая запись готовой больницы (`Preset`) нужного размера — её строит тот же
// `presetHospital` движка, теми же командами стройки, что у игрока. Не данные базы: живёт только в пробе.
//
// Устройство: слева вход и вертикальный коридор (x = 1..2), вправо — полосы. Полоса — коридор в 3 клетки, под ним ряд
// помещений дверью вверх (rot 2) и ряд дверью вниз (rot 0) — к коридору следующей полосы. Соседние помещения делят стену,
// как в готовых больницах базы.
import type { ContentDb, Id, Preset, RoomSizeId, Rot } from './src/content/types';
import { presetHospital, sizeOf, type HospitalState } from './src/engine/hospital/build';
import { presetStaff, type StaffMember } from './src/engine/hospital/staff';

interface RoomSpec {
  type: Id;
  size: RoomSizeId;
  equipment?: Id[];
  staff?: Id[];
}

export interface Layout {
  hospital: HospitalState;
  staff: StaffMember[];
  /** кабинетов нанятых врачей (без вашего) */
  desks: number;
  plot: [number, number];
  rooms: number;
}

/** Сколько помещений обслуживания на `desks` кабинетов нанятых врачей: на каждые 10 — ещё по одному. */
const per = (desks: number, n: number) => Math.max(1, Math.ceil(desks / n));

/**
 * Больница на `desks` кабинетов нанятых терапевтов (плюс ваш кабинет): ординаторские на всех, зоны ожидания,
 * регистратура, доврачебный, процедурные, лаборатории, ЭКГ, рентген, УЗИ, палаты, санузел. Ширина полосы — `width`
 * клеток. Скорой нет (нет смотровой приёмного): привезённых сортирует только игрок, а игрока в пробе нет.
 */
export function hospitalFor(db: ContentDb, desks: number, width = 100): Layout {
  const service = per(desks, 10);
  const specs: RoomSpec[] = [
    { type: 'room.reception', size: 'S', staff: ['role.registrar'] },
    { type: 'room.triage', size: 'S', staff: ['role.nurse'] },
    { type: 'room.office', size: 'M' }, // ваш кабинет: первый кабинет врача
    { type: 'room.toilet', size: 'S' },
  ];
  for (let i = 0; i < service; i++) {
    specs.push(
      { type: 'room.procedure', size: 'S', staff: ['role.nurse'] },
      { type: 'room.lab', size: 'M', equipment: ['eq.hematology_analyzer', 'eq.biochem_analyzer', 'eq.urine_analyzer', 'eq.immuno_analyzer'], staff: ['role.lab_tech'] },
      { type: 'room.ecg', size: 'S', equipment: ['eq.ecg'], staff: ['role.nurse'] },
      { type: 'room.xray', size: 'M', equipment: ['eq.xray_digital'], staff: ['role.radiographer', 'role.radiologist'] },
      { type: 'room.ultrasound', size: 'S', equipment: ['eq.us_expert'], staff: ['role.sonographer'] },
      { type: 'room.ward', size: 'M', staff: ['role.nurse'] },
    );
  }
  // зона ожидания L — 18 стульев; на каждые 3 кабинета — одна
  for (let i = 0; i < per(desks + 1, 3); i++) specs.push({ type: 'room.waiting', size: 'L' });
  for (let i = 0; i < per(desks, 4); i++) specs.push({ type: 'room.staff', size: 'M' });
  for (let i = 0; i < desks; i++) specs.push({ type: 'room.office', size: 'M', staff: ['role.therapist'] });

  // раскладка по рядам
  const X0 = 3;
  const rows: { y: number; rot: Rot }[] = [];
  const corridor: [number, number][] = [];
  const placed: Preset['rooms'] = [];
  const staff: Preset['staff'] = [];
  let row = -1;
  let x = width; // заставить открыть первый ряд
  let height = 0;
  const openRow = () => {
    row++;
    const band = Math.floor(row / 2);
    const top = band * 17;
    if (row % 2 === 0) {
      for (let y = top; y < top + 3; y++) for (let cx = 1; cx < width; cx++) corridor.push([cx, y]);
      // вертикальный коридор вниз до следующей полосы
      for (let y = top + 3; y < top + 17; y++) for (let cx = 1; cx <= 2; cx++) corridor.push([cx, y]);
    }
    rows.push({ y: row % 2 === 0 ? top + 3 : top + 10, rot: row % 2 === 0 ? 2 : 0 });
    x = X0;
  };
  for (const spec of specs) {
    const z = sizeOf(db, spec.type, spec.size);
    if (!z) throw new Error(`нет размера ${spec.type} ${spec.size}`);
    if (x + z.w > width) openRow();
    const r = rows[row];
    placed.push({ type: spec.type, size: spec.size, x, y: r.y, rot: r.rot, equipment: spec.equipment ?? [] });
    for (const role of spec.staff ?? []) staff.push({ role, room: placed.length - 1 });
    x += z.w - 1;
    height = Math.max(height, r.y + 7);
  }
  // нижний коридор последней полосы (ряд rot 0 смотрит вниз)
  const lastBand = Math.floor(row / 2);
  const bottom = lastBand * 17 + 17;
  if (row % 2 === 1) {
    for (let y = bottom; y < bottom + 3; y++) for (let cx = 1; cx < width; cx++) corridor.push([cx, y]);
    for (let y = lastBand * 17 + 3; y < bottom; y++) for (let cx = 1; cx <= 2; cx++) corridor.push([cx, y]);
    height = bottom + 3;
  }
  const plot: [number, number] = [width, height + 1];
  const preset: Preset = { id: 'preset.probe', name: { ru: 'Проба' }, plot, entrance: [0, 1], corridor: dedupe(corridor), rooms: placed, decor: [], staff };
  const { hospital, failed } = presetHospital(db, preset);
  if (failed.length > 0) throw new Error(`больница не построилась: ${JSON.stringify(failed.slice(0, 3))}`);
  return { hospital, staff: presetStaff(db, preset), desks, plot, rooms: placed.length };
}

function dedupe(cells: [number, number][]): [number, number][] {
  const seen = new Set<string>();
  return cells.filter(([x, y]) => {
    const k = `${x},${y}`;
    if (seen.has(k)) return false;
    seen.add(k);
    return true;
  });
}
