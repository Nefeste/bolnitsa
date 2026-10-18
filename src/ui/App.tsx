// Панели игры (spec docs/specs/2026-10-shell-3d.md, «Панели»; геймдизайн §12): сверху — день и часы, скорость, касса,
// репутация, стройка, извещения; слева — стройка (spec docs/specs/2026-10-build.md) и слои; справа — вкладки; снизу —
// карточка выбранного. Панели тонкие: читают хранилище (store.ts) и просят игру (Actions); 3D-кадр живёт вне React.
import { type ReactNode, useState } from 'react';
import type { SaveRow } from '../app/saves';
import { clock, type Lang, lang, money, T } from '../i18n';
import type { PersonInfo } from '../render/population';
import type { Quality } from '../render/view';
import type { WallMode } from '../render/world';
import { Card } from './doctor/Card';
import { Asks, Dock, OfficeRow, TakeCase } from './doctor/Dock';
import { Meeting, Reports, signed } from './Meeting';
import { Layers, PathSection, PatientsTab } from './flow';
import { type Actions, type Hud, type RoomCard, type Speed, type Store, type Tab, type Tool, useHud } from './store';

/** Названия из базы: помещения, должности, признаки. */
export interface Names {
  room(id: string | undefined): string;
  role(id: string | undefined): string;
  finding(id: string | undefined): string;
  /** к кому — должность в дательном падеже («гастроэнтерологу»); по-английски — название */
  dat(id: string | undefined): string;
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
  const speeds: Speed[] = [1, 3, 12];
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
      <Money hud={hud} />
      <span className="stat" id="counts">
        {T.top.arrived} <b>{hud.arrived}</b> · {T.top.seen} <b>{hud.seen}</b> · {T.top.left} <b>{hud.left}</b> · {T.top.queue} <b>{hud.queue}</b>
      </span>

      {hud.lag > 2 ? <span className="stat warn">{T.top.lag(Math.round(hud.lag))}</span> : null}
    </div>
  );
}

/** Последнее извещение — под часами, целиком (в верхней полосе оно ужималось до многоточия); вся лента — в «Журнале». */
function Notice({ hud }: P) {
  const last = hud.notices[0];
  if (!last) return null;
  return (
    <div className="notice panel" id="notice" title={hud.notices.map(n => `${clock(n.t)} ${n.text}`).join('\n')}>
      🔔 {clock(last.t)} {last.text}
    </div>
  );
}

/**
 * Касса с изменением с 08:00 и репутация (spec docs/specs/2026-10-economy.md, «Верхняя полоса»): ниже предела минуса касса
 * красная; у репутации — куда сдвинулась на последней планёрке.
 */
function Money({ hud }: { hud: Hud }) {
  const e = hud.economy;
  if (hud.cash === undefined || !e)
    return (
      <span className="stat" id="cash" title={T.top.noCashHint}>
        {T.top.cash}: <b>{T.top.noCash}</b>
      </span>
    );
  const below = hud.cash < -e.limit;
  const rep = e.meeting?.summary.economy?.reputation;
  const arrow = rep && rep.to > rep.from ? ' ↑' : rep && rep.to < rep.from ? ' ↓' : '';
  return (
    <>
      <span className={`stat${below ? ' bad' : ''}`} id="cash" title={below ? T.money.below(money(e.limit)) : T.money.cashHint(money(e.limit))}>
        {T.money.cash}: <b id="cash-now">{money(hud.cash)}</b>
        {e.today !== undefined ? (
          <span className={e.today >= 0 ? 'ok' : 'bad'} id="cash-today">
            {' '}
            {T.money.today(signed(e.today))}
          </span>
        ) : null}
      </span>
      <span className="stat" id="reputation" title={T.money.repHint(rep?.score)}>
        {T.money.reputation}: <b id="reputation-now">{e.reputation ?? T.top.noCash}</b>
        {arrow}
      </span>
    </>
  );
}

