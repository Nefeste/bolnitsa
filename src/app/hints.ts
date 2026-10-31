// Подсказки первых минут (spec docs/specs/2026-10-aaa-polish.md, «Первые минуты»): одна строка внизу о том, что сделать
// дальше, — по состоянию игры, которое движок и так знает (чего не хватает, чтобы открыть больницу, — `openBlocks`; стоят ли
// часы; пришёл ли кто-то; просит ли врач). Без таймеров и давления: подсказка сама сменяется, когда дело сделано, и
// закрывается крестиком — закрытая не возвращается. Подсказки по роли (spec docs/specs/2026-10-two-ways.md, F4): «Врачу» — как
// позвать первого больного, «Главврачу» — где решения, «Управляющему» — что делать. Чистая функция без DOM — её проверяют
// тесты (tools/test/hints.test.ts). Слова — в src/i18n (`T.hints`), их подставляет игра (game.ts).
import type { Block } from '../engine/hospital/requirements';
import type { Role } from './roles';

export type HintKey = 'build' | 'draw' | 'furnish' | 'door' | 'hire' | 'machine' | 'fix' | 'run' | 'look' | 'asks' | 'call' | 'leave' | 'decisions' | 'manage';

/** Порядок подсказок — для проверок: все ключи, какие бывают. */
export const HINT_KEYS: readonly HintKey[] = ['build', 'draw', 'furnish', 'door', 'hire', 'machine', 'fix', 'run', 'look', 'asks', 'call', 'leave', 'decisions', 'manage'];

export interface HintInput {
  /** первое, без чего больницу не открыть (`openBlocks`); нет — открыта */
  block?: Block;
  /** стройка открыта */
  buildOn: boolean;
  /** в стройке взят инструмент «Готовое помещение» или «Помещение» и выбран тип — дальше ведёт строка призрака */
  drawing: boolean;
  /** часы стоят */
  paused: boolean;
  /** сколько пришло с начала игры */
  arrived: number;
  /** просьб нанятых врачей сейчас */
  asks: number;
  /** игрок уже открывал карточку или вкладку — «щёлкните по человеку» не нужно */
  looked: boolean;
  /** роль; нет — «Врач» */
  role?: Role;
  /** решений врачей на утверждении сейчас (spec 2026-10-two-ways, F3) */
  decisions?: number;
  /** игрок уже отвечал на решение врача — где решения, он знает */
  answered?: boolean;
  /** «Врач»: свой кабинет, вы свободны и есть кого позвать, а ещё никого не звали */
  callable?: boolean;
  /** первая планёрка уже была — «Управляющему» больше нечего объяснять */
  met?: boolean;
}

/**
 * Какую подсказку показать — или никакой. `seen` — закрытые игроком и уже отработавшие: они не возвращаются.
 * Просьба врача — важнее всего, за ней — пришедшее решение врача; закрытая больница — по причине, по которой она закрыта;
 * открытая — пустить часы, потом — по роли, потом — как смотреть.
 */
export function hintOf(s: HintInput, seen: ReadonlySet<HintKey>): HintKey | undefined {
  const pick = (k: HintKey) => (seen.has(k) ? undefined : k);
  // просьба закрыта — дальше по состоянию; закрытая больница с закрытой подсказкой — молчание: следующая придёт с делом
  if (s.asks > 0 && !seen.has('asks')) return 'asks';
  // решение врача ждёт ответа — где оно, пока ни на одно не отвечали (у любой роли)
  if ((s.decisions ?? 0) > 0 && !s.answered && !seen.has('decisions')) return 'decisions';
  const b = s.block;
  if (b) {
    if (b.kind === 'noRoom') return s.buildOn ? (s.drawing ? undefined : pick('draw')) : pick('build');
    if (b.kind === 'down') {
      const p = b.problem.kind;
      if (p === 'noObject') return pick('furnish');
      if (p === 'noDoor' || p === 'singleDoor') return pick('door');
      if (p === 'noStaff') return pick('hire');
      if (p === 'noEquipment') return pick('machine');
      return pick('fix');
    }
    return pick('fix');
  }
  if (s.paused && s.arrived === 0 && !seen.has('run')) return 'run';
  // по роли (spec 2026-10-two-ways, F4): «Врачу» — как позвать первого; «Главврачу» — где решения; «Управляющему» — что делать
  const role = s.role ?? 'doctor';
  // стройка открыта — её панель закрывает окно врача (spec docs/specs/2026-11-demo.md, проход по снимкам 1): сначала «Готово»
  if (role === 'doctor' && s.callable && !seen.has('call')) return s.buildOn && !seen.has('leave') ? 'leave' : 'call';
  if (role === 'chief' && !s.answered && !seen.has('decisions')) return 'decisions';
  if (role === 'manager' && !s.met && !seen.has('manage')) return 'manage';
  if (!s.looked) return pick('look');
  return undefined;
}
