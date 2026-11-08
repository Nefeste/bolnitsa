// Смена врача (spec docs/specs/2026-11-doctor-shift.md, часть 2): окно «Итог смены» в 20:00 — пять категорий и общая оценка
// по вашим приёмам, сколько принято и сколько ушли, лучший результат этой больницы на этом уровне; «Новая смена» — та же
// больница и уровень, новые больные; «В меню» — экран начала. Числа — из расчётного потока (src/sim/shift.ts), слова — здесь.
import { T } from '../i18n';
import { SHIFT_CATEGORIES } from '../sim/shift';
import type { Actions, ShiftHud } from './store';
import { WindowHead } from './WindowHead';

export function ShiftSummary({ s, actions }: { s: ShiftHud | undefined; actions: Actions }) {
  if (!s) return null;
  const t = T.shift;
  const r = s.end.result;
  const venue = s.manage === 'normal' ? s.venue : `${s.venue}, ${t.levelName(T.manage.name[s.manage])}`;
  return (
    <div className="demosum panel" id="shift-summary" role="dialog" aria-labelledby="shift-title">
      <WindowHead icon="result" titleId="shift-title">
        {t.title(venue)}
      </WindowHead>
      {r ? (
        <>
          <p id="shift-overall">
            <b>
              {t.overall}: {r.overall}
            </b>{' '}
            · {t.points(r.points)}
          </p>
          <dl className="demonums" id="shift-grades">
            {SHIFT_CATEGORIES.map(k => [<dt key={`${k}-t`}>{t.category[k]}</dt>, <dd key={k} id={`shift-${k}`}>{r.grades[k]}</dd>])}
          </dl>
          <p id="shift-seen">{t.seen(r.seen, s.end.arrived)}</p>
          <p className="muted">
            {t.correct(r.correct)} · {t.minutes(r.minutes)}
          </p>
        </>
      ) : (
        <p id="shift-nobody">{t.nobody}</p>
      )}
      <p id="shift-left">{t.left(s.end.left)}</p>
      {s.best ? (
        <p id="shift-best">
          <b>{t.isBest}</b>
        </p>
      ) : s.prev ? (
        <p className="muted" id="shift-best">
          {t.bestLine(s.prev.grade, s.prev.points, s.prev.day)}
        </p>
      ) : null}
      <div className="row">
        <button type="button" className="on" id="shift-again" onClick={actions.shiftAgain}>
          {t.again}
        </button>
        <button type="button" id="shift-menu" onClick={actions.newGame}>
          {t.menu}
        </button>
      </div>
    </div>
  );
}
