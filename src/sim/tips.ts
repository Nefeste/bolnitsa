// из anamnez: src/state/tips.ts @ 4976f09, изменено: подсказки сценария ПК (spec docs/specs/2026-10-scenario-1.md, часть 2б) —
// из записи сценария, номер — внутри сценария, порядок — порядок списка; выбирает их поток расчёта (правды о больном в окне
// нет) и шлёт с видом карты готовыми словами; экраны — карта (шаги «Расспрос», «Осмотр», «Обследования»), шаг «Решение» и
// разбор; скорой и обхода в сценарии 1 нет; о болезни — только у заданного больного; «следующая ждёт следующего действия»
// — в окне (src/ui/doctor/Card.tsx).
//
// Подсказки наставника: по одной, в момент, когда подсказка к месту, и каждая — один раз за сценарий. Движок о них не знает,
// кроме отметки «показана» (`mark`) и «Без обучения»: вид решает по состоянию приёма и по тому, что уже показано.
import type { ContentDb, Id, ScenarioTip } from '../content/types';
import { scenarioOf } from '../engine/campaign/campaign';
import type { ShiftPatient, ShiftState } from '../engine/shift/types';
import { named } from '../i18n';

/** Где врач: карта пациента, шаг «Решение», разбор после «Завершить приём». */
export type TipScreen = 'card' | 'decision' | 'review';

/** Что сейчас с приёмом — всё, по чему видно, к месту ли подсказка. */
export interface TipMoment {
  screen: TipScreen;
  patient: string;
  /** основная болезнь: первых больных задал сценарий, наставник их знает */
  condition: Id;
  /** заданный сценарием: о его болезни наставник подсказывает, о болезни других — нет, это выдало бы диагноз */
  taught: boolean;
  /** сколько задано вопросов и сколько раз осмотрен */
  asked: number;
  examined: number;
  /** сколько обследований — анализов, снимков, ЭКГ; измерения у постели — не в счёт */
  tested: number;
  decided: boolean;
}

export function momentOf(db: ContentDb, screen: TipScreen, p: ShiftPatient): TipMoment {
  const kinds = p.done.map(id => db.exams[id]?.kind);
  return {
    screen,
    patient: p.id,
    condition: p.patient.truth.conditions[0].id,
    taught: !!p.taught,
    asked: kinds.filter(k => k === 'ask').length,
    examined: kinds.filter(k => k === 'physical').length,
    tested: kinds.filter(k => k !== undefined && k !== 'ask' && k !== 'physical' && k !== 'bedside').length,
    decided: !!p.closed,
  };
}

/**
 * К месту ли подсказка: карта открылась, а врач ещё не спрашивал и не осматривал; задал два вопроса и ещё не осматривал; у
 * заданного больного с болезнью подсказки — после первого вопроса, осмотра или обследования; «Решение»; разбор.
 */
export function tipFits(t: ScenarioTip, m: TipMoment): boolean {
  const w = t.when;
  const card = m.screen === 'card' && !m.decided;
  if (typeof w === 'object') return card && m.taught && m.condition === w.condition && m.asked + m.examined + m.tested > 0;
  switch (w) {
    case 'caseOpen':
      return card && m.asked + m.examined === 0;
    case 'afterAsk':
      return card && m.asked >= 2 && m.examined === 0;
    case 'decision':
      return m.screen === 'decision' && !m.decided;
    case 'review':
      return m.screen === 'review' && m.decided;
  }
}

/** Какую подсказку показать: первую по порядку, что к месту и ещё не показана. */
export function tipFor(tips: readonly ScenarioTip[], shown: readonly string[], m: TipMoment): ScenarioTip | undefined {
  return tips.find(t => !shown.includes(t.id) && tipFits(t, m));
}

/** Подсказка в карте: заголовок, текст и от кого — на языке окна; о чём — статьи энциклопедии с названиями. */
export interface TipView {
  id: string;
  title: string;
  text: string;
  /** от кого — имя; значок с инициалами окно рисует само */
  from: string;
  see: { id: Id; name: string }[];
}

/** Подсказки карты по экранам: на шагах «Расспрос» … «Обследования», на шаге «Решение», на разборе. */
export interface CardTips {
  card?: TipView;
  decide?: TipView;
  review?: TipView;
}

/** Название статьи энциклопедии, на которую ссылается подсказка. */
function articleName(db: ContentDb, id: Id): string {
  const x = db.conditions[id] ?? db.findings[id] ?? db.exams[id] ?? db.treatments[id] ?? db.risks[id] ?? db.rooms[id] ?? db.equipment[id] ?? db.roles[id];
  return named(x?.name, id);
}

function tipView(db: ContentDb, t: ScenarioTip): TipView {
  return { id: t.id, title: named(t.name, t.id), text: named(t.text), from: named(db.characters[t.from]?.name, t.from), see: t.see.map(id => ({ id, name: articleName(db, id) })) };
}

/**
 * Подсказки для карты вашего больного в сценарии: идёт приём — на шагах и на «Решении»; ваш закрытый — на разборе. Не
 * сценарий, «Без обучения», подсказок нет или не ваш приём — нет.
 */
export function cardTips(db: ContentDb, s: ShiftState, p: ShiftPatient, active: boolean): CardTips | undefined {
  const c = s.campaign;
  const sc = scenarioOf(db, c);
  if (!c || !sc || sc.tips.length === 0 || c.tips?.off) return undefined;
  const shown = c.tips?.shown ?? [];
  const pick = (screen: TipScreen) => {
    const t = tipFor(sc.tips, shown, momentOf(db, screen, p));
    return t ? tipView(db, t) : undefined;
  };
  const out: CardTips = {};
  if (active) {
    const card = pick('card');
    const decide = pick('decision');
    if (card) out.card = card;
    if (decide) out.decide = decide;
  } else if (p.closed && !p.closed.by) {
    const review = pick('review');
    if (review) out.review = review;
  }
  return out.card || out.decide || out.review ? out : undefined;
}
