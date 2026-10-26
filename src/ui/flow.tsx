// Панели части 3 «Люди и поток» (spec docs/specs/2026-10-flow-ui.md): вкладка «Пациенты» с фильтрами, «Приняты» (spec
// docs/specs/2026-10-discharged-card.md) и «Ушли», «Путь пациента» в карточке, меню слоёв карты. Тонкие, как остальные
// панели: читают хранилище и просят игру.
import type { ReactNode } from 'react';
import { LONG_WAIT, type Mood, type PatientFilter, type PatientRow, WAIT_BAD, WAIT_OK, type Where } from '../app/flow';
import { METRICS, MONEY_METRICS } from '../app/metrics';
import type { Triage } from '../engine/shift/types';
import { T } from '../i18n';
import type { Actions, Hud } from './store';

interface P {
  hud: Hud;
  actions: Actions;
}

/** Значок настроения в строке списка — те же, что над головой (render/icons.ts). */
export function MoodIcon({ mood }: { mood: Mood }) {
  return (
    <span className={`mood m-${mood}`} title={T.flow.icons[mood]}>
      <svg viewBox="0 0 16 16" width="14" height="14" aria-hidden="true">
        <circle cx="8" cy="8" r="7" />
        {mood === 'long' ? <path d="M8 4v4l3 1.5" fill="none" stroke="#fff" strokeWidth="1.8" strokeLinecap="round" /> : null}
        {mood === 'unhappy' ? (
          <>
            <circle cx="5.6" cy="6.2" r="1.1" fill="#fff" />
            <circle cx="10.4" cy="6.2" r="1.1" fill="#fff" />
            <path d="M5 11.6c1.6-1.6 4.4-1.6 6 0" fill="none" stroke="#fff" strokeWidth="1.5" strokeLinecap="round" />
          </>
        ) : null}
        {mood === 'ask' ? <path d="M6.2 6.1c.1-1.2 1-1.8 1.9-1.8 1.1 0 1.9.7 1.9 1.6 0 1.4-1.8 1.5-1.8 2.8M8.2 11.5v.1" fill="none" stroke="#fff" strokeWidth="1.6" strokeLinecap="round" /> : null}
      </svg>
    </span>
  );
}

const Seg = ({ on, onClick, children, id, title }: { on: boolean; onClick: () => void; children: ReactNode; id?: string; title?: string }) => (
  <button type="button" id={id} className={on ? 'on' : undefined} onClick={onClick} title={title}>
    {children}
  </button>
);

function Row({ p, actions, gone }: { p: PatientRow; actions: Actions; gone?: boolean }) {
  return (
    <li className="patli">
      <button type="button" className={`row patrow t-${p.triage}`} onClick={() => actions.focus(p.key)} title={gone ? undefined : T.flow.flyHint} data-id={p.id}>
        <span className="ptitle">
          {p.title}
          {p.mood ? <MoodIcon mood={p.mood} /> : null}
        </span>
        <span className="ptext">{p.text}</span>
      </button>
      {/* у любого пациента (spec docs/specs/2026-10-owner-play-2.md): чужая — для чтения, часы идут */}
      <button type="button" className="small patopen" id={`pat-open-${p.id}`} title={T.doctor.viewHint} onClick={() => actions.doctor({ kind: 'open', id: p.id })}>
        {T.doctor.openCard}
      </button>
    </li>
  );
}

/**
 * Вкладка «Пациенты»: кто в больнице — фильтры по срочности, месту и ожиданию; «Приняты» — приняты и ушли за сутки, с
 * картой у каждого; «Ушли» — ушедшие, не дождавшись.
 */
