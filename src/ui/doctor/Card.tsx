// Карта пациента на ПК (spec docs/specs/2026-10-doctor-mode.md, «Карта пациента»; геймдизайн §6): большое окно поверх
// карты, шапка и три колонки — опрос · осмотр и результаты · гипотезы и решение; после «Завершить приём» — итог и разбор.
// Приём «Анамнеза» целиком (его PatientCard, Talk, Examine, Referral, Differential, DecisionScreen, OutcomeScreen —
// логика та же, разметка своя). Вид приходит из потока расчёта готовым (правды в нём нет); отсюда — только знание о
// медицине из базы: списки обследований, их минуты и цена, «Что это?».
import { memo, type ReactNode, useState } from 'react';
import type { Id } from '../../content/types';
import type { Command, Difficulty } from '../../engine/shift/types';
import { money, T } from '../../i18n';
import {
  conditionTerm, examInfo, examsByAction, examTerm, findingInfo, lifeHistory, type Line, type ResultGroup, type TermInfo, treatmentTerm,
} from '../../sim/caseView';
import { type CardView, LEVELS } from '../../sim/doctor';
import type { Actions } from '../store';
import { BODY_PLACES, type ExamPlace, placeOf, SHELVES } from './places';
import { SECTIONS, sectionOf } from './sections';
import type { DoctorHud } from './types';
import { db } from './db';

/** Ключ для id в DOM: точки в номерах базы мешают селекторам. */
export const dom = (id: string) => id.replace(/\./g, '_');

const found = (g: ResultGroup) => g.lines.some((l: Line) => l.shown);

interface P {
  v: CardView;
  level: DoctorHud['level'];
  meanwhile: DoctorHud['meanwhile'];
  /** кого позвать после разбора: первый из ждущих вас, нет — из общей очереди; вы заняты — никого */
  next?: { id: string; who: string };
  actions: Actions;
}

/**
 * Карта перерисовывается, только когда пришёл новый вид, уровень или «За это время»: панели обновляются 10 раз в секунду,
 * а в карте — сотни строк.
 */
export const Card = memo(CardWindow);

function CardWindow({ v, level, meanwhile, next, actions }: P) {
  const t = T.case.patient;
  const c = T.doctor.card;
  const [term, setTerm] = useState<TermInfo | null>(null);
  const act = (cmd: Command) => actions.doctor({ kind: 'act', cmd });
  const pending = (v.pending.length > 0 || !!v.away) && !v.decision && v.active;
  const stepOut = !pending && !!v.canStepOut && v.active && !v.decision;
  return (
    <div className="dcard panel" id="dcard" role="dialog" aria-labelledby="dcard-title">
      <div className="dhead">
        <div className="dtitle">
          <b id="dcard-title">{v.title}</b>
          {v.job ? <span className="muted"> · {v.job}</span> : null}
          <span className="mono" id="dcard-clock">
            {' '}
            · {v.clock} · {t.spentShort(v.minutesSpent, money(v.money))}
          </span>
        </div>
        <Levels level={level} actions={actions} prefix="card" />
        <button type="button" id="dcard-close" className="close" onClick={() => actions.doctor({ kind: 'close' })} title={`Esc — ${c.closeHint}`}>
          ✕ {c.close}
        </button>
      </div>
      <div className="dsub">
        {v.complaints.length === 0 ? (
          <span className="muted">{t.checkup(v.portrait.sex === 'f')}</span>
        ) : (
          v.complaints.map(x => (
            <button key={x.f} type="button" className="said" onClick={() => setTerm(findingInfo(x.f))}>
              «{x.text}»
            </button>
          ))
        )}
        {v.targets?.map((x, i) => (x.done ? null : <div key={i} className="dtarget">{x.text}</div>))}
        {v.returnNote ? <div className="muted">{v.returnNote}</div> : null}
      </div>
      {!v.active && !v.decision ? (
        <div className="dbanner" id="dcard-where">
          {c.notActive[v.where ?? 'other']}
          {v.callable ? (
            <button type="button" id="dcard-call" onClick={() => actions.doctor({ kind: 'take', id: v.id })}>
              {T.doctor.call}
            </button>
          ) : null}
        </div>
      ) : null}
      {v.hints.length > 0 && !v.decision ? (
        <div className="dlikely" id="dcard-likely">
          <b>{t.likelyShort}:</b> {v.hints.map(h => `${h.name} — ${h.word ?? t.outOf10(h.outOf10)}`).join(' · ')}
        </div>
      ) : null}
      {meanwhile.length > 0 ? (
        <div className="dmeanwhile" id="dcard-meanwhile">
          <b>{t.meanwhile}:</b> {meanwhile.join('; ')}
        </div>
      ) : null}
      {pending ? (
        <div className="dwait" id="dcard-pending">
          <span>
            {v.away ? <span>{v.away} </span> : null}
            {v.pending.length > 0 ? t.waiting(v.pending.map(p => t.pendingShort(p.name, p.at)).join('; ')) : null}
          </span>
          {v.canSendAway ? (
            <button type="button" id="dcard-away" title={t.sendAwayHint} onClick={() => act({ kind: 'sendAway' })}>
              {t.sendAwayShort}
            </button>
          ) : null}
          <button type="button" id="dcard-wait" className="on" title={t.waitHint} onClick={() => act({ kind: 'waitResults' })}>
            {t.waitShort}
          </button>
        </div>
      ) : stepOut ? (
        <div className="dwait">
          <span>{t.urgentWaiting}</span>
          <button type="button" id="dcard-stepout" title={t.stepOutHint} onClick={() => act({ kind: 'sendAway' })}>
            {t.stepOut}
          </button>
        </div>
      ) : null}
      {v.decision ? (
        <Review v={v} next={next} actions={actions} explain={setTerm} />
      ) : (
        <div className="dcols">
          <TalkColumn v={v} act={act} explain={setTerm} />
          <ExamColumn v={v} act={act} actions={actions} explain={setTerm} />
          <DecideColumn v={v} act={act} explain={setTerm} />
        </div>
      )}
      {term ? <TermPopup term={term} close={() => setTerm(null)} /> : null}
    </div>
  );
}

