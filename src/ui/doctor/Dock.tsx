// Окно врача, вкладка «Просят посмотреть», «Взять случай» и «Мой кабинет» (spec docs/specs/2026-10-doctor-mode.md, «Как
// случай становится вашим», «Ваш кабинет»). Списки приходят из потока расчёта словами (src/sim/doctor.ts): правды о
// больных в них нет.
import { type ReactNode, useState } from 'react';
import { type BodySystem, SYSTEMS } from '../../content/types';
import { clock, T } from '../../i18n';
import type { PersonInfo } from '../../render/population';
import type { AskRow, PatientRow } from '../../sim/doctor';
import type { Actions, Hud, RoomCard } from '../store';
import { Levels } from './Card';

const VERDICT: Record<string, string> = { correct: '✓', partly: '≈', wrong: '✗' };

function Row({ r, children, hint }: { r: PatientRow; children?: ReactNode; hint?: string }) {
  return (
    <li className={`prow t-${r.triage}`} id={`dr-${r.id}`}>
      <span className="who">
        {r.who}
        <small className="muted">
          {' '}
          «{r.complaint}»{hint ? ` · ${hint}` : ''}
        </small>
      </span>
      {children}
    </li>
  );
}

/** Окно врача — слева внизу: кто вы сейчас, уровень, «Свои больные», ваши больные списками. */
export function Dock({ hud, actions }: { hud: Hud; actions: Actions }) {
  const d = hud.doctor;
  const st = d?.state;
  if (!d || !st) return null;
  const t = T.doctor;
  const take = (id: string) => actions.doctor({ kind: 'take', id });
  const open = (id: string) => actions.doctor({ kind: 'open', id });
  const free = !st.current;
  const status = !st.office ? t.noOffice : st.current ? t.leading(st.current.who) : t.free;
  if (d.folded)
    return (
      <div className="dock panel folded" id="dock">
        <button type="button" id="dock-unfold" onClick={() => actions.doctor({ kind: 'fold', folded: false })}>
          ▸ {t.title} · {status}
          {st.yours.length > 0 ? ` · ${t.lists.yours}: ${st.yours.length}` : ''}
        </button>
      </div>
    );
  return (
    <div className="dock panel" id="dock">
      <div className="row">
        <b>{t.title}</b>
        <span className="muted" id="dock-status">
          {status}
        </span>
        <button type="button" className="close" onClick={() => actions.doctor({ kind: 'fold', folded: true })}>
          ▾
        </button>
      </div>
      {!st.office ? <p className="muted small">{t.noOfficeHint}</p> : null}
      {d.said ? (
        <div className={`ghostline ${d.said.ok ? 'ok' : 'bad'}`} id="dock-said">
          {d.said.text}
        </div>
      ) : null}
      <Levels level={d.level} actions={actions} prefix="dock" />
      <Mine mine={st.mine} open={d.mineOpen} actions={actions} />
      <div className="dlists">
        {st.current ? (
          <>
            <div className="label">{t.lists.office}</div>
            <ul>
              <Row r={st.current}>
                <button type="button" id="dock-open" className="small on" onClick={() => open(st.current!.id)}>
                  {t.openCard}
                </button>
              </Row>
            </ul>
          </>
        ) : null}
        <div className="label">{t.lists.yours}</div>
        {st.yours.length === 0 ? <p className="muted small">{t.nobody}</p> : null}
        <ul>
          {st.yours.map(r => (
            <Row key={r.id} r={r} hint={r.why ? t.why[r.why] : undefined}>
              <button type="button" className="small" disabled={!free || !st.office} onClick={() => take(r.id)}>
                {t.call}
              </button>
            </Row>
          ))}
        </ul>
        {st.others.length > 0 ? (
          <>
            <div className="label">{t.lists.others}</div>
            <ul>
              {st.others.map(r => (
                <Row key={r.id} r={r}>
                  <button type="button" className="small" disabled={!free || !st.office} onClick={() => take(r.id)}>
                    {t.call}
                  </button>
                </Row>
              ))}
            </ul>
            {st.othersMore > 0 ? <p className="muted small">{t.more(st.othersMore)}</p> : null}
          </>
        ) : null}
        {st.away.length > 0 ? (
          <>
            <div className="label">{t.lists.away}</div>
            <ul>
              {st.away.map(r => (
                <Row key={r.id} r={r} hint={r.ready !== undefined ? t.ready(clock(r.ready)) : undefined}>
                  <button type="button" className="small" onClick={() => open(r.id)}>
                    {t.openCard}
                  </button>
                </Row>
              ))}
            </ul>
          </>
        ) : null}
        {st.ward.length > 0 ? (
          <>
            <div className="label">{t.lists.ward}</div>
            <ul>
              {st.ward.map(r => (
                <Row key={r.id} r={r} hint={`${r.diagnosis} · ${T.case.ward.days(r.days, r.norm)} · ${T.case.ward.state[r.state]}`}>
                  <button type="button" className="small" disabled={r.busy} onClick={() => actions.doctor({ kind: 'ward', id: r.id, how: 'discharge' })}>
                    {T.case.ward.discharge}
                  </button>
                  <button type="button" className="small" onClick={() => actions.doctor({ kind: 'ward', id: r.id, how: 'transfer' })}>
                    {T.case.ward.transfer}
                  </button>
                </Row>
              ))}
            </ul>
          </>
        ) : null}
        {st.closed.length > 0 ? (
          <>
            <div className="label">{t.lists.closed}</div>
            <ul>
              {st.closed.slice(0, 6).map(r => (
                <Row key={r.id} r={r} hint={`${VERDICT[r.verdict]} ${r.diagnosis} · ${r.overall}`}>
                  <button type="button" className="small" id={`dock-review-${r.id}`} onClick={() => open(r.id)}>
                    {t.review}
                  </button>
                </Row>
              ))}
            </ul>
          </>
        ) : null}
      </div>
    </div>
  );
}

