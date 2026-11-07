// Лист передачи (spec docs/specs/2026-11-scenario-2.md, часть 2а; лист «Анамнеза» — Handover в src/app/shift/index.tsx
// @ bed1996): привезённый скорой, что ждёт вашей сортировки, — кто, повод, что измерил фельдшер; на лёгких уровнях — баллы
// NEWS2 и тревожный признак. Три цвета — место в очереди к врачу. Часы стоят, пока лист открыт (src/app/doctor.ts,
// `openSheet`). Вид приходит из потока расчёта готовым (src/sim/doctor.ts, `HandoverRow`): правды о больном в нём нет.
import { clock, T } from '../../i18n';
import type { Triage } from '../../engine/shift/types';
import type { HandoverRow } from '../../sim/doctor';
import type { Actions } from '../store';
import { WindowHead } from '../WindowHead';

const COLORS: readonly Triage[] = ['red', 'yellow', 'green'];

/** `more` — сколько ещё ждут сортировки после него. */
export function Handover({ row, more, actions }: { row: HandoverRow; more: number; actions: Actions }) {
  const t = T.doctor.handover;
  return (
    <div className="dsheet panel" id="dsheet" role="dialog" aria-labelledby="dsheet-title">
      <WindowHead icon="card" titleId="dsheet-title" close={{ id: 'dsheet-close', hint: `Esc — ${t.closeHint}`, onClick: () => actions.doctor({ kind: 'sheet', id: null }) }}>
        {t.title}: <span id="dsheet-who">{row.who}</span>
      </WindowHead>
      <p className="muted small" id="dsheet-arrived">
        {t.arrived(clock(row.at), row.door ? t.door : t.bay)}
      </p>
      <p id="dsheet-reason">{t.reason(row.reason)}</p>
      {row.measured.length > 0 ? (
        <>
          <div className="label">{t.measured}</div>
          <ul id="dsheet-measured">
            {row.measured.map(m => (
              <li key={m}>{m}</li>
            ))}
          </ul>
        </>
      ) : (
        <p className="muted">{t.nothing}</p>
      )}
      {row.news2 !== undefined ? (
        <p className="muted small" id="dsheet-news2">
          {t.news2(row.news2)}
          {row.flag ? ` · ${t.flag(row.flag)}` : ''}
        </p>
      ) : null}
      <div className="label">{t.sortAs}</div>
      <div className="row" id="dsheet-triage">
        {COLORS.map(c => (
          <button key={c} type="button" id={`dsheet-${c}`} className="tbtn" title={t.triageHint[c]} onClick={() => actions.doctor({ kind: 'sort', id: row.id, triage: c })}>
            <span className={`dot t-${c}`} /> {t.triage[c]}
          </button>
        ))}
      </div>
      <p className="muted small" id="dsheet-more">
        {more > 0 ? `${t.more(more)} · ` : ''}
        {t.clock}
      </p>
    </div>
  );
}