/** Уровень медицины — четыре кнопки (spec «Сложность»). */
export function Levels({ level, actions, prefix }: { level: Difficulty; actions: Actions; prefix: string }) {
  return (
    <span className="group dlevels" title={T.doctor.levelHint}>
      <span className="label">{T.doctor.level}</span>
      {LEVELS.map(l => (
        <button key={l} type="button" id={`${prefix}-lvl-${l}`} className={l === level ? 'on' : undefined} onClick={() => actions.doctor({ kind: 'level', level: l })}>
          {T.doctor.levels[l]}
        </button>
      ))}
    </span>
  );
}

function Section({ title, extra, children, id, open: start = true }: { title: string; extra?: ReactNode; children: ReactNode; id?: string; open?: boolean }) {
  const [open, setOpen] = useState(start);
  return (
    <div className="dsec" id={id}>
      <button type="button" className="dsechead" onClick={() => setOpen(!open)} aria-expanded={open}>
        <span>{open ? '▾' : '▸'} {title}</span>
        {extra ? <small>{extra}</small> : null}
      </button>
      {open ? <div className="dsecbody">{children}</div> : null}
    </div>
  );
}

/** Строки ответа: найденное — жирным; «нет» — до трёх, остальное — «ещё N без особенностей» (Talk.tsx «Анамнеза»). */
function Answer({ g, explain, all }: { g: ResultGroup; explain: (x: TermInfo) => void; all?: boolean }) {
  const [open, setOpen] = useState(false);
  const yes = g.lines.filter(l => l.shown);
  const no = g.lines.filter(l => !l.shown);
  const showNo = all || open || g.fresh ? no : no.slice(0, Math.max(0, 3 - yes.length));
  const more = no.length - showNo.length;
  return (
    <span className="answer">
      {[...yes, ...showNo].map((l, i) => (
        <button key={`${l.f}${i}`} type="button" className={l.shown ? 'line yes' : 'line'} onClick={() => explain(findingInfo(l.f))}>
          {l.text}
        </button>
      ))}
      {g.lines.length === 0 ? <span className="muted">{T.case.talk.nothing}</span> : null}
      {more > 0 ? (
        <button type="button" className="line more" onClick={() => setOpen(true)}>
          {T.case.patient.moreQuiet(more)}
        </button>
      ) : null}
    </span>
  );
}