/** «Свои больные» — плитки групп болезней (команда `mine` движка). */
function Mine({ mine, open, actions }: { mine: BodySystem[]; open: boolean; actions: Actions }) {
  const t = T.doctor;
  const names = T.case.decision.system;
  const toggle = (x: BodySystem) => actions.doctor({ kind: 'mine', systems: mine.includes(x) ? mine.filter(y => y !== x) : [...mine, x] });
  return (
    <div className="mine" id="mine">
      <div className="row">
        <span className="label">{t.mine}</span>
        <span className="small" id="mine-list" title={t.mineHint}>
          {mine.length ? mine.map(x => names[x]).join(', ') : <span className="muted">{t.mineNone}</span>}
        </span>
        <button type="button" id="mine-edit" className="small" onClick={() => actions.doctor({ kind: 'mineOpen', open: !open })}>
          {open ? t.mineDone : t.mineEdit}
        </button>
      </div>
      {open ? (
        <div className="tiles">
          {SYSTEMS.map(x => (
            <button key={x} type="button" id={`mine-${x}`} className={mine.includes(x) ? 'on' : undefined} onClick={() => toggle(x)}>
              {names[x]}
            </button>
          ))}
        </div>
      ) : null}
    </div>
  );
}

/** Вкладка «Просят посмотреть»: просьбы нанятых врачей с ответами; автопауза. */
export function Asks({ hud, actions }: { hud: Hud; actions: Actions }) {
  const d = hud.doctor;
  const st = d?.state;
  const t = T.doctor.asks;
  if (!d || !st) return null;
  return (
    <div id="asks">
      <label className="small">
        <input type="checkbox" id="asks-autopause" checked={d.autopause} onChange={e => actions.doctor({ kind: 'autopause', on: e.target.checked })} /> {t.autopause}
      </label>
      {st.asks.length === 0 ? <p className="muted small">{t.empty}</p> : null}
      <ul>
        {st.asks.map(a => (
          <Ask key={a.id} a={a} colleagues={st.colleagues.filter(c => c.id !== a.by)} actions={actions} />
        ))}
      </ul>
    </div>
  );
}

function Ask({ a, colleagues, actions }: { a: AskRow; colleagues: { id: string; role: string; skill: number }[]; actions: Actions }) {
  const t = T.doctor.asks;
  const [to, setTo] = useState('');
  return (
    <li className={`ask t-${a.triage}`} id={`ask-${a.id}`}>
      <div>
        <b>{t.by(a.role, a.skill)}</b> {t.about(a.who)}
      </div>
      <div className="small">«{a.complaint}»</div>
      <div className="small muted">
        {a.why.map(w => t.why[w]).join(', ')}
        {a.lead[0] ? ` · ${t.thinks(a.lead[0].name, a.lead[0].p)}` : ''}
        {a.lead[1] ? ` · ${t.second(a.lead[1].name, a.lead[1].p)}` : ''}
      </div>
      <div className="small muted">{t.until(clock(a.until))}</div>
      <div className="row">
        <button type="button" id={`ask-look-${a.id}`} className="on" onClick={() => actions.doctor({ kind: 'take', id: a.id })}>
          {t.look}
        </button>
        <button type="button" id={`ask-self-${a.id}`} onClick={() => actions.doctor({ kind: 'consult', id: a.id, answer: 'self' })}>
          {t.self}
        </button>
        <select
          id={`ask-refer-${a.id}`}
          value={to}
          disabled={colleagues.length === 0}
          title={colleagues.length === 0 ? t.noRefer : undefined}
          onChange={e => {
            setTo(e.target.value);
            if (e.target.value) actions.doctor({ kind: 'consult', id: a.id, answer: 'refer', to: e.target.value });
          }}
        >
          <option value="">{t.refer}</option>
          {colleagues.map(c => (
            <option key={c.id} value={c.id}>
              {t.referTo(c.role, c.skill)}
            </option>
          ))}
        </select>
      </div>
    </li>
  );
}

/** «Взять случай» в карточке пациента (spec, «"Взять случай"»). */
export function TakeCase({ info, said, actions }: { info: Extract<PersonInfo, { kind: 'patient' }>; said?: { ok: boolean; text: string }; actions: Actions }) {
  return (
    <div className="row">
      <button type="button" id="card-take" className="on" title={T.doctor.takeHint} onClick={() => actions.doctor({ kind: 'take', id: info.id })}>
        {T.doctor.take}
      </button>
      {said ? <span className={`small ${said.ok ? 'ok' : 'bad'}`} id="card-said">{said.text}</span> : null}
    </div>
  );
}

/** «Мой кабинет» в карточке кабинета врача (spec, «Ваш кабинет»). */
export function OfficeRow({ r, hud, actions }: { r: RoomCard; hud: Hud; actions: Actions }) {
  if (!r.posts?.some(p => p.role === 'role.doctor')) return null;
  const t = T.doctor.office2;
  const mine = hud.doctor?.state?.office === r.id;
  return (
    <div className="row">
      {mine ? (
        <>
          <span className="state ok">{t.yours}</span>
          <button type="button" id="office-off" title={t.offHint} onClick={() => actions.doctor({ kind: 'office' })}>
            {t.off}
          </button>
        </>
      ) : (
        <button type="button" id="office-mine" title={t.mineHint} onClick={() => actions.doctor({ kind: 'office', room: r.id })}>
          {t.mine}
        </button>
      )}
    </div>
  );
}
