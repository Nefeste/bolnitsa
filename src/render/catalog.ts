// Сопоставление «предмет движка → модель» (spec docs/specs/2026-10-shell-3d.md, «Больница на экране»). Ключ ищется по
// порядку: аппарат с места шаблона (`eq:<id>`), предмет в помещении (`<вид>@<помещение>`), просто предмет (`<вид>`).
// Модели CC0 — файлы assets/models (assets/LICENSES.md); чего в наборах CC0 нет — модели кодом (furniture.ts).
// Тест tools/test/catalog.test.ts: у каждого предмета шаблонов и аппарата базы есть запись, у каждой модели — файл.
import type { Id, ObjectKind } from '../content/types';

/** Размер места под предмет, м: ширина поперёк взгляда, глубина вдоль, высота. */
export interface Fit {
  w: number;
  d: number;
  h: number;
}

/** Перекраска материалов модели по имени: больничная палитра вместо домашней. */
export type Recolor = Record<string, number>;

/** Модели кодом: больничного в наборах CC0 нет (assets/LICENSES.md, «Чего нет в наборах»). */
export type Code =
  | 'bed' | 'examCouch' | 'xray' | 'ct' | 'mri' | 'orTable' | 'anesthesia' | 'ventilator' | 'monitor' | 'ecg' | 'analyzer'
  | 'us' | 'endoscope' | 'counter' | 'console' | 'instrumentTable' | 'labBench' | 'procedureTable';

export type Entry =
  | {
      /** файл модели: `kenney/<имя>` или `kaykit/<имя>` */
      model: string;
      fit: Fit;
      /** на это садятся: высота сиденья, м (ширина и глубина — по `fit`, высота — чтобы сиденье пришлось на неё) */
      seat?: number;
      /** прижать к задней кромке места — к стене */
      back?: boolean;
      recolor?: Recolor;
      /** на столе — монитор и клавиатура */
      computer?: boolean;
    }
  | { code: Code };

/**
 * Высота сиденья, м. У людей набора короткие ноги: таз и бёдра сидя — 0,19–0,24 м над полом (bake.ts, `seat`), поэтому
 * стулья ниже обычных 0,45 м — иначе ноги висят (замечание владельца к пробе).
 */
export const SEAT = 0.25;

/** Больничная палитра. */
export const WHITE_FURNITURE: Recolor = { wood: 0xe9ecec, woodDark: 0xc9d0d2, _defaultMat: 0xeef0f0 };
const OFFICE_CHAIR: Recolor = { carpet: 0x4d6a73, carpetDarker: 0x3e5860, carpetWhite: 0x4d6a73 };
const WAITING_CHAIR: Recolor = { carpet: 0x5f8f8a, carpetDarker: 0x4f7b76, carpetBlue: 0x5f8f8a };
const LOUNGE: Recolor = { carpet: 0x7a8fa6, carpetDarker: 0x67798d, wood: 0xb08a5c };
const BENCH: Recolor = { carpet: 0x5f8f8a, carpetDarker: 0x4f7b76, wood: 0x9c7a52 };

const office = (k: ObjectKind, types: Id[], e: Entry): [string, Entry][] => types.map(t => [`${k}@${t}`, e]);

const DESK_CHAIR: Entry = { model: 'kenney/chairDesk', fit: { w: 0.62, d: 0.62, h: 0 }, seat: SEAT, recolor: OFFICE_CHAIR };
const BEDSIDE: Entry = { model: 'kenney/sideTableDrawers', fit: { w: 0.5, d: 0.42, h: 0.6 }, back: true, recolor: WHITE_FURNITURE };
const TALL_WHITE: Entry = { model: 'kenney/bookcaseClosedDoors', fit: { w: 0.9, d: 0.42, h: 1.9 }, back: true, recolor: WHITE_FURNITURE };
const LOW_CABINET: Entry = { model: 'kaykit/cabinet_medium', fit: { w: 0.95, d: 0.5, h: 1.15 }, back: true };

