// Экран планёрки в 08:00 и вкладка «Отчёты» (spec docs/specs/2026-10-economy.md, «Планёрка»; геймдизайн §12): сутки в цифрах,
// нанятые врачи, касса по статьям, репутация и её причины, узкие места, что сломалось, кому из ваших лежащих хуже, персонал —
// кто собирается уйти и кто уходит (spec docs/specs/2026-10-staff-mood.md), подсказка, часы приёма, кредит. Данные — из окна (src/app/money.ts), слова — здесь, при отрисовке.
import { type ReactNode, useState } from 'react';
import { PAYERS } from '../engine/economy/economy';
import type { RepChange } from '../engine/economy/economy';
import { money, T } from '../i18n';
import { type EconomyHud, type MeetingView, type Raise, slowOf, type Tip } from '../app/money';
import type { Actions } from './store';

/** «+12 300 ₽», «−4 000 ₽». */
export const signed = (n: number) => `${n >= 0 ? '+' : '−'}${money(Math.abs(n))}`;

function tipText(t: Tip): string {
  const x = T.meeting.tips;
  switch (t.key) {
    case 'left':
      return x.left(t.n, t.of, T.meeting.dur(t.wait));
    case 'room':
      return x.room(t.name, T.meeting.dur(t.wait));
    case 'audit':
      return x.audit(money(t.rub));
    default:
      return x[t.key];
  }
}

function reasonText(r: RepChange['reasons'][number], wait: number | undefined): string {
  const x = T.meeting.repReason;
  const what = r.key === 'waitShort' || r.key === 'waitLong' ? x[r.key](wait ?? 0) : r.key === 'noToilet' ? x.noToilet() : x[r.key](r.count);
  return `${what} (${r.delta >= 0 ? '+' : '−'}${Math.abs(r.delta)})`;
}

/**
 * «Поднять зарплату» в строке планёрки (spec docs/specs/2026-10-staff-mood.md): то же действие, что в карточке человека;
 * нажали — кнопка говорит, что поднята (планёрка — снимок утра, её строки не пересчитываются).
 */
function RaiseButton({ id, raise, actions }: { id: string; raise: Raise; actions: Actions }) {
  const [done, setDone] = useState(false);
  return (
    <button
      type="button" className="small" id={`meet-raise-${id}`} disabled={done} title={T.card.raiseHint}
      onClick={() => {
        actions.raise(id);
        setDone(true);
      }}
    >
      {done ? T.build.raised : T.card.raise(money(raise.from), money(raise.to))}
    </button>
  );
}

function Section({ title, children, id }: { title: string; children: ReactNode; id?: string }) {
  return (
    <section className="msec" id={id}>
      <h3>{title}</h3>
      {children}
    </section>
  );
}