/**
 * Панель вида — свёрнута в одну кнопку «Вид» (spec docs/specs/2026-10-aaa-polish.md, «Интерфейс»): стены, качество и камера
 * нужны не каждую минуту, а место под ними — значкам помещений и извещениям.
 */
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
  const menu = (
    <Btn id="view-menu" on={hud.viewOpen} onClick={actions.toggleView} title={T.view.menuHint}>
      ⚙ {T.view.menu}
    </Btn>
  );
  if (!hud.viewOpen)
    return (
      <div className="viewbar panel" id="viewbar">
        {menu}
      </div>
    );
  return (
    <div className="viewbar panel open" id="viewbar">
      {menu}
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

/** Слева — стройка (spec docs/specs/2026-10-build.md, «Экран и управление»): инструменты, каталог, строка призрака. */
function LeftTools({ hud, actions }: P) {
  const b = hud.build;
  if (!b.on)
    return (
      <div className="left panel" id="left">
        {/* меню игры (spec docs/specs/2026-10-saves.md): сохранить, загрузить, новая игра */}
        <button type="button" id="game-menu-open" className={hud.menu.open ? 'on' : undefined} title={T.saves.menuHint} onClick={actions.toggleMenu}>
          ☰ {T.saves.menu}
        </button>
        <button type="button" id="build" onClick={actions.toggleBuild} title="B">
          🏗 {T.left.build}
        </button>
        <Layers hud={hud} actions={actions} />
      </div>
    );
  const tools: [Tool, string, string][] = [
    ['room', '▭', T.build.room],
    ['item', '▪', T.build.item],
    ['door', '▯', T.build.door],
    ['door2', '▯▯', T.build.door2],
    ['demolish', '✖', T.build.demolish],
  ];
  let body: ReactNode = null;
  // готовые помещения (spec docs/specs/2026-10-ready-rooms.md): тип, образцы S/M/L, «С персоналом»
  if (b.tool === 'ready')
    body = (
      <>
        <ul className="list" id="ready-types">
          {hud.readyTypes.map(t => {
            const on = b.ready?.type === t.id;
            return (
              <li key={t.id}>
                <button type="button" id={`ready-${t.id.slice(5)}`} className={on ? 'on' : undefined} onClick={() => actions.pickReady(t.id)}>
                  <span>{t.name}</span>
                  <small>{on ? (t.sizes.find(z => z.id === b.ready?.size)?.text ?? t.price) : t.price}</small>
                </button>
                {on && t.sizes.length > 1 ? (
                  <div className="sizes">
                    {t.sizes.map(z => (
                      <button key={z.id} type="button" id={`size-${z.id}`} className={`small${b.ready?.size === z.id ? ' on' : ''}`} onClick={() => actions.pickReady(t.id, z.id)} title={z.text}>
                        {z.id}
                      </button>
                    ))}
                  </div>
                ) : null}
              </li>
            );
          })}
        </ul>
        <label className="check" title={T.build.withStaffHint}>
          <input type="checkbox" id="ready-staff" checked={b.withStaff} onChange={actions.toggleReadyStaff} /> {T.build.withStaff}
        </label>
      </>
    );
  else if (b.tool === 'room')
    body = (
      <ul className="list" id="room-types">
        {hud.roomTypes.map(t => (
          <li key={t.id}>
            <button type="button" id={`rt-${t.id.slice(5)}`} className={b.roomType === t.id ? 'on' : undefined} onClick={() => actions.pickRoomType(t.id)}>
              <span>{t.name}</span>
              <small>
                {t.min} · {t.price}
              </small>
            </button>
          </li>
        ))}
      </ul>
    );
  else if (b.tool === 'item')
    body = hud.room?.catalog ? (
      <>
        <div className="label">{T.build.catalog(hud.room.name)}</div>
        {hud.room.furnish?.ok ? (
          <button type="button" id="furnish" className="wide" onClick={() => actions.furnish(hud.room!.id)} title={T.build.furnishHint}>
            {hud.room.furnish.text}
          </button>
        ) : null}
        <ul className="list" id="catalog">
          {hud.room.catalog.map(c => (
            <li key={c.eq ?? c.kind}>
              <button type="button" id={`it-${c.eq ? c.eq.slice(3) : c.kind}`} className={b.item?.kind === c.kind && b.item?.eq === c.eq ? 'on' : undefined} onClick={() => actions.pickItem(c.kind, c.eq)}>
                <span>{c.name}</span>
                <small>{c.price}</small>
              </button>
            </li>
          ))}
        </ul>
      </>
    ) : (
      <p className="hint">{T.build.pickRoom}</p>
    );
  return (
    <div className="left panel wide" id="left">
      <div className="row">
        <b>{T.build.on}</b>
        <button type="button" id="build" className="close" onClick={actions.toggleBuild} title={`B — ${T.build.off}`}>
          ✕
        </button>
      </div>
      <button type="button" id="tool-ready" className={`wide${b.tool === 'ready' ? ' on' : ''}`} onClick={() => actions.setTool(b.tool === 'ready' ? undefined : 'ready')} title={T.build.readyHint}>
        ▣ {T.build.ready}
      </button>
      <div className="tools">
        {tools.map(([t, icon, name]) => (
          <button key={t} type="button" id={`tool-${t}`} className={b.tool === t ? 'on' : undefined} onClick={() => actions.setTool(b.tool === t ? undefined : t)}>
            {icon} {name}
          </button>
        ))}
      </div>
      <div className="row">
        <button type="button" id="undo" disabled={b.undo === 0} onClick={actions.undo} title="Ctrl+Z">
          ↶ {T.build.undo} ({b.undo})
        </button>
        <button type="button" id="done" onClick={actions.done} title={T.build.doneHint}>
          ✓ {T.build.done}
        </button>
      </div>
      <div className="spent">
        {T.build.spent}: <b>{money(b.spent)}</b>
      </div>
      {b.ghost ? (
        <div className={`ghostline ${b.ghost.ok ? 'ok' : 'bad'}`} id="ghost">
          {b.ghost.text}
        </div>
      ) : null}
      {b.result ? (
        <div className={`ghostline ${b.result.ok ? 'ok' : 'bad'}`} id="result">
          {b.result.text}
        </div>
      ) : null}
      {body}
      <div className="hint">{T.build.keys}</div>
    </div>
  );
}

/** Карточка помещения больницы ПК: состояние, нужное, должности, «Обставить», «Снести»; у кабинета врача — «Мой кабинет». */
function SiteCard({ r, actions, hud }: { r: RoomCard; actions: Actions; hud: Hud }) {
  return (
    <>
      <div className={`state ${r.ok ? 'ok' : 'bad'}`} id="room-state">
        {r.state}
      </div>
      {r.problems && r.problems.length > 1 ? (
        <ul className="problems">
          {r.problems.slice(1).map(p => (
            <li key={p}>{p}</li>
          ))}
        </ul>
      ) : null}
      <dl>
        <div>
          <dt>{T.card.size}</dt>
          <dd>{r.size}</dd>
        </div>
        <div>
          <dt>{T.card.roomPeople}</dt>
          <dd>{r.people}</dd>
        </div>
        <div>
          <dt>{T.card.needs}</dt>
          <dd>
            {r.needs?.map(n => (
              <span key={n.name} className={n.have >= n.need ? 'need ok' : 'need bad'}>
                {n.have >= n.need ? '✓' : '✗'} {n.name}
                {n.need > 1 ? ` ${Math.min(n.have, n.need)}/${n.need}` : ''}
              </span>
            ))}
          </dd>
        </div>
        <div>
          <dt>{T.card.posts}</dt>
          <dd>
            {r.posts?.length
              ? r.posts.map(p => (
                  <div key={p.role} className="post">
                    {p.you ? (
                      <span className="muted">{T.card.you}</span>
                    ) : p.who ? (
                      <>
                        <span>{p.who}</span>
                        <button type="button" className="small" id={`dismiss-${p.role.slice(5)}`} onClick={() => actions.dismiss(p.staffId!)}>
                          {T.card.dismiss}
                        </button>
                      </>
                    ) : p.options ? (
                      <HirePick room={r.id} role={p.role} options={p.options} actions={actions} />
                    ) : (
                      <button type="button" className="small" id={`hire-${p.role.slice(5)}`} onClick={() => actions.hire(r.id, p.role)}>
                        {T.card.hire(p.name, p.salary)}
                      </button>
                    )}
                  </div>
                ))
              : '—'}
          </dd>
        </div>
      </dl>
      <div className="row">
        {r.furnish?.ok ? (
          <button type="button" id="card-furnish" onClick={() => actions.furnish(r.id)}>
            {r.furnish.text}
          </button>
        ) : null}
        <button type="button" id="card-demolish" onClick={() => actions.demolish(r.id)}>
          {r.demolish}
        </button>
      </div>
      <OfficeRow r={r} hud={hud} actions={actions} />
    </>
  );
}

function RightTabs({ hud, actions }: P) {
  const tabs: [Tab, string][] = [
    ['patients', T.tabs.patients],
    ['staff', T.tabs.staff],
    ['asks', T.doctor.asks.tab(hud.doctor?.state?.asks.length ?? 0)],
    ['journal', T.tabs.journal],
    ['reports', T.tabs.reports],
    ['goals', T.tabs.goals],
  ];
  let body: ReactNode = null;
  if (hud.tab === 'patients') body = <PatientsTab hud={hud} actions={actions} />;
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
  else if (hud.tab === 'asks') body = <Asks hud={hud} actions={actions} />;
  // планёрка и часы приёма (spec docs/specs/2026-10-economy.md)
  else if (hud.tab === 'reports') body = <Reports e={hud.economy} actions={actions} />;
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

/**
 * На место врача — терапевт или специалист (spec docs/specs/2026-10-specialists.md): список должностей с зарплатой и
 * «Нанять» одной строкой — карточка не растёт; подсказка выбранной должности — при наведении.
 */
function HirePick({ room, role, options, actions }: { room: string; role: string; options: { role: string; name: string; salary: string; hint: string }[]; actions: Actions }) {
  const [as, setAs] = useState(options[0].role);
  const o = options.find(x => x.role === as) ?? options[0];
  return (
    <span className="hires">
      <select id={`hire-${role.slice(5)}-as`} value={o.role} title={o.hint} onChange={ev => setAs(ev.target.value)}>
        {options.map(x => (
          <option key={x.role} value={x.role}>
            {T.card.hireOption(x.name, x.salary)}
          </option>
        ))}
      </select>
      <button type="button" className="small" id={`hire-${role.slice(5)}`} title={o.hint} onClick={() => actions.hire(room, role, o.role)}>
        {T.card.hireAs}
      </button>
    </span>
  );
}

/** Что делает пациент — для карточки: идёт — куда и к какому часу дойдёт. */
function doingLine(info: Extract<PersonInfo, { kind: 'patient' }>): string {
  const what = info.door ? (info.walking ? T.card.toDoor : T.card.atDoor) : info.walking ? T.going[info.doing] : T.doing[info.doing];
  return info.arrive !== undefined ? `${what} · ${T.card.arrives(clock(info.arrive))}` : what;
}

function personLines(info: PersonInfo, names: Names): [string, string][] {
  if (info.kind === 'staff') return [[T.card.staff, names.role(info.role)], [T.card.where, names.room(info.room)]];
  // ушёл — на карте его нет: кто и как пришёл, остальное — в пути (spec 2026-10-flow-ui)
  // записан к специалисту (spec docs/specs/2026-10-specialists.md): «по записи к гастроэнтерологу»
  const visit = info.to ? T.card.booked(names.dat(info.to)) : (T.visit[info.visit as keyof typeof T.visit] ?? info.visit);
  if (info.gone) return [[T.card.complaint, names.finding(info.complaint)], [T.card.visit, visit]];
  return [
    [T.card.complaint, names.finding(info.complaint)],
    // ещё идёт (spec docs/specs/2026-10-owner-play.md): куда, а не «у врача», и к какому часу дойдёт (spec 2026-10-walk);
    // следующий к врачу — у двери его кабинета
    [info.walking ? T.card.whereTo : T.card.where, info.room ? names.room(info.room) : T.card.corridor],
    [T.card.doing, doingLine(info)],
    [T.card.triage, T.triage[info.triage]],
    [T.card.by, info.by ? names.role(info.by) : T.card.byNobody],
    [T.card.visit, visit],
  ];
}

/** Подсказка первых минут (spec docs/specs/2026-10-aaa-polish.md, «Первые минуты»): одна строка внизу, крестик закрывает. */
function HintStrip({ hud, actions }: P) {
  const h = hud.hint;
  if (!h) return null;
  return (
    <div className="hintstrip panel" id="hint" data-key={h.key}>
      <span id="hint-text">{h.text}</span>
      <button type="button" className="close small" id="hint-close" onClick={actions.dismissHint} title={T.hints.close}>
        ✕
      </button>
    </div>
  );
}

function BottomCard({ hud, actions, names }: P) {
  if (hud.selected) {
    const info = hud.selected.info;
    const title = info.kind === 'patient' ? T.card.patient(info.sex, info.age, info.name) : names.role(info.role);
    return (
      <div className="card panel" id="card">
        <div className="cardhead">
          <b id="card-title">{title}</b>
          {info.kind === 'patient' ? <span className={`badge t-${info.triage}`} title={T.triage[info.triage]} /> : null}
          {/* «Следить» (spec docs/specs/2026-10-owner-play-2.md): камера идёт за ним; ушедший — только путь */}
          {info.kind === 'patient' && info.gone ? null : (
            <button type="button" id="card-follow" className={hud.following ? 'small on' : 'small'} title={T.card.followHint} onClick={actions.follow}>
              {T.card.follow}
            </button>
          )}
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
        {info.kind === 'patient' && !info.gone ? <TakeCase info={info} said={hud.doctor?.said} actions={actions} /> : null}
        {info.kind === 'patient' ? <PathSection hud={hud} /> : null}
      </div>
    );
  }
  if (hud.room) {
    const r = hud.room;
    if (r.state !== undefined)
      return (
        <div className="card panel" id="card">
          <div className="cardhead">
            <b id="card-title">{r.name}</b>
            <span className="muted">{r.id}</span>
            <button type="button" className="close" onClick={() => actions.select(undefined)} title="Esc">
              ✕
            </button>
          </div>
          <SiteCard r={r} actions={actions} hud={hud} />
        </div>
      );
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

/**
 * Начало игры (spec docs/specs/2026-10-build.md, «Начало игры»): пустое здание, поликлиника по нормам (spec
 * docs/specs/2026-10-real-hospital.md) или городская больница. Первые слова — о чём игра (spec
 * docs/specs/2026-10-aaa-polish.md, «Первые минуты»); имя игры — рабочее, марку решает владелец.
 */
/** С чего начинали — словами: пустое здание, поликлиника, городская больница. */
const startName = (start: string): string => (start === 'empty' ? T.start.empty : start === 'poly' ? T.start.poly : T.start.preset);

/** Когда записано — дата и время по часам компьютера. */
const when = (iso: string): string => {
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? '' : d.toLocaleString(lang === 'en' ? 'en-GB' : 'ru-RU', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' });
};

/** Строка сохранения: день и час, больница, какое, когда записано. */
function saveText(r: SaveRow): { title: string; sub: string } {
  const m = r.meta;
  if (!m) return { title: r.slot, sub: T.saves.noMeta };
  return { title: T.saves.row(m.day, clock(m.t)), sub: [startName(m.start), T.saves.kind[m.kind] ?? m.kind, T.saves.savedAt(when(m.savedAt))].join(' · ') };
}

/** Список сохранений (spec docs/specs/2026-10-saves.md): «Загрузить», в меню игры — и «Удалить». */
function SaveList({ rows, load, remove, prefix }: { rows: SaveRow[]; load: (slot: string) => void; remove?: (slot: string) => void; prefix: string }) {
  if (rows.length === 0) return <p className="muted small">{T.saves.none}</p>;
  return (
    <ul className="saves" id={`${prefix}-list`}>
      {rows.map(r => {
        const x = saveText(r);
        return (
          <li key={r.slot} id={`${prefix}-${r.slot}`}>
            <div className="who">
              <b>{x.title}</b> <small className="muted">{x.sub}</small>
            </div>
            <button type="button" className="small" id={`${prefix}-load-${r.slot}`} onClick={() => load(r.slot)}>
              {T.saves.load}
            </button>
            {remove ? (
              <button type="button" className="small" id={`${prefix}-remove-${r.slot}`} onClick={() => remove(r.slot)}>
                {T.saves.remove}
              </button>
            ) : null}
          </li>
        );
      })}
    </ul>
  );
}

/** Меню игры: «Сохранить», сохранения, «Новая игра». */
function GameMenu({ hud, actions }: P) {
  if (!hud.menu.open) return null;
  return (
    <div className="gamemenu panel" id="game-menu">
      <div className="row">
        <b>{T.saves.title}</b>
        <button type="button" className="close" onClick={actions.toggleMenu} title="Esc">
          ✕
        </button>
      </div>
      <button type="button" id="save-new" className="on" title={T.saves.saveHint} onClick={actions.saveGame}>
        {T.saves.save}
      </button>
      <SaveList rows={hud.menu.rows} load={actions.loadGame} remove={actions.deleteGame} prefix="save" />
      <button type="button" id="new-game" title={T.saves.newGameHint} onClick={actions.newGame}>
        {T.saves.newGame}
      </button>
    </div>
  );
}

function StartChooser({ hud, actions }: P) {
  const saves = hud.startSaves ?? [];
  // «Продолжить» — самое новое сохранение с шапкой
  const last = saves.find(r => r.meta);
  return (
    <div className="start panel" id="start">
      <div className="game">{T.app.title}</div>
      <p className="intro">{T.start.intro}</p>
      {hud.startProblem ? (
        <div className="ghostline bad" id="start-problem">
          {hud.startProblem}
        </div>
      ) : null}
      {last ? (
        <button type="button" id="start-continue" className="on" onClick={() => actions.startGame({ load: last.slot })}>
          <b>{T.saves.continue}</b>
          <span>
            {saveText(last).title} · {saveText(last).sub}
          </span>
        </button>
      ) : null}
      <h2>{T.start.title}</h2>
      <button type="button" id="start-empty" onClick={() => actions.startGame('empty')}>
        <b>{T.start.empty}</b>
        <span>{T.start.emptyHint}</span>
      </button>
      <button type="button" id="start-poly" onClick={() => actions.startGame('poly')}>
        <b>{T.start.poly}</b>
        <span>{T.start.polyHint}</span>
      </button>
      <button type="button" id="start-preset" onClick={() => actions.startGame('preset')}>
        <b>{T.start.preset}</b>
        <span>{T.start.presetHint}</span>
      </button>
      {saves.length > 1 ? (
        <>
          <h2>{T.saves.loadTitle}</h2>
          <SaveList rows={saves} load={slot => actions.startGame({ load: slot })} prefix="start-save" />
        </>
      ) : null}
      <div className="muted small">{T.start.version(hud.version)}</div>
    </div>
  );
}

export function App({ store, actions, names }: { store: Store; actions: Actions; names: Names }) {
  // язык меняется на ходу: строки читаются при отрисовке, смена языка — новый снимок хранилища
  const hud = useHud(store);
  const p = { hud, actions, names };
  if (hud.choose) return <StartChooser {...p} />;
  return (
    <>
      <TopBar {...p} />
      {/* под часами посередине: «закрыта» — что не так, подсказка первых минут — что сделать, последнее извещение (spec 2026-10-aaa-polish) */}
      <div className="topcenter" id="topcenter">
        {hud.closed ? (
          <div className="banner panel" id="closed" title={T.top.closedHint}>
            {T.top.closed(hud.closed)}
          </div>
        ) : null}
        <HintStrip {...p} />
        <Notice {...p} />
      </div>
      <ViewBar {...p} />
      <LeftTools {...p} />
      <GameMenu {...p} />
      <RightTabs {...p} />
      <BottomCard {...p} />
      {!hud.build.on ? <Dock hud={hud} actions={actions} /> : null}
      {hud.doctor?.card ? <Card key={hud.doctor.card.id} v={hud.doctor.card} level={hud.doctor.level} meanwhile={hud.doctor.meanwhile} next={hud.doctor.next} actions={actions} /> : null}
      {/* планёрка в 08:00 (spec docs/specs/2026-10-economy.md) — когда карта пациента закрыта */}
      {hud.economy?.open && !hud.doctor?.card ? <Meeting e={hud.economy} actions={actions} /> : null}
      {hud.debug ? <DebugMenu {...p} /> : null}
      {!hud.ready || hud.status || hud.error ? (
        <div className="status panel" id="status">
          {hud.error ? `${T.app.error}: ${hud.error}` : hud.status || T.app.loading}
        </div>
      ) : null}
    </>
  );
}
