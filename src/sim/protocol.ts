// Обмен между потоком отрисовки и потоком расчёта (spec docs/specs/2026-10-engine-speed.md, «Поток расчёта», решение
// владельца 16.10.2026; docs/specs/2026-10-shell-3d.md, «Обмен между потоками»): больница считается в отдельном потоке
// (Web Worker в окне Electron), отрисовка — в основном. Туда — команды и ход часов, обратно — упакованный срез
// (src/sim/pack.ts), строки новых людей и извещения. Сообщения — structured clone; массив среза передаётся без копии.
import type { Flow, Notice, ShiftState, Command } from '../engine/shift/types';
import type { Journey } from '../engine/shift/journey';
import type { HospitalState } from '../engine/hospital/build';
import type { StaffMember } from '../engine/hospital/staff';
import type { Season } from '../content/types';
import type { Lang } from '../i18n';
import type { Difficulty } from '../engine/shift/types';
import type { CardView, DoctorState, Refusal, SeenList } from './doctor';
import type { NameRow } from './pack';
import type { SaveMeta } from './packing';

export type ToSim =
  /** новая смена с потоком для ПК; `economy` — касса начала (spec docs/specs/2026-10-economy.md), нет — без кассы */
  | { kind: 'start'; seed: number; season: Season; hospital: HospitalState; staff: StaffMember[]; flow: Flow; economy?: { cash: number } }
  /** открыть сохранение — снимок состояния */
  | { kind: 'load'; state: ShiftState }
  /** действие игрока: вопрос, обследование, стройка, найм… — как `apply` */
  | { kind: 'command'; cmd: Command }
  /**
   * кадр: часам игры прибавилось `seconds` игровых секунд (×1 — треть секунды при 60 к/с, ×12 — 4; пауза — 0); движку — `budgetMs` мс.
   * Не успел — часы смены отстают и догоняют в следующих кадрах
   */
  | { kind: 'tick'; seconds: number; budgetMs: number }
  /** сохранить: вернуть снимок */
  | { kind: 'save' }
  /**
   * файл сохранения (spec docs/specs/2026-10-saves.md): снимок, шапка и вид окна — в сжатые байты, здесь, а не в окне;
   * день, час и кассу шапки поток берёт из снимка
   */
  | { kind: 'pack'; meta: Omit<SaveMeta, 'day' | 't' | 'cash'>; view?: unknown }
  /**
   * путь пациента (spec docs/specs/2026-10-flow-ui.md): окно показывает путь этого пациента (номер в движке) — поток кладёт
   * его в срез (`path`), когда он изменился; null — никого
   */
  | { kind: 'watch'; id: string | null }
  /** режим врача (spec docs/specs/2026-10-doctor-mode.md, «Поток расчёта»): карта, «Взять случай», действие в карте */
  | { kind: 'doctor'; act: DoctorAct };

/**
 * Режим врача: `view` — чью карту показывать (`null` — закрыта), язык и уровень медицины; `take` — «Взять случай» (поток
 * сам решает, какая это команда движка); `case` — действие в карте больного `id`: только если он у вас в кабинете.
 */
export type DoctorAct =
  | { kind: 'view'; open: string | null; lang: Lang; level: Difficulty }
  | { kind: 'take'; id: string }
  | { kind: 'case'; id: string; cmd: Command };

/** Больница и штат — когда они впервые или заново (после `start`, `load`, стройки и найма). */
export interface World {
  hospital: HospitalState;
  staff: StaffMember[];
  /** стройка ПК (spec 2026-10-build): потрачено на стройку, ₽, и сколько действий можно отменить */
  works?: { spent: number; undo: number };
}

/** Путь пациента, которого показывает окно (`watch`); пути нет — null (не поток для ПК или путь уже убран). */
export interface PathView {
  id: string;
  journey: Journey | null;
}

export type FromSim =
  /**
   * после каждого tick и command: упакованный срез (`buf`, src/sim/pack.ts), строки новых людей, извещения, на сколько
   * часы смены отстали от часов игры (игровых секунд); `world` — если больница или штат изменились; `broken` — сломанные
   * с утра аппараты, «помещение:место», когда список изменился (spec 2026-10-flow-ui: «не работает: аппарат сломан»; меняется
   * в 08:00 — без пересборки сцены); `late` — кто из штата (номера в его списке) уже не в смене, а ещё в больнице: доводит
   * приёмы (spec docs/specs/2026-10-staff-shifts.md), — когда список изменился
   */
  | ({ kind: 'slice'; buf: Int32Array; names: NameRow[]; notices: Notice[]; lag: number; world?: World; path?: PathView; broken?: string[]; late?: number[] } & DoctorOut)
  | { kind: 'state'; state: ShiftState }
  /** файл сохранения: сжатые байты (без копии) и его шапка; не вышло — `packFailed` */
  | { kind: 'packed'; bytes: Uint8Array; meta: SaveMeta }
  | { kind: 'packFailed'; message: string }
  | { kind: 'error'; message: string };

/**
 * Режим врача в срезе (spec docs/specs/2026-10-doctor-mode.md): состояние врача и вид открытой карты — когда изменились
 * (`card: null` — карта закрыта или больного нет); «Приняты» — приняты и ушли за сутки, когда список изменился (spec
 * docs/specs/2026-10-discharged-card.md); `refused` — почему поток не сделал `take` или `case`.
 */
export interface DoctorOut {
  doctor?: DoctorState;
  card?: CardView | null;
  seen?: SeenList;
  refused?: { act: 'take' | 'case'; id: string; why: Refusal };
}