/** Сутки в цифрах, врачи, касса, репутация, узкие места, сломанное, обход, подсказка — для экрана и вкладки. */
export function MeetingBody({ m, e, actions }: { m: MeetingView; e: EconomyHud; actions: Actions }) {
  const t = T.meeting;
  const d = m.summary;
  const col = Object.values(d.colleagues ?? {});
  const hired = col.reduce((n, c) => n + c.seen, 0);
  const ec = d.economy;
  const l = ec?.ledger;
  const wardIncome = l?.ward?.income ?? 0;
  const income = l ? PAYERS.reduce((n, p) => n + l.income[p], 0) + wardIncome : 0;
  const expenses = l ? Object.values(l.expenses).reduce((n: number, v) => n + (v ?? 0), 0) : 0;
  const slow = slowOf(d.load);
  return (
    <div className="mbody">
      <Section title={t.day} id="meet-day">
        <p>
          {t.arrived(d.arrived, d.ambulance?.arrived ?? 0)} · {t.seen(d.seen + hired, d.seen, hired)} · {t.left(d.left)}
        </p>
        {d.ward ? <p>{t.ward(d.ward.admitted, d.ward.discharged, d.ward.transferred, d.ward.died ?? 0, d.ward.lying)}</p> : null}
      </Section>
      {m.doctors.length > 0 || d.seen > 0 ? (
        <Section title={t.hired} id="meet-doctors">
          <ul>
            {m.doctors.map((x, i) => (
              <li key={i}>
                {t.hiredRow(x.role, x.skill, x.seen, x.correct)}
                {x.idle ? <span className="muted"> — {t.idle}</span> : null}
                {t.hiredMore(x.asked, x.taken, x.unsafe, x.tired) ? <span className="muted"> · {t.hiredMore(x.asked, x.taken, x.unsafe, x.tired)}</span> : null}
              </li>
            ))}
            {d.seen > 0 ? <li>{t.you(d.seen, d.correct)}</li> : null}
          </ul>
        </Section>
      ) : null}
      {ec && l ? (
        <Section title={t.cash} id="meet-cash">
          <p>
            <b>{t.income(money(income))}</b>
          </p>
          <ul>
            {PAYERS.filter(p => l.cases[p] > 0).map(p => (
              <li key={p}>{t.payerLine(t.payers[p], l.cases[p], money(l.income[p]))}</li>
            ))}
            {l.ward && l.ward.cases > 0 ? <li>{t.wardLine(l.ward.cases, money(wardIncome))}</li> : null}
            <li className="muted">{t.level(ec.level.level)}</li>
          </ul>
          {l.audit.cut > 0 ? <p className="muted">{t.audit(money(l.audit.cut), t.auditWhy(l.audit.weak, l.audit.unconfirmed, l.audit.unindicated))}</p> : null}
          <p>
            <b>{t.expenses(money(expenses))}</b>
          </p>
          <ul id="meet-expenses">
            {Object.entries(l.expenses)
              .filter(([, v]) => (v ?? 0) !== 0)
              .map(([k, v]) => (
                <li key={k}>
                  {t.expense[k] ?? k}: {(k === 'works' || k === 'severance') && (v ?? 0) < 0 ? signed(-(v ?? 0)) : money(v ?? 0)}
                </li>
              ))}
          </ul>
          <p>
            <b id="meet-net">{t.net(signed(income - expenses))}</b> · <span id="meet-cashat">{t.cashAt(money(ec.cash))}</span>
          </p>
          {ec.cash < -e.limit ? <p className="bad">{t.belowLimit(money(e.limit))}</p> : ec.cash < 0 ? <p className="bad">{t.debt(money(l.expenses.interest))}</p> : null}
          {ec.loan ? <p>{t.loanLeft(money(ec.loan.left), money(ec.loan.perDay))}</p> : null}
          {m.loanTaken !== undefined ? <p className="ok">{t.loanTaken(money(m.loanTaken))}</p> : null}
          {ec.offer !== undefined ? (
            <div className="row">
              <span>{t.loanOffer(money(ec.offer), money(Math.round((ec.offer * (100 + e.loan.fee)) / 100)), e.loan.days)}</span>
              <button type="button" id="meet-loan" onClick={() => actions.money({ kind: 'loan' })}>
                {t.loanTake(money(ec.offer))}
              </button>
            </div>
          ) : null}
        </Section>
      ) : null}
      {ec ? (
        <Section title={t.rep} id="meet-rep">
          <p>
            <b>{t.repLine(ec.reputation.from, ec.reputation.to, ec.reputation.score)}</b>
          </p>
          {ec.reputation.score === undefined ? <p className="muted">{t.repNobody}</p> : null}
          <ul>
            {ec.reputation.reasons.map((r, i) => (
              <li key={i} className={r.delta >= 0 ? 'ok' : 'bad'}>
                {reasonText(r, ec.reputation.wait)}
              </li>
            ))}
          </ul>
        </Section>
      ) : null}
      <Section title={t.load} id="meet-load">
        {slow.length === 0 ? <p className="muted">{t.loadNone}</p> : null}
        <ul>
          {slow.map((x, i) => (
            <li key={i}>
              {x.kind === 'doctors' ? t.doctors(x.queue, x.wait) : x.kind === 'room' ? t.room(m.rooms[x.id] ?? x.id, x.queue, x.wait, x.n) : x.kind === 'door' ? t.door(x.n) : t.beds(x.peak, x.of)}
            </li>
          ))}
        </ul>
      </Section>
      {m.broken.length > 0 ? (
        <Section title={t.broken} id="meet-broken">
          <ul>
            {m.broken.map((b, i) => (
              <li key={i}>{t.brokenRow(b.eq, b.room, money(b.repair))}</li>
            ))}
          </ul>
        </Section>
      ) : null}
      {m.worse.length > 0 ? (
        <Section title={t.worse} id="meet-worse">
          <ul>
            {m.worse.map(w => (
              <li key={w.id} className="bad">
                {t.worseRow(w.who, w.state)}
              </li>
            ))}
          </ul>
        </Section>
      ) : null}
      {m.staff ? (
        <Section title={t.staff} id="meet-staff">
          <ul>
            {m.staff.leave.map((x, i) => (
              <li key={`l${i}`} className="bad">
                {t.staffLeave(x.who, x.why.slice(0, 2).map(w => T.card.moodWhy[w] ?? w).join(', '))}
              </li>
            ))}
            {m.staff.quit.map(x => (
              <li key={`q${x.id}`} className="bad">
                {t.staffQuit(x.who, x.until)} {x.raise ? <RaiseButton id={x.id} raise={x.raise} actions={actions} /> : null}
              </li>
            ))}
            {m.staff.low.map((x, i) => (
              <li key={`w${i}`}>{t.staffLow(x)}</li>
            ))}
            {m.staff.grew.map(x => (
              <li key={`g${x.id}`}>
                {t.staffGrew(x.who, x.skill)} {x.raise ? <RaiseButton id={x.id} raise={x.raise} actions={actions} /> : null}
              </li>
            ))}
            {m.staff.back.map((x, i) => (
              <li key={`b${i}`} className="ok">
                {t.staffBack(x.who, x.skill)}
              </li>
            ))}
            {m.staff.sick.map((x, i) => (
              <li key={`s${i}`}>{t.staffSick(x)}</li>
            ))}
          </ul>
        </Section>
      ) : null}
      <Section title={t.tip} id="meet-tip">
        <p>{tipText(m.tip)}</p>
      </Section>
    </div>
  );
}

