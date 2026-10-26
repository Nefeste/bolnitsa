// Сценарий кампании в окне (spec docs/specs/2026-10-scenario-1.md, часть 2): карточка письма над строкой подсказки, письмо в
// списке (вкладка «Цели», раздел планёрки), вкладка «Цели», окно «Сценарий пройден»; часть 2в — порядок стройки во вкладке
// «Цели» и в каталоге стройки. Данные — из окна (src/app/scenario.ts), слова — здесь, при отрисовке.
import type { Id } from '../content/types';
import type { GoalRow, GuideRow, LetterRow, ScenarioHud } from '../app/scenario';
import { T } from '../i18n';
import type { Actions } from './store';
import { Icon } from './icons';

/** Письмо: значок с инициалами вместо портрета, от кого и кто он, текст; в списке — и когда пришло. */
export function Letter({ l, day = false }: { l: LetterRow; day?: boolean }) {
  return (
    <div className="letter" data-letter={l.id}>
      <div className="lhead">
        <span className="lbadge" aria-hidden="true">
          {l.initials}
        </span>
        <div>
          <b>{l.from}</b>
          <small className="muted">
            {l.role}
            {day ? ` · ${T.scenario.letterDay(l.day)}` : ''}
          </small>
        </div>
      </div>
      <p className="ltext">{l.text}</p>
    </div>
  );
}

/**
 * Карточка письма над строкой подсказки: первое непрочитанное, без паузы — часы идут, как шли (вопрос владельцу #116).
 * «Понятно» и ✕ «Пропустить» — прочитано; у первого письма — «Без обучения».
 */
export function LetterCard({ s, actions }: { s: ScenarioHud | undefined; actions: Actions }) {
  const l = s?.letter;
  if (!s || !l) return null;
  const read = () => actions.scenario({ kind: 'read', id: l.id });
  return (
    <div className="lettercard panel" id="letter" data-letter={l.id}>
      <button type="button" className="close small" id="letter-skip" onClick={read} title={T.scenario.skip}>
        <Icon name="close" />
      </button>
      <Letter l={l} />
      <div className="row">
        <button type="button" className="on" id="letter-ok" onClick={read}>
          {T.scenario.ok}
        </button>
        {s.first && !s.off ? (
          <button
            type="button" id="letter-off" title={T.scenario.offHint}
            onClick={() => {
              actions.scenario({ kind: 'off', on: true });
              read();
            }}
          >
            {T.scenario.off}
          </button>
        ) : null}
      </div>
    </div>
  );
}

function Goal({ g }: { g: GoalRow }) {
  const t = T.scenario;
  return (
    <li id={`goal-${g.id}`} className={g.done ? 'ok' : undefined}>
      <span className="gmark">{g.done ? <Icon name="done" /> : <Icon name="todo" />}</span> {g.text}{' '}
      <small className="muted">
        — {g.done ? t.doneMark : t.progress(g.value, g.target)}
        {g.accuracy !== undefined && g.value > 0 ? `, ${t.accuracy(g.accuracy)}` : ''}
      </small>
    </li>
  );
}

/** Вкладка «Цели»: основные и дополнительные с ходом, обучение, пришедшие письма — новые сверху. */
export function GoalsTab({ s, actions }: { s: ScenarioHud; actions: Actions }) {
  const t = T.scenario;
  return (
    <div id="goals">
      <b id="goals-title">{s.title}</b>
      <h3>{t.main}</h3>
      <ul className="goals">
        {s.goals.filter(g => g.main).map(g => (
          <Goal key={g.id} g={g} />
        ))}
      </ul>
      <h3>{t.extra}</h3>
      <ul className="goals">
        {s.goals.filter(g => !g.main).map(g => (
          <Goal key={g.id} g={g} />
        ))}
      </ul>
      <p className="muted small">{t.note}</p>
      <label className="check" title={t.offHint}>
        <input type="checkbox" id="goals-tutorial" checked={!s.off} onChange={e => actions.scenario({ kind: 'off', on: !e.target.checked })} />
        {t.tutorial}: {t.tutorialOn}
      </label>
      {s.guide ? (
        <>
          <h3>{t.guide}</h3>
          <GuideToggle s={s} actions={actions} id="goals-guide" />
          {s.guide.on ? <GuideList steps={s.guide.steps} /> : null}
        </>
      ) : null}
      <h3>{t.letters}</h3>
      {s.letters.length === 0 ? <p className="muted">{t.noLetters}</p> : s.letters.map(l => <Letter key={l.id} l={l} day />)}
    </div>
  );
}

/** Порядок стройки (решение владельца #114): шаги с номером и «зачем»; сделанные — с галочкой, следующий — выделен. */
export function GuideList({ steps }: { steps: readonly GuideRow[] }) {
  return (
    <>
      <ol className="guide" id="guide-list">
        {steps.map(x => (
          <li key={x.type} className={x.done ? 'done' : x.next ? 'next' : undefined} data-room={x.type}>
            <span className="gstep" aria-hidden="true">
              {x.done ? <Icon name="done" /> : x.n}
            </span>
            <span>
              <b>{x.name}</b> — {x.why}
            </span>
          </li>
        ))}
      </ol>
      {steps.every(x => x.done) ? <p className="muted small">{T.scenario.guideAll}</p> : null}
    </>
  );
}

/** Переключатель «Порядок стройки»: в панели «Стройка» и во вкладке «Цели». */
export function GuideToggle({ s, actions, id }: { s: ScenarioHud; actions: Actions; id: string }) {
  if (!s.guide) return null;
  return (
    <label className="check" title={T.scenario.guideHint}>
      <input type="checkbox" id={id} checked={s.guide.on} onChange={e => actions.scenario({ kind: 'guide', on: e.target.checked })} /> {T.scenario.guide}
    </label>
  );
}

/**
 * Каталог стройки по порядку: шаги порядка — первыми, по номеру, остальные — как были. Порядок выключен или его нет — как
 * было, без шагов.
 */
export function byGuide<R extends { id: Id }>(rows: readonly R[], s: ScenarioHud | undefined): { row: R; step?: GuideRow }[] {
  const steps = s?.guide?.on ? s.guide.steps : [];
  const step = new Map(steps.map(x => [x.type, x]));
  const first = steps.flatMap(x => rows.filter(r => r.id === x.type));
  return [...first, ...rows.filter(r => !step.has(r.id))].map(row => ({ row, ...(step.has(row.id) ? { step: step.get(row.id)! } : {}) }));
}

/** Номер шага у строки каталога: сделанный — галочка. */
export function StepMark({ step }: { step?: GuideRow }) {
  if (!step) return null;
  return (
    <span className={`gstep${step.done ? ' done' : ''}`} aria-hidden="true">
      {step.done ? <Icon name="done" /> : step.n}
    </span>
  );
}

/** «Сценарий пройден»: все основные цели выполнены — играть здесь дальше, как в песочнице, или в меню. */
export function ScenarioDone({ s, actions }: { s: ScenarioHud | undefined; actions: Actions }) {
  if (!s?.done) return null;
  const t = T.scenario;
  return (
    <div className="scenariodone panel" id="scenario-done" role="dialog" aria-labelledby="scenario-done-title">
      <h2 id="scenario-done-title">{t.doneTitle}</h2>
      <b>{s.title}</b>
      <p>{t.doneText}</p>
      <div className="row">
        <button type="button" className="on" id="scenario-stay" onClick={() => actions.scenario({ kind: 'stay' })}>
          {t.stay}
        </button>
        <button type="button" id="scenario-menu" onClick={actions.newGame}>
          {t.menu}
        </button>
      </div>
    </div>
  );
}
