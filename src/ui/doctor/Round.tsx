// Обход в карте вашего лежащего (spec docs/specs/2026-10-economy.md, «Обход»; геймдизайн §5, §6): как идёт и динамика,
// лечение сейчас; кнопки — сразу под ними, не уезжают с листом: «Сменить лечение» (отмеченное в листе назначений ниже — по
// группам, что можно у его койки, при диагнозе — сверху), «Выписать», «Перевести», «В операционную». Вид приходит из
// потока расчёта готовым (src/sim/doctor.ts, `RoundView`).
import { useState } from 'react';
import type { Id } from '../../content/types';
import { T } from '../../i18n';
import type { RoundView } from '../../sim/doctor';
import type { Actions } from '../store';

/** Ключ для id в DOM: точки в номерах базы мешают селекторам (как `dom` в Card.tsx). */
const dom = (id: string) => id.replace(/\./g, '_');

export function Round({ id, r, actions }: { id: string; r: RoundView; actions: Actions }) {
  const t = T.round;
  const w = r.row;
  const [chosen, setChosen] = useState<Id[]>(r.current);
  const [all, setAll] = useState(false);
  const items = new Map(r.groups.flatMap(g => g.items.map(x => [x.id, x] as const)));
  const toggle = (tx: Id) => setChosen(c => (c.includes(tx) ? c.filter(x => x !== tx) : [...c, tx].sort()));
  const changed = chosen.length !== r.current.length || chosen.some(x => !r.current.includes(x));
  const row = (tx: Id) => {
    const x = items.get(tx);
    if (!x) return null;
    return (
      <label key={tx} className={`xrow${x.disabled && !chosen.includes(tx) ? ' off' : ''}`} id={`round-tx-${dom(tx)}`}>
        <input type="checkbox" checked={chosen.includes(tx)} disabled={x.disabled && !chosen.includes(tx)} onChange={() => toggle(tx)} />
        <span>
          {x.name}
          {x.warning ? <small className="warn"> — {x.warning}</small> : null}
        </span>
      </label>
    );
  };
  return (
    <div className="dround" id="dcard-round">
      <div className="row">
        <b>{t.title}</b>
        <span>
          {w.diagnosis} · {T.case.ward.days(w.days, w.norm)}
        </span>
        <span className={w.state === 'worse' || w.state === 'reaction' ? 'bad' : w.state === 'ready' || w.state === 'better' ? 'ok' : undefined} id="dcard-round-state">
          {w.stateText}
        </span>
      </div>
      {w.unit ? <div className="muted">{w.unit}</div> : null}
      {w.event ? <div className="bad">{w.event}</div> : null}
      {w.vitals.map(v => (
        <div key={v.label} className="small mono">
          {v.label}: {v.values}
        </div>
      ))}
      {w.op ? <div>{w.op}</div> : null}
      <div className="small">{t.treatments(w.treatments)}</div>
      <div className="row">
        <button type="button" id="dcard-replan" className={changed ? 'on' : undefined} disabled={!changed} title={t.applyHint} onClick={() => actions.doctor({ kind: 'replan', id, treatments: chosen })}>
          {t.apply}
        </button>
        <button type="button" id="dcard-discharge" disabled={!w.canDischarge} onClick={() => actions.doctor({ kind: 'ward', id, how: 'discharge' })}>
          {T.case.ward.discharge}
        </button>
        <button type="button" id="dcard-transfer" disabled={!w.canTransfer} onClick={() => actions.doctor({ kind: 'ward', id, how: 'transfer' })}>
          {T.case.ward.transfer}
        </button>
        {w.operate ? (
          <button type="button" id="dcard-operate" disabled={w.operate.disabled} title={w.operate.hint} onClick={() => actions.doctor({ kind: 'ward', id, how: 'operate' })}>
            {t.operate}
          </button>
        ) : null}
      </div>
      <div className="dround-tx">
        {r.suggested.length > 0 ? <div className="label">{t.suggested}</div> : null}
        {r.suggested.map(row)}
        <button type="button" className="linkish" id="dcard-round-all" onClick={() => setAll(!all)}>
          {all ? '▾' : '▸'} {t.all}
        </button>
        {all
          ? r.groups.map(g => (
              <div key={g.key} className="dsec">
                <div className="label">{g.title}</div>
                {g.items.filter(x => !r.suggested.includes(x.id)).map(x => row(x.id))}
              </div>
            ))
          : null}
      </div>
    </div>
  );
}
