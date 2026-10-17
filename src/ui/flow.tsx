// Панели части 3 «Люди и поток» (spec docs/specs/2026-10-flow-ui.md): вкладка «Пациенты» с фильтрами и «Ушли», «Путь
// пациента» в карточке, меню слоёв карты. Тонкие, как остальные панели: читают хранилище и просят игру.
import type { ReactNode } from 'react';
import { LONG_WAIT, type Mood, type PatientFilter, type PatientRow, WAIT_BAD, WAIT_OK, type Where } from '../app/flow';
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
    <li>
      <button type="button" className={`row prow t-${p.triage}`} onClick={() => actions.focus(p.key)} title={gone ? undefined : T.flow.flyHint} data-id={p.id}>
        <span className="ptitle">
          {p.title}
          {p.mood ? <MoodIcon mood={p.mood} /> : null}
        </span>
        <span className="ptext">{p.text}</span>
      </button>
    </li>
  );
}

/** Вкладка «Пациенты»: кто в больнице — фильтры по срочности, месту и ожиданию; «Ушли» — ушедшие, не дождавшись. */
export function PatientsTab({ hud, actions }: P) {
  const f = hud.patientFilter;
  const set = (patch: Partial<PatientFilter>) => actions.filterPatients(patch);
  const triages: (Triage | 'all')[] = ['all', 'red', 'yellow', 'green'];
  const wheres: (Where | 'all')[] = ['all', 'reg', 'wait', 'doctor', 'exams', 'ward'];
  return (
    <div className="patients" id="patients">
      <div className="pfilters">
        <span className="group">
          <Seg id="pf-present" on={!f.gone} onClick={() => set({ gone: false })}>
            {T.flow.present}
          </Seg>
          <Seg id="pf-gone" on={f.gone} onClick={() => set({ gone: true })} title={T.flow.goneHint}>
            {T.flow.gone} ({hud.gone.length})
          </Seg>
        </span>
        {f.gone ? null : (
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
            <Seg id="pf-long" on={f.long} onClick={() => set({ long: !f.long })}>
              {T.flow.longOnly(LONG_WAIT / 60)}
            </Seg>
            <div className="muted small">{T.flow.shown(hud.patients.length, hud.patientsAll)}</div>
          </>
        )}
      </div>
      {f.gone ? (
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

/** Кнопка «Слои» слева и меню: «Очереди и загрузка» (L) работает, остальные слои геймдизайна §3 — позже. */
export function Layers({ hud, actions }: P) {
  const soon: (keyof typeof T.flow.layer)[] = ['departments', 'paths', 'comfort', 'problems'];
  return (
    <>
      <button type="button" id="layers" className={hud.layers.open || hud.layers.queues ? 'on' : undefined} onClick={actions.toggleLayers} title="L">
        ▦ {T.flow.layers}
      </button>
      {hud.layers.open ? (
        <div className="layers" id="layers-menu">
          <button type="button" id="layer-queues" className={hud.layers.queues ? 'on' : undefined} onClick={actions.toggleQueues} title="L">
            {T.flow.layer.queues}
          </button>
          {soon.map(k => (
            <button key={k} type="button" disabled title={T.flow.layerSoon}>
              {T.flow.layer[k]}
            </button>
          ))}
          {hud.layers.queues ? <p className="hint">{T.flow.legend(WAIT_OK / 60, WAIT_BAD / 60)}</p> : null}
        </div>
      ) : null}
    </>
  );
}