/** Часы приёма: с какого часа до какого (команда `hours`, spec «Часы приёма»). */
export function Hours({ e, actions }: { e: EconomyHud; actions: Actions }) {
  const [open, close] = e.hours;
  const hh = (h: number) => `${String(h).padStart(2, '0')}:00`;
  return (
    <div className="row hours" title={T.meeting.hoursHint}>
      <span className="label">{T.meeting.hours}</span>
      <span>{T.meeting.from}</span>
      <select id="hours-open" value={open} onChange={ev => actions.money({ kind: 'hours', open: Number(ev.target.value), close })}>
        {Array.from({ length: close }, (_, h) => (
          <option key={h} value={h}>
            {hh(h)}
          </option>
        ))}
      </select>
      <span>{T.meeting.to}</span>
      <select id="hours-close" value={close} onChange={ev => actions.money({ kind: 'hours', open, close: Number(ev.target.value) })}>
        {Array.from({ length: 24 - open }, (_, i) => open + 1 + i).map(h => (
          <option key={h} value={h}>
            {hh(h)}
          </option>
        ))}
      </select>
    </div>
  );
}

/** Экран планёрки — поверх карты, с автопаузой; «Продолжить» — часы идут дальше. */
export function Meeting({ e, actions }: { e: EconomyHud; actions: Actions }) {
  const m = e.meeting;
  if (!m) return null;
  return (
    <div className="meeting panel" id="meeting" role="dialog" aria-labelledby="meeting-title">
      <div className="mhead">
        <b id="meeting-title">{T.meeting.title(m.summary.day)}</b>
        <label className="small">
          <input type="checkbox" id="meeting-autopause" checked={e.autopause} onChange={ev => actions.money({ kind: 'autopause', on: ev.target.checked })} /> {T.meeting.autopause}
        </label>
        <button type="button" id="meeting-close" className="on" onClick={() => actions.money({ kind: 'close' })} title="Esc">
          {T.meeting.resume}
        </button>
      </div>
      <MeetingBody m={m} e={e} actions={actions} />
      <Hours e={e} actions={actions} />
    </div>
  );
}

/** Вкладка «Отчёты»: последняя планёрка (открыть экран) и часы приёма. */
export function Reports({ e, actions }: { e: EconomyHud | undefined; actions: Actions }) {
  if (!e) return <p>{T.tabs.soon}</p>;
  return (
    <div id="reports">
      <Hours e={e} actions={actions} />
      {e.meeting ? (
        <>
          <div className="row">
            <b>{T.meeting.title(e.meeting.summary.day)}</b>
            <button type="button" id="reports-open" onClick={() => actions.money({ kind: 'open' })}>
              {T.meeting.reopen}
            </button>
          </div>
          <MeetingBody m={e.meeting} e={e} actions={actions} />
        </>
      ) : (
        <p className="muted">{T.meeting.none}</p>
      )}
    </div>
  );
}