export const CATALOG: Record<string, Entry> = Object.fromEntries<Entry>([
  // аппараты по записи базы — у двух свой вид, хотя рисунок карты «Анамнеза» общий
  ['eq:eq.ventilator', { code: 'ventilator' }],
  ['eq:eq.videoendoscope', { code: 'endoscope' }],
  // койки и кушетки
  ['bed', { code: 'bed' }],
  ['couch@room.staff', { model: 'kenney/loungeChair', fit: { w: 0.85, d: 0.8, h: 0 }, seat: SEAT, recolor: LOUNGE }],
  ['couch', { code: 'examCouch' }],
  // сиденья
  ['chair@room.waiting', { model: 'kenney/chairModernFrameCushion', fit: { w: 0.56, d: 0.56, h: 0 }, seat: SEAT, recolor: WAITING_CHAIR }],
  ...office('chair', ['room.office', 'room.reception', 'room.triage', 'room.staff', 'room.xray', 'room.ct', 'room.mri', 'room.endoscopy'], DESK_CHAIR),
  ['chair', { model: 'kenney/chair', fit: { w: 0.5, d: 0.5, h: 0 }, seat: SEAT, recolor: WHITE_FURNITURE }],
  ['bench', { model: 'kenney/benchCushion', fit: { w: 0.96, d: 0.5, h: 0 }, seat: SEAT, recolor: BENCH }],
  // столы
  ['desk@room.reception', { code: 'counter' }],
  ['desk', { model: 'kenney/desk', fit: { w: 0.96, d: 0.62, h: 0.66 }, computer: true }],
  ['table@room.lab', { code: 'labBench' }],
  ['table@room.staff', { model: 'kenney/table', fit: { w: 0.9, d: 0.8, h: 0.66 } }],
  ...office('table', ['room.xray', 'room.ct', 'room.mri'], { code: 'console' }),
  ...office('table', ['room.or', 'room.endoscopy'], { code: 'instrumentTable' }),
  ['table@room.procedure', { code: 'procedureTable' }],
  ['table', { model: 'kenney/table', fit: { w: 0.9, d: 0.7, h: 0.66 } }],
  // шкафы
  ...office('cabinet', ['room.ward', 'room.box', 'room.emergency', 'room.icu', 'room.ricu'], BEDSIDE),
  ['cabinet@room.office', { model: 'kenney/bookcaseClosedDoors', fit: { w: 0.9, d: 0.42, h: 1.9 }, back: true }],
  ...office('cabinet', ['room.staff', 'room.xray', 'room.ct', 'room.mri'], LOW_CABINET),
  ['cabinet', TALL_WHITE],
  // остальное
  ['plant', { model: 'kenney/pottedPlant', fit: { w: 0.5, d: 0.5, h: 1.05 } }],
  ['sink@room.lab', { model: 'kenney/kitchenSink', fit: { w: 0.95, d: 0.62, h: 0.92 }, back: true, recolor: WHITE_FURNITURE }],
  ['sink@room.toilet', { model: 'kenney/bathroomSinkSquare', fit: { w: 0.6, d: 0.48, h: 0.95 }, back: true }],
  ['sink', { model: 'kenney/bathroomSink', fit: { w: 0.52, d: 0.45, h: 0.95 }, back: true }],
  ['xray', { code: 'xray' }],
  ['ct', { code: 'ct' }],
  ['mri', { code: 'mri' }],
  ['or_table', { code: 'orTable' }],
  ['anesthesia', { code: 'anesthesia' }],
  ['us', { code: 'us' }],
  ['monitor', { code: 'monitor' }],
  ['ecg', { code: 'ecg' }],
  ['analyzer', { code: 'analyzer' }],
  ['machine', { code: 'analyzer' }],
]);

/** Запись для предмета: аппарат, предмет в помещении, просто предмет. */
export function entryOf(kind: ObjectKind, roomType: Id | '', equipment?: Id): Entry | undefined {
  return (equipment ? CATALOG[`eq:${equipment}`] : undefined) ?? CATALOG[`${kind}@${roomType}`] ?? CATALOG[kind];
}

/** Файлы моделей, на которые ссылается таблица, и модели, которые ставятся без записи (декор, мониторы на столах). */
export const EXTRA_MODELS = ['kenney/computerScreen', 'kenney/computerKeyboard', 'kenney/toilet', 'kenney/rugRectangle', 'kenney/kitchenCabinet', 'kenney/sideTableDrawers'];
