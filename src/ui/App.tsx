// Панели игры (spec docs/specs/2026-10-shell-3d.md, «Панели»; геймдизайн §12): сверху — день и часы, скорость, касса,
// репутация, извещения; слева — место под стройку и слои; справа — вкладки; снизу — карточка выбранного. Панели тонкие:
// читают хранилище (store.ts) и просят игру (Actions); 3D-кадр живёт вне React.
import type { ReactNode } from 'react';
import { clock, type Lang, T } from '../i18n';
import type { PersonInfo } from '../render/population';
import type { Quality } from '../render/view';
import type { WallMode } from '../render/world';
import { type Actions, type Hud, type Speed, type Store, type Tab, useHud } from './store';

/** Названия из базы: помещения, должности, признаки. */
export interface Names {
  room(id: string | undefined): string;
  role(id: string | undefined): string;
  finding(id: string | undefined): string;
}

interface P {
  hud: Hud;
  actions: Actions;
  names: Names;
}

const Btn = ({ on, onClick, children, title, disabled, id }: { on?: boolean; onClick?: () => void; children: ReactNode; title?: string; disabled?: boolean; id?: string }) => (
  <button type="button" id={id} className={on ? 'on' : undefined} onClick={onClick} title={title} disabled={disabled}>
    {children}
  </button>
);

function TopBar({ hud, actions }: P) {
  const speeds: Speed[] = [1, 2, 4];
  const last = hud.notices[0];
  return (
    <div className="top panel" id="top">
      <span className="clock" id="clock">
        {T.top.day(hud.day)} · {clock(hud.t)}
      </span>
      <span className="group">
        <Btn id="speed-0" on={hud.speed === 0} onClick={() => actions.setSpeed(0)} title="Space">
          ❚❚ {T.top.pause}
        </Btn>
        {speeds.map((s, i) => (
          <Btn key={s} id={`speed-${s}`} on={hud.speed === s && !hud.ff} onClick={() => actions.setSpeed(s)} title={String(i + 1)}>
            {T.top.speed(s)}
          </Btn>
        ))}
        <Btn id="speed-ff" on={hud.ff} onClick={actions.untilMorning} title={`4 — ${T.top.morningSoon}`}>
          ⏭ {T.top.morning}
        </Btn>
      </span>
      <span className="stat" title={hud.cash === undefined ? T.top.noCashHint : undefined}>
        {T.top.cash}: <b>{hud.cash === undefined ? T.top.noCash : `${hud.cash.toLocaleString('ru-RU')} ₽`}</b>
      </span>
      <span className="stat">
        {T.top.reputation}: <b>{T.top.noCash}</b>
      </span>
      <span className="stat" id="counts">
        {T.top.arrived} <b>{hud.arrived}</b> · {T.top.seen} <b>{hud.seen}</b> · {T.top.left} <b>{hud.left}</b> · {T.top.queue} <b>{hud.queue}</b>
      </span>
      {hud.lag > 2 ? <span className="stat warn">{T.top.lag(Math.round(hud.lag))}</span> : null}
      <span className="notice" title={hud.notices.map(n => `${clock(n.t)} ${n.text}`).join('\n')}>{last ? `🔔 ${clock(last.t)} ${last.text}` : '🔔'}</span>
    </div>
  );
}

function ViewBar({ hud, actions }: P) {
  const walls: [WallMode, string][] = [
    ['full', T.view.wallsFull],
    ['cut', T.view.wallsCut],
    ['down', T.view.wallsDown],
  ];
  const q: [Quality, string][] = [
    ['low', T.view.low],
    ['medium', T.view.medium],
    ['high', T.view.high],
  ];
  return (
    <div className="viewbar panel" id="viewbar">
      <span className="label">{T.view.walls}</span>
      {walls.map(([m, s]) => (
        <Btn key={m} id={`walls-${m}`} on={hud.walls === m} onClick={() => actions.setWalls(m)}>
          {s}
        </Btn>
      ))}
      <span className="label">{T.view.quality}</span>
      {q.map(([m, s]) => (
        <Btn key={m} id={`quality-${m}`} on={hud.quality === m} onClick={() => actions.setQuality(m)}>
          {s}
        </Btn>
      ))}
      <span className="label">{T.view.camera}</span>
      <Btn on={hud.projection === 'persp'} onClick={() => actions.setProjection('persp')}>
        {T.view.persp}
      </Btn>
      <Btn on={hud.projection === 'ortho'} onClick={() => actions.setProjection('ortho')}>
        {T.view.ortho}
      </Btn>
      <Btn onClick={() => actions.rotate(-1)} title="Q">
        ⟲
      </Btn>
      <Btn onClick={() => actions.rotate(1)} title="E">
        ⟳
      </Btn>
      <Btn onClick={actions.overview}>{T.view.overview}</Btn>
      <Btn id="debug" on={hud.debug} onClick={actions.toggleDebug}>
        {T.view.debug}
      </Btn>
    </div>
  );
}

function LeftTools() {
  return (
    <div className="left panel" id="left">
      <button type="button" disabled title={T.left.buildSoon}>
        🏗 {T.left.build}
      </button>
      <button type="button" disabled title={T.left.overlaysSoon}>
        ▦ {T.left.overlays}
      </button>
      <div className="hint">{T.left.buildSoon}</div>
    </div>
  );
}