/** Опрос — беседой: заданные вопросы и ответы по порядку; вопросы — «О жалобах» и «О жизни». */
function TalkColumn({ v, act, explain }: { v: CardView; act: (c: Command) => void; explain: (x: TermInfo) => void }) {
  const t = T.case.talk;
  const p = T.case.patient;
  const [rest, setRest] = useState(false);
  const ids = examsByAction(v.portrait).ask;
  const asks = new Set(ids);
  const asked = [...v.groups].reverse().filter(g => asks.has(g.exam));
  const focus = v.focus ? new Set(v.focus) : undefined;
  const main = focus ? ids.filter(id => focus.has(id)) : ids;
  const others = focus ? ids.filter(id => !focus.has(id)) : [];
  const left = [...main, ...(rest ? others : [])].filter(id => !v.done.includes(id));
  const restLeft = others.filter(id => !v.done.includes(id)).length;
  const question = (id: Id) => t.questions[id] ?? examInfo(id).name;
  const button = (id: Id) => {
    const why = v.unavailable[id];
    const info = examInfo(id);
    return (
      <button key={id} type="button" id={`q-${dom(id)}`} data-exam={id} className="q" disabled={!!why || !v.active} title={why ?? info.name} onClick={() => act({ kind: 'exam', exam: id })}>
        {question(id)} <small>{p.cost(v.minutes?.[id] ?? info.minutes, info.cost)}</small>
        <Info onClick={() => explain(examTerm(id))} />
      </button>
    );
  };
  return (
    <div className="dcol" id="col-talk">
      <h3>{T.doctor.card.talk}</h3>
      <div className="talk" id="talk">
        {asked.length === 0 ? <p className="muted">{t.empty}</p> : null}
        {asked.map(g => (
          <div key={g.key} className={g.fresh ? 'pair fresh' : 'pair'} id={`said-${dom(g.exam)}`}>
            <div className="doc">
              <small className="mono">{g.at}</small> {question(g.exam)}
            </div>
            <div className="pt">
              <Answer g={g} explain={explain} />
            </div>
          </div>
        ))}
      </div>
      {v.active ? (
        <div className="questions">
          {focus ? <p className="muted small">{p.focusNote}</p> : null}
          {[
            { key: 'c', title: t.aboutComplaints, list: left.filter(id => !lifeHistory(id)) },
            { key: 'l', title: t.aboutLife, list: left.filter(lifeHistory) },
          ]
            .filter(x => x.list.length > 0)
            .map(x => (
              <div key={x.key}>
                <div className="label">{x.title}</div>
                <div className="qs">{x.list.map(button)}</div>
              </div>
            ))}
          {restLeft > 0 ? (
            <button type="button" className="linkish" onClick={() => setRest(!rest)}>
              {rest ? p.restHide : p.restShow(restLeft)}
            </button>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}

/** «?» — справка из базы (её поле `hint`). */
function Info({ onClick }: { onClick: () => void }) {
  return (
    <span
      role="button"
      tabIndex={0}
      className="info"
      title={T.case.patient.whatIsIt}
      onClick={e => {
        e.stopPropagation();
        onClick();
      }}
      onKeyDown={e => {
        if (e.key === 'Enter') {
          e.stopPropagation();
          onClick();
        }
      }}
    >
      ?
    </span>
  );
}

/** Обследование в списке: не сделано — кнопка с минутами и ценой; сделано — ответ на месте; ещё не пришло — штамп. */
function ExamRow({ v, id, onExam, explain, check }: { v: CardView; id: Id; onExam: (id: Id) => void; explain: (x: TermInfo) => void; check?: { on: boolean; toggle: () => void } }) {
  const t = T.case.patient;
  const info = examInfo(id);
  if (v.done.includes(id)) {
    const gs = v.groups.filter(x => x.exam === id);
    const ready = v.pending.find(x => x.exam === id);
    return (
      <div className={gs[0]?.fresh ? 'xrow done fresh' : 'xrow done'} id={`x-${dom(id)}`} data-exam={id}>
        <div className="xhead">
          ✓ {info.name}
          {gs[0]?.fresh ? <span className="new">{t.fresh}</span> : null}
          {ready ? <span className="stamp">{t.readyAt(ready.at)}</span> : null}
        </div>
        {gs.map(g => (
          <Answer key={g.key} g={g} explain={explain} />
        ))}
        {gs.length === 0 && !ready ? <span className="muted">{t.done}</span> : null}
      </div>
    );
  }
  const why = v.unavailable[id];
  const cost = v.bedside?.[id] !== undefined ? t.costBedside(v.bedside[id], info.cost) : t.cost(v.minutes?.[id] ?? info.minutes, info.cost);
  if (check)
    return (
      <label className={why ? 'xrow off' : 'xrow'} title={why ?? undefined} id={`x-${dom(id)}`} data-exam={id}>
        <input type="checkbox" id={`o-${dom(id)}`} data-exam={id} checked={check.on} disabled={!!why || !v.active} onChange={check.toggle} />
        <span>{info.name}</span>
        <small>{why ?? cost}</small>
        <Info onClick={() => explain(examTerm(id))} />
      </label>
    );
  return (
    <button type="button" className="xrow" id={`x-${dom(id)}`} data-exam={id} disabled={!!why || !v.active} title={why ?? undefined} onClick={() => onExam(id)}>
      <span>{info.name}</span>
      <small>{why ?? cost}</small>
      <Info onClick={() => explain(examTerm(id))} />
    </button>
  );
}

type ExamTab = 'examine' | 'order' | 'known';

/** Осмотр по местам на теле, бланк направления по разделам, «Известно» — новое сверху. */
function ExamColumn({ v, act, actions, explain }: { v: CardView; act: (c: Command) => void; actions: Actions; explain: (x: TermInfo) => void }) {
  const p = T.case.patient;
  const r = T.case.referral;
  const c = T.doctor.card;
  const [tab, setTab] = useState<ExamTab>(v.groups.length > 0 && !v.active ? 'known' : 'examine');
  const [marked, setMarked] = useState<Id[]>([]);
  const [query, setQuery] = useState('');
  const groups = examsByAction(v.portrait);
  const focus = v.focus ? new Set(v.focus) : undefined;
  const live = marked.filter(id => !v.done.includes(id) && !v.unavailable[id]);
  const toggle = (id: Id) => setMarked(live.includes(id) ? live.filter(x => x !== id) : [...live, id]);
  const send = () => {
    if (live.length === 0) return;
    actions.doctor({ kind: 'acts', cmds: live.map(exam => ({ kind: 'exam', exam })) });
    setMarked([]);
    setTab('order');
  };
  const longest = live.reduce((m, id) => Math.max(m, v.minutes?.[id] ?? examInfo(id).minutes), 0);
  const loud = v.groups.filter(g => g.fresh || found(g));
  const quiet = v.groups.filter(g => !loud.includes(g));
  let body: ReactNode;
  if (tab === 'examine') {
    const places: ExamPlace[] = [...SHELVES, ...BODY_PLACES];
    const byPlace = (place: ExamPlace) => groups.examine.filter(id => placeOf(id) === place);
    body = (
      <>
        {focus ? (
          <Section title={r.sections.focus} id="ex-focus">
            {groups.examine.filter(id => focus.has(id)).map(id => (
              <ExamRow key={id} v={v} id={id} onExam={x => act({ kind: 'exam', exam: x })} explain={explain} />
            ))}
          </Section>
        ) : null}
        {places
          .map(place => ({ place, ids: byPlace(place) }))
          .filter(x => x.ids.length > 0)
          .map(x => (
            <Section key={x.place} id={`ex-${x.place}`} title={T.case.body.places[x.place]} extra={c.examined(x.ids.filter(id => v.done.includes(id)).length, x.ids.length)} open={x.place === 'whole' || x.place === 'bedside' || x.place === 'chest' || x.place === 'belly'}>
              {x.ids.map(id => (
                <ExamRow key={id} v={v} id={id} onExam={y => act({ kind: 'exam', exam: y })} explain={explain} />
              ))}
            </Section>
          ))}
      </>
    );
  } else if (tab === 'order') {
    const q = query.trim().toLowerCase();
    const ids = q ? groups.order.filter(id => examInfo(id).name.toLowerCase().includes(q)) : groups.order;
    const parts = [
      ...(focus && !q ? [{ key: 'focus', ids: ids.filter(id => focus.has(id)) }] : []),
      ...SECTIONS.map(key => ({ key, ids: ids.filter(id => sectionOf(db().exams[id]) === key) })),
    ].filter(x => x.ids.length > 0);
    body = (
      <>
        <input className="search" id="order-search" value={query} placeholder={r.search} onChange={e => setQuery(e.target.value)} />
        {parts.map(x => (
          <Section key={`${x.key}${q}`} id={`or-${x.key}`} title={r.sections[x.key]} extra={r.state(live.filter(id => x.ids.includes(id)).length, x.ids.filter(id => v.done.includes(id)).length, x.ids.length)} open={!!q || x.key === 'focus' || x.key === 'rapid' || x.key === 'lab'}>
            {x.ids.map(id => (
              <ExamRow key={id} v={v} id={id} onExam={y => act({ kind: 'exam', exam: y })} explain={explain} check={{ on: live.includes(id), toggle: () => toggle(id) }} />
            ))}
          </Section>
        ))}
        {live.length > 0 ? (
          <div className="sendbar" id="order-bar">
            <span id="order-sum">{r.marked(live.length, money(live.reduce((a, id) => a + examInfo(id).cost, 0)), longest)}</span>
            <button type="button" id="order-send" className="on" title={r.sendHint} onClick={send}>
              {r.send}
            </button>
          </div>
        ) : null}
      </>
    );
  } else {
    body = (
      <div id="known">
        {v.groups.length === 0 ? <p className="muted">{p.none}</p> : null}
        {loud.map(g => (
          <div key={g.key} className={g.fresh ? 'kgroup fresh' : 'kgroup'}>
            <div className="xhead">
              {g.name} · {p.at(g.at)} {g.fresh ? <span className="new">{p.fresh}</span> : null}
            </div>
            <Answer g={g} explain={explain} />
          </div>
        ))}
        {quiet.length > 0 ? <p className="muted">{p.quiet(quiet.map(g => g.name).join(', '))}</p> : null}
        {v.targets?.some(x => x.done) ? (
          <>
            <div className="label">{p.targetsDone}</div>
            {v.targets.map((x, i) => (x.done ? <p key={i}>{x.text}</p> : null))}
          </>
        ) : null}
      </div>
    );
  }
  return (
    <div className="dcol" id="col-exam">
      <h3>{c.exam}</h3>
      <div className="dtabs">
        <button type="button" id="tab-examine" className={tab === 'examine' ? 'on' : undefined} onClick={() => setTab('examine')}>
          {c.examine}
        </button>
        <button type="button" id="tab-order" className={tab === 'order' ? 'on' : undefined} onClick={() => setTab('order')}>
          {c.order}
        </button>
        <button type="button" id="tab-known" className={tab === 'known' ? 'on' : undefined} onClick={() => setTab('known')}>
          {c.known}
          {v.freshCount > 0 ? <span className="new" title={p.freshCount(v.freshCount)}>+{v.freshCount}</span> : null}
        </button>
      </div>
      <div className="dscroll">{body}</div>
    </div>
  );
}

/** «Похоже на», ваш ряд гипотез, правила решения, диагноз, лечение, место — и «Завершить приём». */
function DecideColumn({ v, act, explain }: { v: CardView; act: (c: Command) => void; explain: (x: TermInfo) => void }) {
  const p = T.case.patient;
  const d = T.case.decision;
  const h = T.case.differential;
  const c = T.doctor.card;
  const [hyp, setHyp] = useState<Id | null>(null);
  const [adding, setAdding] = useState('');
  const [tx, setTx] = useState('');
  const [rest, setRest] = useState(false);
  const inRow = new Set(v.differential.map(x => x.id));
  const all = v.diagnoses.flatMap(g => g.items);
  const found = adding.trim() ? all.filter(x => x.name.toLowerCase().includes(adding.trim().toLowerCase())).slice(0, 12) : [];
  const top = new Set(v.suggested.map(x => x.id));
  const txFound = tx.trim() ? v.treatments.filter(x => x.name.toLowerCase().includes(tx.trim().toLowerCase())) : undefined;
  const txRow = (x: CardView['treatments'][number]) => {
    const on = v.draft.treatments.includes(x.id);
    return (
      <label key={x.id} className={x.disabled && !on ? 'xrow off' : 'xrow'} id={`txr-${dom(x.id)}`}>
        <input type="checkbox" id={`tx-${dom(x.id)}`} checked={on} disabled={(x.disabled && !on) || !v.active} onChange={() => act({ kind: 'toggleTreatment', id: x.id })} />
        <span>
          {x.name}
          {x.warning ? <small className="warn"> {x.warning}</small> : null}
        </span>
        <Info onClick={() => explain(treatmentTerm(x.id))} />
      </label>
    );
  };
  const open = v.differential.find(x => x.id === hyp);
  const setting = v.settings.find(o => o.key === v.draft.setting)?.title ?? p.setting[v.draft.setting];
  return (
    <div className="dcol" id="col-decide">
      <h3>{c.decide}</h3>
      <div className="dscroll">
        {v.hints.length > 0 ? (
          <Section title={p.likely} id="sec-likely">
            {v.hints.map(x => (
              <div key={x.id} className="hint">
                <span>
                  {x.name} — {x.word ?? p.similar(x.outOf10)}
                </span>
                <button type="button" id={`likely-${dom(x.id)}`} className={inRow.has(x.id) ? 'small on' : 'small'} disabled={!v.active} onClick={() => act({ kind: 'hypothesis', id: x.id })}>
                  {inRow.has(x.id) ? h.inRow : h.toRow}
                </button>
              </div>
            ))}
          </Section>
        ) : null}
        <Section title={h.title} id="sec-hyp">
          {v.differential.length === 0 ? <p className="muted small">{h.empty}</p> : null}
          {v.differential.map(x => (
            <div key={x.id} className={hyp === x.id ? 'hyp open' : 'hyp'}>
              <button type="button" id={`hyp-${dom(x.id)}`} className="hyphead" onClick={() => setHyp(hyp === x.id ? null : x.id)}>
                <span>{x.name}</span>
                <small>{[x.outOf10 !== undefined ? h.outOf10(x.outOf10) : x.word, h.count(x.pro.length, x.con.length)].filter(Boolean).join(' · ')}</small>
              </button>
              {open?.id === x.id ? (
                <div className="hypbody">
                  {[
                    [h.proTitle, x.pro],
                    [h.conTitle, x.con],
                    [h.uncheckedTitle, x.unchecked],
                  ].map(([title, lines]) => (
                    <div key={title as string}>
                      <div className="label">{title as string}</div>
                      {(lines as string[]).length === 0 ? <p className="muted small">{h.none}</p> : (lines as string[]).map(l => <p key={l}>{l}</p>)}
                    </div>
                  ))}
                  <div className="label">{h.confirmTitle}</div>
                  {x.clinical ? <p>{h.clinical}</p> : x.confirm.map(y => <p key={y.name}>{c.confirmLine(y.name, y.done)}</p>)}
                  <div className="row">
                    <button type="button" id={`hyp-dx-${dom(x.id)}`} disabled={!v.active} onClick={() => act({ kind: 'diagnose', id: x.id })}>
                      {h.diagnose}
                    </button>
                    <button type="button" disabled={!v.active} onClick={() => act({ kind: 'hypothesis', id: x.id })}>
                      {h.remove}
                    </button>
                  </div>
                </div>
              ) : null}
            </div>
          ))}
          {v.active ? (
            <>
              <input className="search" id="hyp-search" value={adding} placeholder={h.add} onChange={e => setAdding(e.target.value)} />
              {found.map(x => (
                <button key={x.id} type="button" className={inRow.has(x.id) ? 'xrow on' : 'xrow'} id={`hyp-add-${dom(x.id)}`} onClick={() => act({ kind: 'hypothesis', id: x.id })}>
                  <span>{x.name}</span>
                  <small>{inRow.has(x.id) ? h.inRow : h.toRow}</small>
                </button>
              ))}
            </>
          ) : null}
        </Section>
        {v.rules.length > 0 ? (
          <Section title={p.rules} id="sec-rules">
            {v.rules.map(x => (
              <p key={x.id}>
                <b>{x.name}.</b> {x.text}
              </p>
            ))}
          </Section>
        ) : null}
        <Section title={p.diagnosisLabel} id="sec-dx">
          <p id="dx-chosen">{v.draftDiagnosisName ? d.diagnosis(v.draftDiagnosisName) : <span className="muted">{c.dxPick}</span>}</p>
          {v.differential.length > 0 || v.hints.length > 0 ? (
            <div className="chips">
              {[...v.differential.map(x => ({ id: x.id, name: x.name })), ...v.hints.filter(x => !inRow.has(x.id)).map(x => ({ id: x.id, name: x.name }))].map(x => (
                <button key={x.id} type="button" id={`dx-${dom(x.id)}`} className={v.draft.diagnosis === x.id ? 'small on' : 'small'} disabled={!v.active} onClick={() => act({ kind: 'diagnose', id: x.id })}>
                  {x.name}
                </button>
              ))}
            </div>
          ) : null}
          <div className="row">
            <select id="dx-select" value={v.draft.diagnosis ?? ''} disabled={!v.active} onChange={e => e.target.value && act({ kind: 'diagnose', id: e.target.value })}>
              <option value="">{c.byGroups}</option>
              {v.diagnoses.map(g => (
                <optgroup key={g.key} label={g.title}>
                  {g.items.map(x => (
                    <option key={x.id} value={x.id}>
                      {x.name}
                    </option>
                  ))}
                </optgroup>
              ))}
            </select>
            {v.draft.diagnosis ? <Info onClick={() => explain(conditionTerm(v.draft.diagnosis!))} /> : null}
          </div>
        </Section>
        <Section title={p.treatmentLabel} id="sec-tx" extra={d.sheetState(v.draft.treatments.length, v.treatments.length)}>
          <input className="search" id="tx-search" value={tx} placeholder={d.search} onChange={e => setTx(e.target.value)} />
          {txFound ? (
            txFound.length > 0 ? txFound.slice(0, 30).map(txRow) : <p className="muted">{d.nothing}</p>
          ) : (
            <>
              {v.suggested.length > 0 ? (
                <>
                  <div className="label">{d.suggested}</div>
                  <p className="muted small">{d.suggestedNote}</p>
                  {v.suggested.map(txRow)}
                </>
              ) : null}
              <button type="button" className="linkish" onClick={() => setRest(!rest)}>
                {rest ? p.restHide : p.restShow(v.treatments.length - top.size)}
              </button>
              {rest
                ? v.treatmentGroups.map(g => {
                    const items = g.items.filter(x => !top.has(x.id));
                    return items.length > 0 ? (
                      <div key={g.key}>
                        <div className="label">{g.title}</div>
                        {items.map(txRow)}
                      </div>
                    ) : null;
                  })
                : null}
            </>
          )}
        </Section>
        <Section title={p.settingLabel} id="sec-setting">
          {v.settings.map(o => (
            <label key={o.key} className={o.disabled ? 'xrow off' : 'xrow'}>
              <input type="radio" name="setting" id={`set-${o.key}`} checked={v.draft.setting === o.key} disabled={o.disabled || !v.active} onChange={() => act({ kind: 'setting', setting: o.key })} />
              <span>{o.title}</span>
              {o.hint ? <small>{o.hint}</small> : null}
            </label>
          ))}
        </Section>
      </div>
      <div className="finishbar">
        <small className="muted">{v.draft.diagnosis ? d.summary(v.draft.treatments.length, setting) : p.finishNeedsDx}</small>
        <button type="button" id="dcard-finish" className="on" disabled={!v.draft.diagnosis || !v.active} onClick={() => act({ kind: 'finish' })}>
          {p.finish}
        </button>
      </div>
    </div>
  );
}

const GRADE_CLASS: Record<string, string> = { A: 'ga', B: 'gb', C: 'gc', D: 'gd' };

/** Итог и разбор (OutcomeScreen «Анамнеза»): что было на самом деле, оценки, замечания, разумный путь, «Что запомнить». */
function Review({ v, next, actions, explain }: { v: CardView; next?: { id: string; who: string }; actions: Actions; explain: (x: TermInfo) => void }) {
  const t = T.case.patient;
  const d = T.case.decision;
  const x = v.decision!;
  return (
    <div className="dcols review" id="review">
      <div className="dcol">
        <h3>{d.finished}</h3>
        <div className="dscroll">
          <p className={`verdict ${x.verdict}`} id="review-verdict">
            {x.verdict === 'correct' ? t.correct : x.verdict === 'partly' ? t.partly : t.wrong}
          </p>
          <p id="review-truth">
            <button type="button" className="said" onClick={() => explain(conditionTerm(x.truth))}>
              {t.truth(x.truthName)}
            </button>
          </p>
          <p className="muted">{t.confidence(x.outOf10)}</p>
          <div className="label">{t.outcomeLabel}</div>
          <p id="review-outcome">{x.outcome}</p>
          <div className="label">{t.gradesLabel}</div>
          <div className="grades" id="review-grades">
            {x.grades.map(g => (
              <div key={g.key} className="grade">
                <b className={GRADE_CLASS[g.grade]}>{g.grade}</b>
                <small>{g.label}</small>
              </div>
            ))}
            {x.targets ? (
              <div className="grade">
                <b className={GRADE_CLASS[x.targets.grade]}>{x.targets.grade}</b>
                <small>{t.grade.targets}</small>
              </div>
            ) : null}
            <div className="grade total">
              <b className={GRADE_CLASS[x.overall]} id="review-overall">
                {x.overall}
              </b>
              <small>{t.grade.overall}</small>
            </div>
          </div>
        </div>
      </div>
      <div className="dcol">
        <h3>{d.reviewLabel}</h3>
        <div className="dscroll">
          {x.targets ? (
            <>
              <div className="label">{t.grade.targets}</div>
              {x.targets.lines.map((l, i) => (
                <p key={i}>• {l}</p>
              ))}
            </>
          ) : null}
          {x.notes.length > 0 ? (
            <>
              <div className="label">{t.notesLabel}</div>
              {x.notes.map((n, i) => (
                <p key={i}>• {n}</p>
              ))}
            </>
          ) : null}
          <div className="label">{t.yourPlan}</div>
          {x.plan.length === 0 ? <p className="muted">{t.noTreatment}</p> : x.plan.map((p, i) => <p key={i}>{`${p.name} — ${p.role}`}</p>)}
          <p className="muted">{`${t.settingLabel}: ${x.settingName}`}</p>
          <div className="label">{t.rationalLabel}</div>
          <p>{x.rational}</p>
          {x.idle.length > 0 ? (
            <>
              <div className="label">{t.idleLabel}</div>
              <p>{x.idle.join(', ')}</p>
            </>
          ) : null}
        </div>
      </div>
      <div className="dcol">
        <h3>{t.pearls}</h3>
        <div className="dscroll">
          {x.pearls.map((p, i) => (
            <p key={i}>• {p}</p>
          ))}
          <div className="label">{t.timelineLabel}</div>
          {x.timeline.map((p, i) => (
            <p key={i} className="muted">{`${p.label}: ${p.truth} · ${p.chosen}`}</p>
          ))}
          <div className="label">{t.causes}</div>
          {x.causes.map((c, i) => (
            <p key={i}>{`${c.finding} — ${c.cause}`}</p>
          ))}
        </div>
        <div className="finishbar">
          {next ? (
            <button type="button" id="dcard-next" className="on" onClick={() => actions.doctor({ kind: 'take', id: next.id })}>
              {T.doctor.card.next(next.who)}
            </button>
          ) : (
            <small className="muted">{T.doctor.card.noNext}</small>
          )}
          <button type="button" id="dcard-done" onClick={() => actions.doctor({ kind: 'close' })}>
            {T.doctor.card.close}
          </button>
        </div>
      </div>
    </div>
  );
}

/** «Что это?» — справка из базы поверх карты. */
function TermPopup({ term, close }: { term: TermInfo; close: () => void }) {
  return (
    <div className="term panel" id="term" role="dialog">
      <b>{term.title}</b>
      {term.text.map((p, i) => (
        <p key={i}>{p}</p>
      ))}
      {term.list ? (
        <>
          <div className="label">{term.list.label}</div>
          <p>{term.list.items.join(', ')}</p>
        </>
      ) : null}
      <button type="button" id="term-close" onClick={close}>
        {T.case.patient.gotIt}
      </button>
    </div>
  );
}
