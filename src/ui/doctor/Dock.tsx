// Окно врача, вкладка «Просят посмотреть», «Взять случай» и «Мой кабинет» (spec docs/specs/2026-10-doctor-mode.md, «Как
// случай становится вашим», «Ваш кабинет»). Списки приходят из потока расчёта словами (src/sim/doctor.ts): правды о
// больных в них нет.
import { type ReactNode, useState } from 'react';
import { type BodySystem, SYSTEMS } from '../../content/types';
import { clock, T } from '../../i18n';
import type { PersonInfo } from '../../render/population';
import { AGREE_ALL, type AskRow, type DecisionRow, type PatientRow, type WardRow } from '../../sim/doctor';
import { ASK_RULES, DEFAULT_ASKS } from '../../engine/shift/approve';
import type { AskRule } from '../../engine/shift/types';
import type { Actions, Hud, RoomCard } from '../store';
import { Levels } from './Card';
import { type Role, ROLES } from '../../app/roles';
import { Icon } from '../icons';

function Row({ r, children, hint, find }: { r: PatientRow; children?: ReactNode; hint?: string; find?: (id: string) => void }) {
  return (
    <li className={`prow t-${r.triage}`} id={`dr-${r.id}`}>
      <span className="who">
        {r.who}
        <small className="muted">
          {' '}
          «{r.complaint}»{hint ? ` · ${hint}` : ''}
        </small>
      </span>
      {find ? <Find id={r.id} find={find} /> : null}
      {children}
    </li>
  );
}

/** «Открыть карту» (spec docs/specs/2026-10-owner-play-2.md): у любого пациента; чужая — для чтения, часы идут. */
function OpenCard({ id, open, prefix = 'open', on }: { id: string; open: (id: string) => void; prefix?: string; on?: boolean }) {
  return (
    <button type="button" className={on ? 'small on' : 'small'} id={`${prefix}-${id}`} onClick={() => open(id)}>
      {T.doctor.openCard}
    </button>
  );
}

/** «Найти» (spec docs/specs/2026-10-owner-play.md): камера к пациенту и его карточка на карте. */
function Find({ id, find, prefix = 'find' }: { id: string; find: (id: string) => void; prefix?: string }) {
  return (
    <button type="button" className="small" id={`${prefix}-${id}`} title={T.doctor.findHint} onClick={() => find(id)}>
      {T.doctor.find}
    </button>
  );
}

/** «Кто вы» (spec docs/specs/2026-10-two-ways.md, F4; решение владельца #67): роль ставит настройки разом; выбранная — подсвечена. */
function RoleRow({ role, actions }: { role: Role; actions: Actions }) {
  const t = T.doctor.role;
  return (
    <div className="row roles" id="dock-roles" title={t.hint}>
      <span className="label">{t.label}</span>
      <span className="group">
        {ROLES.map(r => (
          <button key={r} type="button" className={r === role ? 'small on' : 'small'} id={`role-${r}`} title={t.line[r]} onClick={() => actions.doctor({ kind: 'role', role: r })}>
            {t.name[r]}
          </button>
        ))}
      </span>
    </div>
  );
}