function RightTabs({ hud, actions }: P) {
  const tabs: [Tab, string][] = [
    ['patients', T.tabs.patients],
    ['staff', T.tabs.staff],
    ['asks', T.tabs.asks],
    ['journal', T.tabs.journal],
    ['reports', T.tabs.reports],
    ['goals', T.tabs.goals],
  ];
  let body: ReactNode = null;
  if (hud.tab === 'patients')
    body = hud.patients.length ? (
      <ul>
        {hud.patients.map(p => (
          <li key={p.key}>
            <button type="button" className={`row t-${p.triage}`} onClick={() => actions.select(p.key)}>
              {p.text}
            </button>
          </li>
        ))}
      </ul>
    ) : (
      <p>{T.tabs.empty}</p>
    );
  else if (hud.tab === 'staff')
    body = (
      <ul>
        {hud.staffList.map(p => (
          <li key={p.key}>
            <button type="button" className="row" onClick={() => actions.select(p.key)}>
              {p.text}
            </button>
          </li>
        ))}
      </ul>
    );
  else if (hud.tab === 'journal')
    body = (
      <ul>
        {hud.notices.map((n, i) => (
          <li key={i}>
            {clock(n.t)} {n.text}
          </li>
        ))}
      </ul>
    );
  else if (hud.tab) body = <p>{T.tabs.soon}</p>;
  return (
    <div className="right" id="right">
      <div className="tabs panel">
        {tabs.map(([t, s]) => (
          <Btn key={t} id={`tab-${t}`} on={hud.tab === t} onClick={() => actions.setTab(hud.tab === t ? null : t)}>
            {s}
          </Btn>
        ))}
      </div>
      {hud.tab ? <div className="tabbody panel">{body}</div> : null}
    </div>
  );
}

function personLines(info: PersonInfo, names: Names): [string, string][] {
  if (info.kind === 'staff') return [[T.card.staff, names.role(info.role)], [T.card.where, names.room(info.room)]];
  return [
    [T.card.complaint, names.finding(info.complaint)],
    [T.card.where, info.room ? names.room(info.room) : T.card.corridor],
    [T.card.doing, T.doing[info.doing]],
    [T.card.triage, T.triage[info.triage]],
    [T.card.by, info.by ? names.role(info.by) : T.card.byNobody],
    [T.card.visit, T.visit[info.visit as keyof typeof T.visit] ?? info.visit],
  ];
}

function BottomCard({ hud, actions, names }: P) {
  if (hud.selected) {
    const info = hud.selected.info;
    const title = info.kind === 'patient' ? T.card.patient(info.sex, info.age) : names.role(info.role);
    return (
      <div className="card panel" id="card">
        <div className="cardhead">
          <b id="card-title">{title}</b>
          {info.kind === 'patient' ? <span className={`badge t-${info.triage}`} title={T.triage[info.triage]} /> : null}
          <button type="button" className="close" onClick={() => actions.select(undefined)} title="Esc">
            ✕
          </button>
        </div>
        <dl>
          {personLines(info, names).map(([k, v]) => (
            <div key={k}>
              <dt>{k}</dt>
              <dd>{v}</dd>
            </div>
          ))}
        </dl>
      </div>
    );
  }
  if (hud.room) {
    const r = hud.room;
    return (
      <div className="card panel" id="card">
        <div className="cardhead">
          <b id="card-title">{r.name}</b>
          <span className="muted">{r.id}</span>
          <button type="button" className="close" onClick={() => actions.select(undefined)} title="Esc">
            ✕
          </button>
        </div>
        <dl>
          <div>
            <dt>{T.card.roomStaff}</dt>
            <dd>{r.staff.length ? r.staff.join(', ') : '—'}</dd>
          </div>
          <div>
            <dt>{T.card.roomPeople}</dt>
            <dd>{r.people}</dd>
          </div>
        </dl>
      </div>
    );
  }
  return null;
}

function DebugMenu({ hud, actions }: P) {
  const langs: Lang[] = ['ru', 'en'];
  return (
    <div className="debug panel" id="debugmenu">
      <b>{T.debug.title}</b>
      <div>
        {hud.fps} {T.debug.fps} · {T.debug.cpu} {hud.cpuMs.toFixed(2)} ms · {T.debug.gpu} {hud.gpuMs === null ? '—' : `${hud.gpuMs.toFixed(2)} ms`} · {hud.people}
      </div>
      <div className="group">
        <Btn id="bench" onClick={() => actions.bench(false)}>
          {T.debug.bench}
        </Btn>
        <Btn id="bench-uncapped" onClick={() => actions.bench(true)}>
          {T.debug.benchUncapped}
        </Btn>
      </div>
      <div className="group">
        <span className="label">{T.debug.language}</span>
        {langs.map(l => (
          <Btn key={l} on={hud.lang === l} onClick={() => actions.setLang(l)}>
            {l}
          </Btn>
        ))}
      </div>
      <div className="muted">v{hud.version}</div>
    </div>
  );
}

export function App({ store, actions, names }: { store: Store; actions: Actions; names: Names }) {
  // язык меняется на ходу: строки читаются при отрисовке, смена языка — новый снимок хранилища
  const hud = useHud(store);
  const p = { hud, actions, names };
  return (
    <>
      <TopBar {...p} />
      <ViewBar {...p} />
      <LeftTools />
      <RightTabs {...p} />
      <BottomCard {...p} />
      {hud.debug ? <DebugMenu {...p} /> : null}
      {!hud.ready || hud.status || hud.error ? (
        <div className="status panel" id="status">
          {hud.error ? `${T.app.error}: ${hud.error}` : hud.status || T.app.loading}
        </div>
      ) : null}
    </>
  );
}
