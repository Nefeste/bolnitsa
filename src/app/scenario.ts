// Сценарий кампании в окне (spec docs/specs/2026-10-scenario-1.md, часть 2): письма наставницы — карточкой над строкой подсказки
// и разделом планёрки, вкладка «Цели», «Без обучения», окно «Сценарий пройден». Ход хранит движок (`s.campaign`): окно получает
// его видом потока расчёта (`ScenarioView`) и шлёт отметки командой `mark` — наступившее состояние подсказки, закрытая
// подсказка, прочитанное письмо, «Без обучения». Слова писем и целей — из записи сценария в базе, на языке интерфейса. Письмо
// приходит без паузы: часы идут, как шли (решение владельца #116). Порядок стройки (решение владельца #114): шаги из записи
// сценария, сделан ли шаг — от потока; выключают его отметкой `guide`. Подсказки наставницы в карте больного (часть 2б) поток
// присылает с видом карты; показанную окно отмечает здесь же (`tip`).
import type { ContentDb, Id, Scenario } from '../content/types';
import { named, T } from '../i18n';
import type { GoalView, ScenarioView } from '../sim/campaign';
import type { Game } from './game';
import type { HintKey } from './hints';

/** Письмо на экране: от кого и кто он, текст, прочитано ли. */
export interface LetterRow {
  id: string;
  from: string;
  role: string;
  /** значок вместо портрета: инициалы — портретов людей в окне пока нет */
  initials: string;
  text: string;
  day: number;
  read: boolean;
}

/** Шаг порядка стройки: номер, помещение, зачем, сделан ли, следующий ли. */
export interface GuideRow {
  n: number;
  type: Id;
  name: string;
  why: string;
  done: boolean;
  /** первый несделанный */
  next: boolean;
}

/** Цель на экране: текст и ход. */
export interface GoalRow {
  id: string;
  main: boolean;
  text: string;
  value: number;
  target: number;
  accuracy?: number;
  done: boolean;
}

export interface ScenarioHud {
  /** «Сценарий 1. Амбулатория» */
  title: string;
  goals: GoalRow[];
  /** пришедшие письма — новые сверху */
  letters: LetterRow[];
  /** карточка над строкой подсказки: первое непрочитанное письмо; пока открыта планёрка — нет, её письма — в её разделе */
  letter?: LetterRow;
  /** письмо карточки — первое в сценарии: у него — «Без обучения» */
  first: boolean;
  /** «Без обучения» */
  off: boolean;
  /** окно «Сценарий пройден» открыто */
  done: boolean;
  /** порядок стройки: шаги и показан ли; у сценария без порядка — нет */
  guide?: { on: boolean; steps: GuideRow[] };
}

export type ScenarioAction =
  /** «Понятно» и ✕ «Пропустить»: письмо прочитано */
  | { kind: 'read'; id: string }
  /** подсказка наставницы в карте больного (часть 2б) показана: «Понятно» или ✕ */
  | { kind: 'tip'; id: string }
  /** «Без обучения»: писем к состояниям и подсказок в карте больше нет; `on: false` — обучение снова */
  | { kind: 'off'; on: boolean }
  /** «Сценарий пройден» — «Продолжить здесь» */
  | { kind: 'stay' }
  /** «Порядок стройки»: показать или выключить */
  | { kind: 'guide'; on: boolean };

/** Инициалы для значка письма: «Мира Холм» — «МХ». */
export const initialsOf = (name: string): string =>
  name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map(w => w[0].toUpperCase())
    .join('');

/** Заголовок сценария: «Сценарий 1. Амбулатория». */
export const scenarioTitle = (sc: Scenario): string => T.scenario.title(sc.order, named(sc.name, sc.id));

/** Письмо сценария для экрана; письма нет в записи — нет. */
export function letterRow(db: ContentDb, sc: Scenario, l: { id: string; day: number; read?: boolean }): LetterRow | undefined {
  const rec = sc.letters.find(x => x.id === l.id);
  if (!rec) return undefined;
  const who = db.characters[rec.from];
  const from = named(who?.name, rec.from);
  return { id: l.id, from, role: named(who?.role), initials: initialsOf(from), text: named(rec.text), day: l.day, read: !!l.read };
}

/** Цель для экрана: текст из записи, ход — от потока. */
export function goalRow(sc: Scenario, g: GoalView): GoalRow {
  const m = sc.missions.find(x => x.id === g.id);
  return { id: g.id, main: g.main, text: named(m?.text, g.id), value: g.value, target: g.target, ...(g.accuracy !== undefined ? { accuracy: g.accuracy } : {}), done: g.done };
}

/** Шаги порядка стройки для экрана: слова — из записи и базы, сделан ли — от потока; следующий — первый несделанный. */
export function guideRows(db: ContentDb, sc: Scenario, steps: readonly { room: Id; done: boolean }[]): GuideRow[] {
  const next = steps.findIndex(x => !x.done);
  return steps.map((x, i) => {
    const g = sc.guide.find(y => y.room === x.room);
    return { n: i + 1, type: x.room, name: named(db.rooms[x.room]?.name, x.room), why: named(g?.why), done: x.done, next: i === next };
  });
}