export function PatientsTab({ hud, actions }: P) {
  const f = hud.patientFilter;
  const set = (patch: Partial<PatientFilter>) => actions.filterPatients(patch);
  const triages: (Triage | 'all')[] = ['all', 'red', 'yellow', 'green'];
  const wheres: (Where | 'all')[] = ['all', 'reg', 'wait', 'doctor', 'exams', 'ward'];
  return (
    <div className="patients" id="patients">
      <div className="pfilters">
        <span className="group">
          <Seg id="pf-present" on={f.list === 'present'} onClick={() => set({ list: 'present' })}>
            {T.flow.present}
          </Seg>
          <Seg id="pf-seen" on={f.list === 'seen'} onClick={() => set({ list: 'seen' })} title={T.flow.seenHint}>
            {T.flow.seen} ({hud.seenAll})
          </Seg>
          <Seg id="pf-gone" on={f.list === 'gone'} onClick={() => set({ list: 'gone' })} title={T.flow.goneHint}>
            {T.flow.gone} ({hud.gone.length})
          </Seg>
        </span>
        {f.list === 'seen' && hud.seenAll > hud.seenRows.length ? <div className="muted small">{T.flow.seenLast(hud.seenRows.length, hud.seenAll)}</div> : null}
        {f.list !== 'present' ? null : (
          <>
            <span className="group">
              {triages.map(t => (
                <Seg key={t} id={`pf-t-${t}`} on={f.triage === t} onClick={() => set({ triage: t })}>
                  {t === 'all' ? T.flow.all : <span className={`dot t-${t}`} title={T.flow.triage[t]} />}
                </Seg>
              ))}
            </span>
            <span className="group wrap">
              {wheres.map(w => (
                <Seg key={w} id={`pf-w-${w}`} on={f.where === w} onClick={() => set({ where: w })}>
                  {w === 'all' ? T.flow.all : T.flow.where[w]}
                </Seg>
              ))}
            </span>
            {/* отделение (spec docs/specs/2026-10-departments.md, часть 2): где пациент сейчас или кабинет его врача */}
            {hud.deptLegend.length ? (
              <select id="pf-dept" value={f.dept} title={T.flow.deptFilterHint} onChange={e => set({ dept: e.target.value as PatientFilter['dept'] })}>
                <option value="all">{T.flow.deptAll}</option>
                {hud.deptLegend.map(d => (
                  <option key={d.id || 'none'} value={d.id || 'none'}>
                    {d.name}
                  </option>
                ))}
              </select>
            ) : null}
            <Seg id="pf-long" on={f.long} onClick={() => set({ long: !f.long })}>
              {T.flow.longOnly(LONG_WAIT / 60)}
            </Seg>
            <div className="muted small">{T.flow.shown(hud.patients.length, hud.patientsAll)}</div>
          </>
        )}
      </div>
      {f.list === 'seen' ? (
        hud.seenRows.length ? (
          <ul id="seen-list">
            {hud.seenRows.map(p => (
              <Row key={p.key} p={p} actions={actions} gone />
            ))}
          </ul>
        ) : (
          <p>{T.flow.seenNobody}</p>
        )
      ) : f.list === 'gone' ? (
        hud.gone.length ? (
          <ul>
            {hud.gone.map(p => (
              <Row key={p.key} p={p} actions={actions} gone />
            ))}
          </ul>
        ) : (
          <p>{T.flow.goneNobody}</p>
        )
      ) : hud.patients.length ? (
        <ul>
          {hud.patients.map(p => (
            <Row key={p.key} p={p} actions={actions} />
          ))}
        </ul>
      ) : (
        <p>{hud.patientsAll ? T.flow.nobody : T.tabs.empty}</p>
      )}
    </div>
  );
}

/** «Путь пациента» в карточке выбранного: почему ушёл, лента «час — что — сколько — почему», итог. */
export function PathSection({ hud }: { hud: Hud }) {
  const path = hud.path;
  if (!path) return null;
  if ('none' in path)
    return (
      <div className="path" id="path">
        <div className="phead">{T.flow.path}</div>
        <p className="muted">{T.flow.noPath}</p>
      </div>
    );
  return (
    <div className="path" id="path">
      {path.left ? (
        <div className="pleft" id="path-left">
          <b>{T.flow.whyLeft}</b>
          <div>{path.left.charAt(0).toUpperCase() + path.left.slice(1)}</div>
        </div>
      ) : null}
      <div className="phead">{T.flow.path}</div>
      <ol className="plines">
        {path.lines.map((l, i) => (
          <li key={i} className={`pl-${l.kind}${l.now ? ' now' : ''}`}>
            <span className="pat">{l.at}</span>
            <span className="ptxt">
              {l.text}
              {l.now ? <span className="pnow"> · {T.flow.now}</span> : null}
              {l.why ? <span className="pwhy">{l.why}</span> : null}
            </span>
          </li>
        ))}
      </ol>
      <div className="psum muted" id="path-summary">
        {path.summary}
      </div>
    </div>
  );
}

