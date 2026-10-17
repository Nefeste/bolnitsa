// Обмен между потоком отрисовки и потоком расчёта (spec docs/specs/2026-10-engine-speed.md, «Поток расчёта», решение
// владельца 16.10.2026; docs/specs/2026-10-shell-3d.md, «Обмен между потоками»): больница считается в отдельном потоке
// (Web Worker в окне Electron), отрисовка — в основном. Туда — команды и ход часов, обратно — упакованный срез
// (src/sim/pack.ts), строки новых людей и извещения. Сообщения — structured clone; массив среза передаётся без копии.
import type { Flow, Notice, ShiftState, Command } from '../engine/shift/types';
import type { HospitalState } from '../engine/hospital/build';
import type { StaffMember } from '../engine/hospital/staff';
import type { Season } from '../content/types';
import type { Lang } from '../i18n';
import type { Difficulty } from '../engine/shift/types';
import type { CardView, DoctorState, Refusal } from './doctor';
import type { NameRow } from './pack';

export type ToSim =
  /** новая смена с потоком для ПК */
  | { kind: 'start'; seed: number; season: Season; hospital: HospitalState; staff: StaffMember[]; flow: Flow }
  /** открыть сохранение — снимок состояния */
  | { kind: 'load'; state: ShiftState }
  /** действие игрока: вопрос, обследование, стройка, найм… — как `apply` */
  | { kind: 'command'; cmd: Command }
  /**
   * кадр: часам игры прибавилось `seconds` игровых секунд (×1 — 1 при 60 к/с, ×4 — 4; пауза — 0); движку — `budgetMs` мс.
   * Не успел — часы смены отстают и догоняют в следующих кадрах
   */
  | { kind: 'tick'; seconds: number; budgetMs: number }
  /** сохранить: вернуть снимок */
  | { kind: 'save' }
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

export type FromSim =
  /**
   * после каждого tick и command: упакованный срез (`buf`, src/sim/pack.ts), строки новых людей, извещения, на сколько
   * часы смены отстали от часов игры (игровых секунд); `world` — если больница или штат изменились
   */
  | ({ kind: 'slice'; buf: Int32Array; names: NameRow[]; notices: Notice[]; lag: number; world?: World } & DoctorOut)
  | { kind: 'state'; state: ShiftState }
  | { kind: 'error'; message: string };

/**
 * Режим врача в срезе (spec docs/specs/2026-10-doctor-mode.md): состояние врача и вид открытой карты — когда изменились
 * (`card: null` — карта закрыта или больного нет); `refused` — почему поток не сделал `take` или `case`.
 */
export interface DoctorOut {
  doctor?: DoctorState;
  card?: CardView | null;
  refused?: { act: 'take' | 'case'; id: string; why: Refusal };
}