/** Состояние подсказки, к которому у сценария есть письмо: такое письмо — ещё и знак, что состояние уже наступало. */
const hintOfLetter = (sc: Scenario, id: string): string | undefined => {
  const w = sc.letters.find(x => x.id === id)?.when;
  return typeof w === 'object' && 'hint' in w ? w.hint : undefined;
};

export class ScenarioDesk {
  /** вид от потока; нет — игра не сценарий */
  view?: ScenarioView;
  /** состояния подсказок, о которых поток уже знает: отметка `hint` — один раз */
  private reached = new Set<string>();
  /** прочитанные здесь, пока поток не прислал вид с отметкой: карточка не возвращается на кадр */
  private readHere = new Set<string>();
  /** «Сценарий пройден» показан — в этой игре или до сохранения */
  private doneShown = false;
  private doneOpen = false;

  constructor(private g: Game) {}

  get scenario(): Scenario | undefined {
    return this.view ? this.g.db.scenarios?.[this.view.id] : undefined;
  }

  /**
   * Вид от потока. Первый после загрузки: сценарий уже пройден — окна «Сценарий пройден» нет; состояния подсказок, к которым
   * письма уже пришли, — уже наступали.
   */
  onView(v: ScenarioView) {
    const first = this.view === undefined;
    this.view = v;
    const sc = this.scenario;
    if (first) {
      if (v.complete !== undefined) this.doneShown = true;
      for (const l of v.letters) {
        const h = sc ? hintOfLetter(sc, l.id) : undefined;
        if (h) this.reached.add(h);
      }
    }
    for (const l of v.letters) if (l.read) this.readHere.delete(l.id);
    if (v.complete !== undefined && !this.doneShown) {
      this.doneShown = true;
      this.doneOpen = true;
    }
  }

  /** Строка подсказки показала состояние `key`: впервые в сценарии — отметка, движок пришлёт его письмо, если оно есть. */
  reach(key: HintKey) {
    if (!this.view || this.reached.has(key)) return;
    this.reached.add(key);
    this.g.client.command({ kind: 'mark', what: 'hint', id: key });
  }

  /** Подсказку закрыли крестиком: в сценарии это помнит ход сценария — и после загрузки она не вернётся. */
  close(key: HintKey) {
    if (this.view) this.g.client.command({ kind: 'mark', what: 'closed', id: key });
  }

  /** Письма планёрки прочитаны, когда её закрыли. */
  readAll(ids: readonly string[]) {
    for (const id of ids) this.read(id);
  }

  private read(id: string) {
    if (!this.view || this.readHere.has(id) || this.view.letters.find(l => l.id === id)?.read) return;
    this.readHere.add(id);
    this.g.client.command({ kind: 'mark', what: 'read', id });
  }

  dispatch(a: ScenarioAction) {
    switch (a.kind) {
      case 'read':
        this.read(a.id);
        break;
      case 'tip':
        if (this.view) this.g.client.command({ kind: 'mark', what: 'tip', id: a.id });
        break;
      case 'off':
        if (this.view) this.g.client.command({ kind: 'mark', what: 'off', on: a.on });
        break;
      case 'stay':
        this.doneOpen = false;
        break;
      case 'guide':
        if (this.view) this.g.client.command({ kind: 'mark', what: 'guide', on: a.on });
        break;
    }
    this.g.refresh();
  }

  /** Письма и выполненные цели утра — для раздела планёрки. */
  meetingOf(got: { done: string[]; letters: string[] } | undefined): { letters: LetterRow[]; goals: string[] } | undefined {
    const sc = this.scenario;
    if (!sc || !got || (got.done.length === 0 && got.letters.length === 0)) return undefined;
    const day = this.view?.letters.find(l => got.letters.includes(l.id))?.day ?? 0;
    const letters = got.letters.flatMap(id => letterRow(this.g.db, sc, { id, day }) ?? []);
    return { letters, goals: got.done.map(id => named(sc.missions.find(m => m.id === id)?.text, id)) };
  }

  /** Для панелей: цели, письма, карточка письма; `meeting` — открыта планёрка. */
  hud(meeting: boolean): ScenarioHud | undefined {
    const v = this.view;
    const sc = this.scenario;
    if (!v || !sc) return undefined;
    const db = this.g.db;
    const rows = v.letters.flatMap(l => letterRow(db, sc, { ...l, read: l.read || this.readHere.has(l.id) }) ?? []);
    const unread = meeting ? undefined : rows.find(r => !r.read);
    return {
      title: scenarioTitle(sc),
      goals: v.goals.map(g => goalRow(sc, g)),
      letters: [...rows].reverse(),
      ...(unread ? { letter: unread } : {}),
      first: !!unread && rows[0]?.id === unread.id,
      off: !!v.off,
      done: this.doneOpen,
      ...(v.guide ? { guide: { on: !v.guideOff, steps: guideRows(db, sc, v.guide) } } : {}),
    };
  }
}
