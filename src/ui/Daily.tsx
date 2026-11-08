// Случай дня (spec docs/specs/2026-11-doctor-shift.md, часть 3): второй шаг экрана начала — последние 30 дней, сегодня первым,
// у сыгранного — засчитанный итог (первая попытка); строка дня открывает его. Окно «Итог дня» — когда приём больного дня
// закрыт: итог этой попытки и засчитанный, «Разбор» — карта больного, «Сыграть снова», «В меню». Слова — здесь, числа и
// итоги — из src/app/daily.ts и расчётного потока.
import { T } from '../i18n';
import { Icon } from './icons';
import type { Actions, DailyHud, Hud } from './store';
import { WindowHead } from './WindowHead';

export function DailyStart({ hud, actions, back }: { hud: Hud; actions: Actions; back: () => void }) {
  const t = T.daily;
  const rows = hud.startDaily ?? [];
  return (
    <div className="start panel" id="start-daily-step">
      <div className="game">{T.app.title}</div>
      <h2>{t.start}</h2>
      <p className="intro">{t.lead}</p>
      <h2>{t.days}</h2>
      {rows.map((r, i) => (
        <button key={r.day} type="button" id={`daily-${r.day}`} className={r.record ? 'on' : undefined} onClick={() => actions.startGame({ daily: r.day })}>
          <b>{t.day(r.day, i)}</b>
          <span>{r.record ? t.played(r.record.grade, t.verdict[r.record.verdict]) : t.notPlayed}</span>
        </button>
      ))}
      <button type="button" id="start-back" className="small" onClick={back}>
        <Icon name="back" /> {T.start.back}
      </button>
    </div>
  );
}

export function DailySummary({ s, actions }: { s: DailyHud | undefined; actions: Actions }) {
  if (!s) return null;
  const t = T.daily;
  return (
    <div className="demosum panel" id="daily-summary" role="dialog" aria-labelledby="daily-title">
      <WindowHead icon="result" titleId="daily-title">
        {t.title(s.day)}
      </WindowHead>
      <p id="daily-grade">
        <b>{t.grade(s.end.grade, t.verdict[s.end.verdict])}</b>
      </p>
      <p className="muted" id="daily-counted">
        {s.first ? t.first : t.counted(s.record.grade, t.verdict[s.record.verdict])}
      </p>
      <div className="row">
        <button type="button" id="daily-review" onClick={actions.dailyReview}>
          {t.review}
        </button>
        <button type="button" className="on" id="daily-again" onClick={actions.dailyAgain}>
          {t.again}
        </button>
        <button type="button" id="daily-menu" onClick={actions.newGame}>
          {T.shift.menu}
        </button>
      </div>
    </div>
  );
}
