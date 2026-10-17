// Режим врача в окне (spec docs/specs/2026-10-doctor-mode.md, «Окно»): что панели знают о враче и о чём просят игру.
// Состояние врача и вид карты приходят из потока расчёта готовыми (src/sim/doctor.ts) — правды о больном в них нет.
import type { BodySystem } from '../../content/types';
import type { Command, Difficulty } from '../../engine/shift/types';
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
}

export type DoctorAction =
  /** «Взять случай», «Позвать», «Посмотреть» — поток решает, что это за команда */
  | { kind: 'take'; id: string }
  /** открыть карту своего больного */
  | { kind: 'open'; id: string }
  | { kind: 'close' }
  /** действие в открытой карте: вопрос, осмотр, назначение, «Подождать», диагноз, лечение, место, «Завершить приём» */
  | { kind: 'act'; cmd: Command }
  /** бланк направления: отмеченное — разом, по порядку отметки */
  | { kind: 'acts'; cmds: Command[] }
  /** ответ на просьбу без карты: «Пусть решает сам», «Направить к …» */
  | { kind: 'consult'; id: string; answer: 'self' | 'refer'; to?: string }
  | { kind: 'mine'; systems: BodySystem[] }
  | { kind: 'mineOpen'; open: boolean }
  /** «Мой кабинет»; без `room` — «Не принимаю» */
  | { kind: 'office'; room?: string }
  | { kind: 'level'; level: Difficulty }
  | { kind: 'autopause'; on: boolean }
  | { kind: 'ward'; id: string; how: 'discharge' | 'transfer' }
  | { kind: 'fold'; folded: boolean }
  /** позвать первого из ждущих вас */
  | { kind: 'next' };

export const initialDoctor: DoctorHud = { level: 'student', autopause: true, meanwhile: [], mineOpen: false, folded: false };