/** Окно врача — слева внизу: кто вы сейчас, роль, уровень, «Свои больные», ваши больные списками. */
export function Dock({ hud, actions }: { hud: Hud; actions: Actions }) {
  const d = hud.doctor;
  const st = d?.state;
  if (!d || !st) return null;
  const t = T.doctor;
  const take = (id: string) => actions.doctor({ kind: 'take', id });
  const open = (id: string) => actions.doctor({ kind: 'open', id });
  const find = (id: string) => actions.find(id);
  const free = !st.current;
  const status = !st.office ? t.noOffice : st.current ? t.leading(st.current.who) : t.free;
  if (d.folded)
    return (
      <div className="dock panel folded" id="dock">
        <button type="button" id="dock-unfold" onClick={() => actions.doctor({ kind: 'fold', folded: false })}>
          <Icon name="open" /> {t.role.title[d.role]} · {status}
          {st.yours.length > 0 ? ` · ${t.lists.yours}: ${st.yours.length}` : ''}
        </button>
      </div>
    );
  return (
    <div className="dock panel" id="dock">
      <div className="row">
        <b id="dock-title">{t.role.title[d.role]}</b>
        <span className="muted" id="dock-status">
          {status}
        </span>
        <button type="button" className="close" onClick={() => actions.doctor({ kind: 'fold', folded: true })}>
          <Icon name="fold" />
        </button>
      </div>
      {/* сценарий кампании — в роли «Врач», без смены (решение владельца #115: цель считает только ваши приёмы) */}
      {hud.scenario ? null : <RoleRow role={d.role} actions={actions} />}
      {/* отметить свой кабинет — совет «Врачу»; у «Главврача» и «Управляющего» своего кабинета и нет (F4) */}
      {!st.office && d.role === 'doctor' ? <p className="muted small">{t.noOfficeHint}</p> : null}
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
            {/* позвали — идёт к вам; на обследовании в другом кабинете — когда вернётся (spec 2026-10-owner-play-2) */}
            <div className="label">{st.current.coming !== undefined ? t.lists.coming : t.lists.office}</div>
            <ul>
              <Row
                r={st.current}
                find={find}
                hint={st.current.coming !== undefined ? t.comingAt(clock(st.current.coming)) : st.current.back !== undefined ? t.backAt(clock(st.current.back)) : undefined}
              >
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
            <Row key={r.id} r={r} hint={r.why ? t.why[r.why] : undefined} find={find}>
              <OpenCard id={r.id} open={open} />
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
                <Row key={r.id} r={r} find={find}>
                  <OpenCard id={r.id} open={open} />
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
                <Row key={r.id} r={r} hint={r.ready !== undefined ? t.ready(clock(r.ready)) : undefined} find={find}>
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
            <ul id="dock-ward">
              {st.ward.map(r => (
                <WardItem key={r.id} r={r} worse={d.worse?.includes(r.id) ?? false} actions={actions} />
              ))}
            </ul>
          </>
        ) : null}
        {/* лежащие у нанятых врачей (spec docs/specs/2026-10-two-ways.md, F2): свёрнуты, их бывает много */}
        {st.theirs.length > 0 ? (
          <>
            <button type="button" className="small" id="dock-theirs" onClick={() => actions.doctor({ kind: 'theirsOpen', open: !d.theirsOpen })}>
              <Icon name={d.theirsOpen ? 'fold' : 'open'} /> {t.lists.theirs(st.theirs.length)}
            </button>
            {d.theirsOpen ? (
              <ul id="dock-theirs-list">
                {st.theirs.map(r => (
                  <WardItem key={r.id} r={r} worse={false} actions={actions} />
                ))}
              </ul>
            ) : null}
          </>
        ) : null}
        {st.closed.length > 0 ? (
          <>
            <div className="label">{t.lists.closed}</div>
            <ul>
              {st.closed.slice(0, 6).map(r => (
                <Row key={r.id} r={r} hint={`${T.case.patient[r.verdict]} — ${r.diagnosis} · ${r.overall}`}>
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

/**
 * Строка «Обхода» (spec docs/specs/2026-10-economy.md, «Обход»): как идёт, динамика витальных, лечение, операция; «Сменить
 * лечение» открывает карту с листом назначений, «Выписать», «Перевести», «В операционную». Стало хуже в 08:00 — отмечена.
 */
function WardItem({ r, worse, actions }: { r: WardRow; worse: boolean; actions: Actions }) {
  const w = T.case.ward;
  return (
    <li className={`prow ward t-${r.triage}${worse ? ' worse' : ''}`} id={`dw-${r.id}`}>
      <div className="who">
        {r.who}
        <div className="small">
          {r.diagnosis} · {w.days(r.days, r.norm)}
        </div>
        <div className={`small ${r.state === 'worse' || r.state === 'reaction' ? 'bad' : r.state === 'ready' || r.state === 'better' ? 'ok' : 'muted'}`}>
          {worse ? (
            <>
              <Icon name="warn" /> {T.round.worseShort} ·{' '}
            </>
          ) : null}
          {r.stateText}
        </div>
        {r.unit ? <div className="small muted">{r.unit}</div> : null}
        {r.vitals.map(v => (
          <div key={v.label} className="small muted mono">
            {v.label}: {v.values}
          </div>
        ))}
        {r.op ? <div className="small">{r.op}</div> : null}
        <div className="small muted">{T.round.treatments(r.treatments)}</div>
        {r.by ? <div className="small muted">{T.card.by}: {r.by}</div> : null}
        {/* врач предлагает выписать (spec docs/specs/2026-10-two-ways.md, F3) */}
        {r.approve ? (
          <div className="small approve" id={`ward-approve-${r.id}`}>
            {r.approve}
          </div>
        ) : null}
        <div className="row">
          <Find id={r.id} find={actions.find} prefix="ward-find" />
          <button type="button" className="small" id={`ward-replan-${r.id}`} title={T.round.replanHint} onClick={() => actions.doctor({ kind: 'open', id: r.id })}>
            {T.round.replan}
          </button>
          <button type="button" className="small" id={`ward-discharge-${r.id}`} disabled={!r.canDischarge} onClick={() => actions.doctor({ kind: 'ward', id: r.id, how: 'discharge' })}>
            {w.discharge}
          </button>
          {r.approve ? (
            <button type="button" className="small" id={`ward-stay-${r.id}`} onClick={() => actions.doctor({ kind: 'approve', id: r.id, answer: 'stay' })}>
              {T.doctor.asks.stay}
            </button>
          ) : null}
          <button type="button" className="small" disabled={!r.canTransfer} onClick={() => actions.doctor({ kind: 'ward', id: r.id, how: 'transfer' })}>
            {w.transfer}
          </button>
          {r.operate ? (
            <button type="button" className="small" disabled={r.operate.disabled} title={r.operate.hint} onClick={() => actions.doctor({ kind: 'ward', id: r.id, how: 'operate' })}>
              {T.round.operate}
            </button>
          ) : null}
        </div>
      </div>
    </li>
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

/**
 * Вкладка «Просят посмотреть»: просьбы нанятых врачей с ответами; автопауза; о чём спрашивать главврача и решения врачей на
 * утверждении (spec docs/specs/2026-10-two-ways.md, F3).
 */
export function Asks({ hud, actions }: { hud: Hud; actions: Actions }) {
  const d = hud.doctor;
  const st = d?.state;
  const t = T.doctor.asks;
  if (!d || !st) return null;
  const sure = st.decisions.filter(x => x.p !== undefined && x.p >= AGREE_ALL).length;
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
      <div className="label">{t.decisions}</div>
      {st.decisions.length === 0 ? (
        <p className="muted small" id="decisions-empty">
          {t.decisionsEmpty}
        </p>
      ) : (
        <>
          <div className="row">
            <button type="button" id="agree-all" disabled={sure === 0} onClick={() => actions.doctor({ kind: 'agreeAll' })}>
              {t.agreeAll(sure)}
            </button>
          </div>
          <p className="muted small">{t.keys}</p>
        </>
      )}
      <ul id="decisions">
        {st.decisions.map(x => (
          <Decision key={x.id} x={x} colleagues={st.colleagues.filter(c => c.id !== x.by)} actions={actions} />
        ))}
      </ul>
      <Rules rules={st.rules} actions={actions} />
    </div>
  );
}

/**
 * О чём спрашивать главврача (spec docs/specs/2026-10-two-ways.md, F3): строкой — что отмечено, «Изменить» — галочки; «ни о
 * чём» снимает все. Внизу вкладки: сверху — то, на что отвечать.
 */
function Rules({ rules, actions }: { rules: AskRule[]; actions: Actions }) {
  const t = T.doctor.asks;
  const [open, setOpen] = useState(false);
  const set = (next: AskRule[]) => actions.doctor({ kind: 'asks', rules: next });
  return (
    <div className="rules" id="ask-rules" title={t.rulesHint}>
      <div className="row">
        <span className="label">{t.rules}</span>
        <button type="button" id="rules-edit" className="small" onClick={() => setOpen(!open)}>
          {open ? T.doctor.mineDone : T.doctor.mineEdit}
        </button>
      </div>
      <div className="small" id="rules-list">
        {rules.length > 0 ? ASK_RULES.filter(r => rules.includes(r)).map(r => t.rule[r]).join(', ') : t.rule.never}
      </div>
      {open ? (
        <>
          {ASK_RULES.map(r => (
            <label key={r} className="small">
              <input type="checkbox" id={`rule-${r}`} checked={rules.includes(r)} onChange={() => set(rules.includes(r) ? rules.filter(x => x !== r) : [...rules, r])} /> {t.rule[r]}
            </label>
          ))}
          <label className="small">
            <input type="checkbox" id="rule-never" checked={rules.length === 0} onChange={() => set(rules.length === 0 ? [...DEFAULT_ASKS] : [])} /> {t.rule.never}
          </label>
          <p className="muted small">{t.rulesHint}</p>
        </>
      ) : null}
    </div>
  );
}

/**
 * Решение врача на утверждении: «Терапевт, навык 3 · Иванова, 67 · пневмония — 7 из 10 · амоксициллин · дома»; «Согласен»,
 * «Карта», «Ещё обследование», «Взять», «Направить к …»; выписка — «Выписать», «Ещё сутки», «Карта».
 */
function Decision({ x, colleagues, actions }: { x: DecisionRow; colleagues: { id: string; role: string; skill: number }[]; actions: Actions }) {
  const t = T.doctor.asks;
  const [to, setTo] = useState('');
  const open = () => actions.doctor({ kind: 'open', id: x.id });
  return (
    <li className={`ask decision t-${x.triage}`} id={`dec-${x.id}`}>
      <div>
        <b>{t.by(x.role, x.skill)}</b> · {x.who}
      </div>
      <div className="small" id={`dec-text-${x.id}`}>
        {x.decided ?? x.discharge}
      </div>
      <div className="small muted">
        {x.why.map(w => t.decisionWhy[w]).join(', ')} · {t.until(clock(x.until))}
      </div>
      <div className="row">
        <button type="button" id={`dec-agree-${x.id}`} className="on" onClick={() => actions.doctor({ kind: 'approve', id: x.id, answer: 'agree' })}>
          {x.discharge !== undefined ? t.dischargeNow : t.agree}
        </button>
        <button type="button" id={`dec-view-${x.id}`} title={T.doctor.viewHint} onClick={open}>
          {T.doctor.view}
        </button>
        {x.discharge !== undefined ? (
          <button type="button" id={`dec-stay-${x.id}`} onClick={() => actions.doctor({ kind: 'approve', id: x.id, answer: 'stay' })}>
            {t.stay}
          </button>
        ) : (
          <>
            <button type="button" id={`dec-exam-${x.id}`} title={t.examHint} onClick={open}>
              {t.exam}
            </button>
            <button type="button" id={`dec-take-${x.id}`} title={T.doctor.takeHint} onClick={() => actions.doctor({ kind: 'approve', id: x.id, answer: 'take' })}>
              {t.take}
            </button>
            <select
              id={`dec-refer-${x.id}`}
              value={to}
              disabled={colleagues.length === 0}
              title={colleagues.length === 0 ? t.noRefer : undefined}
              onChange={e => {
                setTo(e.target.value);
                if (e.target.value) actions.doctor({ kind: 'approve', id: x.id, answer: 'refer', to: e.target.value });
              }}
            >
              <option value="">{t.refer}</option>
              {colleagues.map(c => (
                <option key={c.id} value={c.id}>
                  {t.referTo(c.role, c.skill)}
                </option>
              ))}
            </select>
          </>
        )}
        <Find id={x.id} find={actions.find} prefix="dec-find" />
      </div>
    </li>
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
        {/* посмотреть, не забирая (spec docs/specs/2026-10-two-ways.md, F1) */}
        <button type="button" id={`ask-view-${a.id}`} title={T.doctor.viewHint} onClick={() => actions.doctor({ kind: 'open', id: a.id })}>
          {T.doctor.openCard}
        </button>
        <Find id={a.id} find={actions.find} prefix="ask-find" />
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

/**
 * «Взять случай» в карточке пациента (spec, «"Взять случай"»); ушедший — только «Открыть карту»: она хранится сутки (spec
 * docs/specs/2026-10-discharged-card.md).
 */
export function TakeCase({ info, said, actions }: { info: Extract<PersonInfo, { kind: 'patient' }>; said?: { ok: boolean; text: string }; actions: Actions }) {
  return (
    <div className="row">
      {info.gone ? null : (
        <button type="button" id="card-take" className="on" title={T.doctor.takeHint} onClick={() => actions.doctor({ kind: 'take', id: info.id })}>
          {T.doctor.take}
        </button>
      )}
      {/* карта больного — посмотреть, не забирая (spec docs/specs/2026-10-two-ways.md, F1) */}
      <button type="button" id="card-view" title={T.doctor.viewHint} onClick={() => actions.doctor({ kind: 'open', id: info.id })}>
        {T.doctor.openCard}
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
