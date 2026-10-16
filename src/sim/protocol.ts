// Обмен между потоком отрисовки и потоком расчёта (spec docs/specs/2026-10-engine-speed.md, «Поток расчёта», решение
// владельца 16.10.2026): больница считается в отдельном потоке (Web Worker в окне Electron), отрисовка — в основном. Туда —
// команды и ход часов, обратно — срез для отрисовки и извещения. Сообщения — простые объекты: structured clone.
import type { Flow, Notice, ShiftState, Command } from '../engine/shift/types';
import type { HospitalState } from '../engine/hospital/build';
import type { StaffMember } from '../engine/hospital/staff';
import type { Season } from '../content/types';
import type { ShiftSlice } from '../engine/shift/slice';

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
  | { kind: 'save' };

export type FromSim =
  /** после каждого tick и command: срез, извещения, на сколько часы смены отстали от часов игры (игровых секунд) */
  | { kind: 'slice'; slice: ShiftSlice; notices: Notice[]; lag: number }
  | { kind: 'state'; state: ShiftState }
  | { kind: 'error'; message: string };