/**
 * Кнопка «Слои» слева и меню: «Очереди и загрузка» (L) и «Показатели» (M, spec docs/specs/2026-10-metrics-layer.md) работают,
 * остальные слои геймдизайна §3 — позже.
 */
export function Layers({ hud, actions }: P) {
  const soon: (keyof typeof T.flow.layer)[] = ['paths', 'comfort', 'problems'];
  const metric = hud.layers.metric;
  return (
    <>
      <button type="button" id="layers" className={hud.layers.open || hud.layers.queues || hud.layers.depts || metric ? 'on' : undefined} onClick={actions.toggleLayers} title="L">
        ▦ {T.flow.layers}
      </button>
      {hud.layers.open ? (
        <div className="layers" id="layers-menu">
          <button type="button" id="layer-queues" className={hud.layers.queues ? 'on' : undefined} onClick={actions.toggleQueues} title="L">
            {T.flow.layer.queues}
          </button>
          {/* «Отделения» (spec docs/specs/2026-10-departments.md, часть 2): пол помещений в цвет отделения и подписи */}
          <button type="button" id="layer-depts" className={hud.layers.depts ? 'on' : undefined} onClick={actions.toggleDepts} title="L">
            {T.flow.layer.departments}
          </button>
          {soon.map(k => (
            <button key={k} type="button" disabled title={T.flow.layerSoon}>
              {T.flow.layer[k]}
            </button>
          ))}
          {hud.layers.queues ? <p className="hint">{T.flow.legend(WAIT_OK / 60, WAIT_BAD / 60)}</p> : null}
          {/* «Показатели»: столбики над помещениями; выручка и прибыль — за сутки, с ползунком по суткам (часть 2) */}
          <div className="metrics" id="metrics-menu" title={T.metrics.hint}>
            <b>{T.metrics.title}</b>
            <div className="row">
              {METRICS.map(m => (
                <button key={m} type="button" id={`metric-${m}`} className={metric === m ? 'on' : undefined} title={T.metrics.hint} onClick={() => actions.setMetric(metric === m ? null : m)}>
                  {T.metrics.name[m]}
                </button>
              ))}
            </div>
            {metric ? <p className="hint">{T.metrics.legend[metric](WAIT_OK / 60, WAIT_BAD / 60)}</p> : null}
            {metric && MONEY_METRICS.includes(metric) ? <MoneyDay hud={hud} actions={actions} /> : null}
          </div>
        </div>
      ) : null}
    </>
  );
}

/**
 * Легенда слоя «Отделения» — справа внизу, пока слой включён, и при закрытом меню «Слои»: отделения этой больницы в их
 * цвете, сколько помещений, и «без отделения». В меню слева она не помещалась: на 1280 × 720 вытесняла «Показатели» за
 * край экрана и ложилась на окно врача. Как ею пользоваться — во всплывающей подсказке.
 */
export function DeptLegend({ hud }: { hud: Hud }) {
  if (!hud.layers.depts || !hud.deptLegend.length) return null;
  return (
    <div className="deptlegend panel" id="dept-legend-panel" title={T.flow.deptLegend}>
      <b>{T.flow.layer.departments}</b>
      <ul id="dept-legend">
        {hud.deptLegend.map(d => (
          <li key={d.id || 'none'} data-dept={d.id}>
            <span className="swatch" style={{ background: d.color }} />
            {d.name} <span className="muted">· {T.flow.deptRooms(d.rooms)}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}

/**
 * Ползунок по суткам денег (spec docs/specs/2026-10-metrics-layer.md, часть 2): справа — сегодня до сих пор, левее —
 * прошедшие сутки, последние 14. Часы при этом идут: слой только показывает.
 */
function MoneyDay({ hud, actions }: P) {
  const days = hud.layers.days;
  const at = hud.layers.day === null ? days.length : Math.max(0, days.indexOf(hud.layers.day));
  return (
    <div className="moneyday">
      <label htmlFor="metric-day">
        {T.metrics.day}: <b id="metric-day-label">{hud.layers.day === null ? T.metrics.today : T.metrics.dayN(hud.layers.day)}</b>
      </label>
      <input
        type="range" id="metric-day" min={0} max={days.length} step={1} value={at} disabled={days.length === 0}
        onChange={e => {
          const i = Number(e.target.value);
          actions.setMetricDay(i >= days.length ? null : days[i]);
        }}
      />
    </div>
  );
}
