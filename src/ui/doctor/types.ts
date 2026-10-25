// Режим врача в окне (spec docs/specs/2026-10-doctor-mode.md, «Окно»): что панели знают о враче и о чём просят игру.
// Состояние врача и вид карты приходят из потока расчёта готовыми (src/sim/doctor.ts) — правды о больном в них нет.
import type { BodySystem, Id } from '../../content/types';
import type { AskRule, Command, Difficulty } from '../../engine/shift/types';
import type { CardView, DoctorState } from '../../sim/doctor';

export interface DoctorHud {
  /** из потока: где вы, кто у вас, кто ждёт, просьбы */
  state?: DoctorState;
  /** открытая карта пациента */
  card?: CardView;
  level: Difficulty;
  /** автопауза на просьбу и на результаты ваших больных */
  autopause: boolean;
  /** «За это время» — что случилось в больнице, пока шло последнее действие карты */
  meanwhile: string[];
  /** что вышло у последнего «Взять», «Мой кабинет» или почему нельзя */
  said?: { ok: boolean; text: string };
  /** раскрыт выбор «Своих больных» */
  mineOpen: boolean;
  /** окно врача свёрнуто */
  folded: boolean;
  /** кого позвать после разбора: первый из ждущих вас, нет — из общей очереди; вы заняты — никого */
  next?: { id: string; who: string };
  /** ваши лежащие, которым в 08:00 стало хуже (spec 2026-10-economy, «Обход») — отмечены до следующей планёрки */
  worse?: string[];
  /** раскрыт список лежащих у нанятых врачей (spec 2026-10-two-ways, F2) */
  theirsOpen?: boolean;
}

export type DoctorAction =
  /** «Взять случай», «Позвать», «Посмотреть» — поток решает, что это за команда */
  | { kind: 'take'; id: string }
  /** открыть карту больного: своего или, для чтения, — любого (spec 2026-10-two-ways, F1) */
  | { kind: 'open'; id: string }
  | { kind: 'theirsOpen'; open: boolean }
  | { kind: 'close' }
  /** действие в открытой карте: вопрос, осмотр, назначение, «Подождать», диагноз, лечение, место, «Завершить приём» */
  | { kind: 'act'; cmd: Command }
  /** бланк направления: отмеченное — разом, по порядку отметки */
  | { kind: 'acts'; cmds: Command[] }
  /** ответ на просьбу без карты: «Пусть решает сам», «Направить к …» */
  | { kind: 'consult'; id: string; answer: 'self' | 'refer'; to?: string }
  /**
   * ответ главврача на решение врача (spec docs/specs/2026-10-two-ways.md, F3): «Согласен», «Взять», «Направить к …», выписку —
   * «Ещё сутки»
   */
  | { kind: 'approve'; id: string; answer: 'agree' | 'take' | 'refer' | 'stay'; to?: string }
  /** «Согласен со всеми, где уверен от 80 %» */
  | { kind: 'agreeAll' }
  /** «Ещё обследование» (F2): назначает главврач, делает врач больного — по порядку отметки */
  | { kind: 'order'; id: string; exams: Id[] }
  /** о чём спрашивать главврача — галочки */
  | { kind: 'asks'; rules: AskRule[] }
  | { kind: 'mine'; systems: BodySystem[] }
  | { kind: 'mineOpen'; open: boolean }
  /** «Мой кабинет»; без `room` — «Не принимаю» */
  | { kind: 'office'; room?: string }
  | { kind: 'level'; level: Difficulty }
  | { kind: 'autopause'; on: boolean }
  | { kind: 'ward'; id: string; how: 'discharge' | 'transfer' | 'operate' }
  /** обход (spec docs/specs/2026-10-economy.md): сменить лечение лежащего — лист назначений целиком */
  | { kind: 'replan'; id: string; treatments: Id[] }
  | { kind: 'fold'; folded: boolean }
  /** позвать первого из ждущих вас */
  | { kind: 'next' };

export const initialDoctor: DoctorHud = { level: 'student', autopause: true, meanwhile: [], mineOpen: false, folded: false };
