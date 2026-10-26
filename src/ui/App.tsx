// Панели игры (spec docs/specs/2026-10-shell-3d.md, «Панели»; геймдизайн §12): сверху — день и часы, скорость, касса,
// репутация, стройка, извещения; слева — стройка (spec docs/specs/2026-10-build.md) и слои; справа — вкладки; снизу —
// карточка выбранного. Панели тонкие: читают хранилище (store.ts) и просят игру (Actions); 3D-кадр живёт вне React.
import { type ReactNode, useEffect, useState } from 'react';
import { medicLine, rideLine, wheelLine } from '../app/flow';
import type { SaveRow } from '../app/saves';
import { clock, factor, type Lang, lang, money, T } from '../i18n';
import { lowerFirst } from '../i18n/case';
import type { PersonInfo } from '../render/population';
import type { WallMode } from '../render/world';
import { Card } from './doctor/Card';
import { Encyclopedia, openEncyclopedia } from './Encyclopedia';
import { Asks, Dock, OfficeRow, TakeCase } from './doctor/Dock';
import { ROLES } from '../app/roles';
import { toastsOf } from '../app/toasts';
import { type QualityMode, TEXT_SCALES } from '../app/settings';
import { Meeting, Reports, signed } from './Meeting';
import { DeptLegend, Layers, PathSection, PatientsTab } from './flow';
import { byGuide, GoalsTab, GuideToggle, LetterCard, ScenarioDone, StepMark } from './Scenario';
import { type Actions, type Hud, type Level, type LevelRow, type RoomCard, type Speed, type Store, type Tab, type Tool, useHud } from './store';
import type { Id, Manage } from '../content/types';

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
      {/* крупный текст на узком экране — с многоточием; целиком — в подсказке */}
      <span className="stat" id="counts" title={`${T.top.arrived} ${hud.arrived} · ${T.top.seen} ${hud.seen} · ${T.top.left} ${hud.left} · ${T.top.queue} ${hud.queue}`}>
        {T.top.arrived} <b>{hud.arrived}</b> · {T.top.seen} <b>{hud.seen}</b> · {T.top.left} <b>{hud.left}</b> · {T.top.queue} <b>{hud.queue}</b>
      </span>

      {hud.lag > 2 ? <span className="stat warn">{T.top.lag(Math.round(hud.lag))}</span> : null}
    </div>
  );
}

/**
 * Извещения всплывающими строками под часами (spec docs/specs/2026-10-aaa-polish.md, «Извещения»): последние три, новое
 * сверху; гаснут сами (`toastsOf`), срочное — с красной полосой и дольше; щелчок по строке с больным — камера к нему. Вся
 * лента — в «Журнале».
 */
function Toasts({ hud, actions }: P) {
  const [now, setNow] = useState(() => performance.now());
  const rows = toastsOf(hud.notices, now, hud.t);
  const live = rows.length > 0;
  // пока строки на экране — часы окна, чтобы они гасли и без новых извещений
  useEffect(() => {
    if (!live) return;
    const id = setInterval(() => setNow(performance.now()), 250);
    return () => clearInterval(id);
  }, [live]);
  if (!live) return null;
  return (
    <div className="toasts" id="toasts">
      {rows.map(({ n, opacity }) => (
        <div
          key={n.at}
          className={`notice panel toast${n.tone ? ` ${n.tone}` : ''}${n.who ? ' go' : ''}`}
          style={{ opacity }}
          title={n.who ? T.top.toastFind : undefined}
          onClick={n.who ? () => actions.find(n.who!) : undefined}
        >
          {clock(n.t)} {n.text}
        </div>
      ))}
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
 * «Настройки» (spec docs/specs/2026-10-settings.md; решение владельца #70): стены и камера — по умолчанию вид владельца,
 * «вниз» и перспектива; качество — «авто» по первым секундам игры или своё; «Отладка». Запоминаются на этом компьютере.
 * Открываются из меню «Игра»; кнопки вида на экране больше нет — камера клавишами.
 */
function SettingsPanel({ hud, actions }: P) {
  if (!hud.settingsOpen) return null;
  const t = T.settings;
  const walls: [WallMode, string][] = [
    ['full', T.view.wallsFull],
    ['cut', T.view.wallsCut],
    ['down', T.view.wallsDown],
  ];
  const q: [QualityMode, string][] = [
    ['auto', hud.qualityMode === 'auto' && hud.autoQuality ? t.autoChose(T.view[hud.autoQuality]) : t.auto],
    ['low', T.view.low],
    ['medium', T.view.medium],
    ['high', T.view.high],
  ];
  return (
    <div className="settings panel" id="settings" role="dialog" aria-labelledby="settings-title">
      <div className="row">
        <b id="settings-title">{t.title}</b>
        <button type="button" className="close" id="settings-close" onClick={actions.toggleSettings} title="Esc">
          ✕
        </button>
      </div>
      <div className="label">{T.view.walls}</div>
      <div className="row">
        {walls.map(([m, s]) => (
          <Btn key={m} id={`walls-${m}`} on={hud.walls === m} onClick={() => actions.setWalls(m)}>
            {s}
          </Btn>
        ))}
      </div>
      <div className="label">{T.view.camera}</div>
      <div className="row">
        <Btn id="camera-persp" on={hud.projection === 'persp'} onClick={() => actions.setProjection('persp')}>
          {T.view.persp}
        </Btn>
        <Btn id="camera-ortho" on={hud.projection === 'ortho'} onClick={() => actions.setProjection('ortho')}>
          {T.view.ortho}
        </Btn>
      </div>
      <p className="muted small">{t.keys}</p>
      <div className="label">{T.view.quality}</div>
      <div className="row">
        {q.map(([m, s]) => (
          <Btn key={m} id={`quality-${m}`} on={hud.qualityMode === m} onClick={() => actions.setQualityMode(m)} title={m === 'auto' ? t.autoHint : undefined}>
            {s}
          </Btn>
        ))}
      </div>
      {/* размер текста (spec docs/specs/2026-10-settings.md, «Размер текста»): панели и подписи на карте */}
      <div className="label">{t.text}</div>
      <div className="row">
        {TEXT_SCALES.map((k, i) => (
          <Btn key={k} id={`text-${i}`} on={hud.text === k} onClick={() => actions.setText(k)}>
            {t.textSize[i]}
          </Btn>
        ))}
      </div>
      <label className="check">
        <input type="checkbox" id="debug" checked={hud.debug} onChange={actions.toggleDebug} /> {T.view.debug}
      </label>
      <p className="muted small">{t.where}</p>
      {/* сложность этой игры (spec docs/specs/2026-10-difficulty.md, часть 2; решение владельца #136): в любой момент */}
      <h3 className="sub">{T.manage.title}</h3>
      <Difficulty level={{ manage: hud.manage, soft: hud.soft }} set={l => (l.manage !== hud.manage ? actions.setManage(l.manage) : actions.setSoft(l.soft))} />
      <p className="muted small">{T.manage.now}</p>
    </div>
  );
}

const MANAGES: readonly Manage[] = ['calm', 'normal', 'hard'];

/**
 * Сложность (spec docs/specs/2026-10-difficulty.md, часть 2; решения владельца #135–#137): уровень «Управления» — три кнопки,
 * под ними — что он меняет и его числа из базы; «Мягкий режим» — галочка. На втором шаге экрана начала и в «Настройках».
 * `cash` — касса начала этого начала; у сценария она своя — нет.
 */
function Difficulty({ level, set, row, cash }: { level: Level; set: (l: Level) => void; row?: LevelRow; cash?: number }) {
  const t = T.manage;
  return (
    <div className="difficulty" id="difficulty">
      <div className="label">{t.axis}</div>
      <div className="row">
        {MANAGES.map(m => (
          <Btn key={m} id={`manage-${m}`} on={level.manage === m} onClick={() => set({ ...level, manage: m })}>
            {t.name[m]}
          </Btn>
        ))}
      </div>
      <p className="small" id="manage-line">
        {t.line[level.manage]}
      </p>
      {row ? (
        <p className="muted small" id="manage-numbers">
          {t.numbers(factor(row.inflow), factor(row.patience), factor(row.salary), factor(row.breakdown), row.overdraft !== undefined ? money(row.overdraft) : '—', cash !== undefined ? money(cash) : undefined)}
        </p>
      ) : null}
      <label className="check">
        <input type="checkbox" id="soft" checked={level.soft} onChange={e => set({ ...level, soft: e.target.checked })} /> {t.soft}
      </label>
      <p className="muted small">{t.softHint}</p>
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
    ['bench', '▬', T.build.bench],
    ['demolish', '✖', T.build.demolish],
  ];
  let body: ReactNode = null;
  // порядок стройки сценария (решение владельца #114): шаги — первыми, с номером; у следующего — зачем он
  const why = (step?: { next: boolean; why: string }) => (step?.next ? <div className="gwhy">{T.scenario.guideNext}: {step.why}</div> : null);
  // готовые помещения (spec docs/specs/2026-10-ready-rooms.md): тип, образцы S/M/L, «С персоналом»
  if (b.tool === 'ready')
    body = (
      <>
        <ul className="list" id="ready-types">
          {catalogEntries(hud.readyTypes, hud).map(e => {
            if ('head' in e) return <GroupHead key={`g-${e.head.id}`} g={e.head} />;
            const { row: t, step } = e;
            const on = b.ready?.type === t.id;
            // миниатюра образца (spec docs/specs/2026-10-catalog.md): у выбранного — его образец, у остальных — первый
            const thumb = hud.thumbs[`${t.id}|${on && b.ready ? b.ready.size : t.sizes[0].id}`];
            return (
              <li key={t.id} className={step?.next ? 'gnext' : undefined}>
                <button type="button" id={`ready-${t.id.slice(5)}`} className={on ? 'thumbed on' : 'thumbed'} onClick={() => actions.pickReady(t.id)}>
                  {thumb ? <img className="thumb" src={thumb} alt="" draggable={false} /> : <i className="thumb" aria-hidden="true" />}
                  <span>
                    <StepMark step={step} />
                    {t.name}
                  </span>
                  <small>{on ? (t.sizes.find(z => z.id === b.ready?.size)?.text ?? t.price) : t.price}</small>
                </button>
                {why(step)}
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
        {catalogEntries(hud.roomTypes, hud).map(e =>
          'head' in e ? (
            <GroupHead key={`g-${e.head.id}`} g={e.head} />
          ) : (
          <li key={e.row.id} className={e.step?.next ? 'gnext' : undefined}>
            <button type="button" id={`rt-${e.row.id.slice(5)}`} className={b.roomType === e.row.id ? 'on' : undefined} onClick={() => actions.pickRoomType(e.row.id)}>
              <span>
                <StepMark step={e.step} />
                {e.row.name}
              </span>
              <small>
                {e.row.min} · {e.row.price}
              </small>
            </button>
            {why(e.step)}
          </li>
          ),
        )}
      </ul>
    );
  // отделение (spec docs/specs/2026-10-departments.md, часть 2): в какое переводить; «Без отметки» — снять отметку
  else if (b.tool === 'dept')
    body = (
      <ul className="list" id="dept-list">
        {hud.departments.map(d => (
          <li key={d.id}>
            <button type="button" id={`dept-${d.id.slice(5)}`} className={b.dept === d.id ? 'on' : undefined} onClick={() => actions.pickDept(d.id)}>
              <span>
                <span className="swatch" style={{ background: d.color }} />
                {d.name}
              </span>
            </button>
          </li>
        ))}
        <li>
          <button type="button" id="dept-none" className={b.dept === null ? 'on' : undefined} onClick={() => actions.pickDept(null)} title={T.build.deptNoneHint}>
            <span>{T.build.deptNone}</span>
          </button>
        </li>
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
      {hud.departments.length ? (
        <button type="button" id="tool-dept" className={`wide${b.tool === 'dept' ? ' on' : ''}`} onClick={() => actions.setTool(b.tool === 'dept' ? undefined : 'dept')} title={T.build.deptHint}>
          <span className="swatches">
            {hud.departments.map(d => (
              <span key={d.id} className="swatch" style={{ background: d.color }} />
            ))}
          </span>
          {T.build.dept}
        </button>
      ) : null}
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
      {hud.scenario?.guide && (b.tool === 'ready' || b.tool === 'room') ? <GuideToggle s={hud.scenario} actions={actions} id="guide-toggle" /> : null}
      <div className="hint">{T.build.keys}</div>
    </div>
  );
}

/** Группа каталога стройки (spec docs/specs/2026-10-catalog.md): заголовок строкой списка, у отделения — квадратик его цвета. */
type CatalogGroup = Hud['catalogGroups'][number];

const GroupHead = ({ g }: { g: CatalogGroup }) => (
  <li className="ghead" data-group={g.id}>
    {g.color ? <span className="swatch" style={{ background: g.color }} /> : null}
    {g.name}
  </li>
);

/**
 * Строки каталога стройки: шаги порядка стройки сценария — первыми, с номером (решение владельца #114); остальное — по
 * группам каталога, с заголовком (spec docs/specs/2026-10-catalog.md).
 */
function catalogEntries<R extends { id: Id; group: string }>(rows: readonly R[], hud: Hud): ({ head: CatalogGroup } | ReturnType<typeof byGuide<R>>[number])[] {
  const all = byGuide(rows, hud.scenario);
  const rest = all.filter(x => !x.step);
  const out: ({ head: CatalogGroup } | (typeof all)[number])[] = all.filter(x => x.step);
  for (const g of hud.catalogGroups) {
    const rs = rest.filter(x => x.row.group === g.id);
    if (rs.length) out.push({ head: g }, ...rs);
  }
  // группа не из списка — в конце, без заголовка
  out.push(...rest.filter(x => !hud.catalogGroups.some(g => g.id === x.row.group)));
  return out;
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
        {r.dept ? (
          <div>
            <dt>{T.card.dept}</dt>
            <dd id="card-dept">
              <span className="swatch" style={{ background: r.dept.color }} />
              <span id="card-dept-name">{r.dept.name}</span>
              {r.dept.why ? <span className="muted"> · {r.dept.why}</span> : null}
              {r.dept.value !== undefined ? (
                <select id="card-dept-pick" value={r.dept.value} title={T.card.deptPickHint} onChange={e => actions.markDept(r.id, e.target.value || null)}>
                  <option value="">{T.build.deptNone}</option>
                  {hud.departments.map(d => (
                    <option key={d.id} value={d.id}>
                      {d.name}
                    </option>
                  ))}
                </select>
              ) : null}
            </dd>
          </div>
        ) : null}
        <div className="posts">
          <dt>{T.card.posts}</dt>
          <dd>
            {r.posts?.length ? <Posts r={r} actions={actions} /> : '—'}
            {r.note ? (
              <div className="muted" id="card-note">
                {r.note}
              </div>
            ) : null}
          </dd>
        </div>
      </dl>
      <MoneyChart r={r} />
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

/**
 * Деньги помещения по суткам (spec docs/specs/2026-10-metrics-layer.md, часть 2): за прошедшие сутки и сегодня до сих пор —
 * пара столбиков, выручка и расходы; наведение — числа. У служебного выручки нет: оно работает на всю больницу.
 */
function MoneyChart({ r }: { r: RoomCard }) {
  const days = r.money ?? [];
  // денег у помещения ещё не было — раздела нет: карточка растёт снизу вверх и не закрывает план зря
  if (!days.some(d => d.income > 0 || d.expenses > 0)) return null;
  const top = Math.max(1, ...days.flatMap(d => [d.income, d.expenses]));
  const w = 280;
  const h = 40;
  const slot = w / days.length;
  const bar = Math.max(2, Math.min(9, slot / 2 - 1));
  return (
    <div className="moneychart" id="room-money">
      <div className="label">
        {T.metrics.chart}
        {r.service ? <span className="muted"> — {T.metrics.serviceRevenue}</span> : null}
        <span className="legend">
          <i className="sw inc" /> {T.metrics.chartIncome} <i className="sw exp" /> {T.metrics.chartExpenses}
        </span>
      </div>
      <svg viewBox={`0 0 ${w} ${h}`} preserveAspectRatio="none" role="img" aria-label={T.metrics.chart}>
        {days.map((d, i) => {
          const x = i * slot + slot / 2;
          const hi = (d.income / top) * (h - 2);
          const he = (d.expenses / top) * (h - 2);
          return (
            <g key={d.day ?? 'now'} className={d.day === null ? 'now' : undefined}>
              <title>{`${d.day === null ? T.metrics.today : T.metrics.dayN(d.day)}: ${T.metrics.chartIncome} ${money(d.income)}, ${T.metrics.chartExpenses} ${money(d.expenses)}`}</title>
              <rect x={x - bar - 0.5} y={h - hi} width={bar} height={hi} className="inc" />
              <rect x={x + 0.5} y={h - he} width={bar} height={he} className="exp" />
            </g>
          );
        })}
      </svg>
    </div>
  );
}

function RightTabs({ hud, actions }: P) {
  // «Персонал»: только кто сейчас в смене (spec docs/specs/2026-10-staff-shifts.md)
  const [onDuty, setOnDuty] = useState(false);
  const tabs: [Tab, string][] = [
    ['patients', T.tabs.patients],
    ['staff', T.tabs.staff],
    // просьбы и решения врачей на утверждении (spec docs/specs/2026-10-two-ways.md, F3): счётчик — в названии вкладки
    ['asks', T.doctor.asks.tab((hud.doctor?.state?.asks.length ?? 0) + (hud.doctor?.state?.decisions.length ?? 0))],
    ['journal', T.tabs.journal],
    ['reports', T.tabs.reports],
    ['goals', T.tabs.goals],
  ];
  let body: ReactNode = null;
  if (hud.tab === 'patients') body = <PatientsTab hud={hud} actions={actions} />;
  else if (hud.tab === 'staff')
    body = (
      <>
        <label className="check">
          <input type="checkbox" id="staff-on-duty" checked={onDuty} onChange={e => setOnDuty(e.target.checked)} /> {T.card.onDutyOnly}
        </label>
        {/* «Нанять в резерв» (spec docs/specs/2026-10-staff-mood.md, часть 5; решение владельца #97) */}
        {hud.reserveHire.length > 0 ? (
          <div className="reserve" id="reserve-hire" title={T.card.reserveHireHint}>
            <span className="label">{T.card.reserveHire}</span>
            {hud.reserveHire.map(r => (
              <button key={r.role} type="button" className="small" data-role={r.role} title={T.card.reserveHireHint} onClick={() => actions.reserve(r.role)}>
                {r.text}
              </button>
            ))}
          </div>
        ) : null}
        <ul>
          {hud.staffList
            .filter(p => !onDuty || p.on)
            .map(p => (
              <li key={p.key}>
                <button type="button" className={`${p.on ? 'row' : 'row muted'}${p.bad ? ' bad' : ''}`} onClick={() => actions.select(p.key)}>
                  {p.text}
                </button>
              </li>
            ))}
        </ul>
      </>
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
  // цели сценария (spec docs/specs/2026-10-scenario-1.md); у песочницы целей нет
  else if (hud.tab === 'goals' && hud.scenario) body = <GoalsTab s={hud.scenario} actions={actions} />;
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
 * Должности помещения — строка на должность (spec docs/specs/2026-10-staff-shifts.md): «Регистратор · день Иванова · 3
 * [Уволить] · ночь [Нанять · 1 625 ₽]»; кто без смены (сохранение до смен) — «круглые сутки». Полные слова найма — в
 * подсказке кнопки: карточка не растёт и не закрывает карту.
 */
function Posts({ r, actions }: { r: RoomCard; actions: Actions }) {
  const posts = r.posts ?? [];
  const roles = [...new Set(posts.map(p => p.role))];
  return (
    <>
      {roles.map(role => {
        const rows = posts.filter(p => p.role === role);
        return (
          <div key={role} className="post">
            <span className="prole" data-enc={role} title={rows[0].optional}>
              {rows[0].name}
            </span>
            {rows.map(p => {
              // смены: строка ночной смены — свои номера кнопок
              const id = `${p.role.slice(5)}${p.shift === 'night' ? '-night' : ''}`;
              const shift = p.shift === 'night' || p.shift === 'day' ? p.shift : undefined;
              return (
                <span key={p.shift ?? 'you'} className="pshift">
                  {p.shift ? <span className="muted shift">{T.card.shifts[p.shift]}</span> : null}
                  {p.you ? (
                    <span className="muted">{T.card.you}</span>
                  ) : p.who ? (
                    <>
                      <span>{p.who}</span>
                      <button type="button" className="small" id={`dismiss-${id}`} title={p.fire} onClick={() => actions.dismiss(p.staffId!)}>
                        {T.card.dismiss}
                      </button>
                    </>
                  ) : p.options ? (
                    <HirePick room={r.id} role={p.role} id={id} shift={shift} options={p.options} actions={actions} />
                  ) : (
                    <button type="button" className="small" id={`hire-${id}`} title={T.card.hire(p.name, p.salary, shift === 'night')} onClick={() => actions.hire(r.id, p.role, undefined, shift)}>
                      {T.card.hireShort(p.salary)}
                    </button>
                  )}
                </span>
              );
            })}
            {/* должность по желанию (санитар, spec docs/specs/2026-10-orderlies.md): что без неё — строкой ниже */}
            {rows[0].optional ? <span className="muted optional">{rows[0].optional}</span> : null}
          </div>
        );
      })}
    </>
  );
}

/**
 * На место врача — терапевт или специалист (spec docs/specs/2026-10-specialists.md): список должностей с зарплатой и
 * «Нанять» одной строкой — карточка не растёт; подсказка выбранной должности — при наведении.
 */
function HirePick({ room, role, id, shift, options, actions }: { room: string; role: string; id: string; shift?: 'day' | 'night'; options: { role: string; name: string; salary: string; hint: string }[]; actions: Actions }) {
  const [as, setAs] = useState(options[0].role);
  const o = options.find(x => x.role === as) ?? options[0];
  return (
    <span className="hires">
      <select id={`hire-${id}-as`} value={o.role} title={o.hint} onChange={ev => setAs(ev.target.value)}>
        {options.map(x => (
          <option key={x.role} value={x.role}>
            {T.card.hireOption(x.name, x.salary)}
          </option>
        ))}
      </select>
      <button type="button" className="small" id={`hire-${id}`} title={o.hint} onClick={() => actions.hire(room, role, o.role, shift)}>
        {T.card.hireAs}
      </button>
    </span>
  );
}

/** Что делает пациент — для карточки: идёт — куда и к какому часу дойдёт; везут на каталке — откуда и куда. */
function doingLine(info: Extract<PersonInfo, { kind: 'patient' }>, names: Names): string {
  if (info.gurney) return wheelLine(info.gurney, id => lowerFirst(names.room(id)));
  // решение его врача ждёт главврача (spec docs/specs/2026-10-two-ways.md, F3): у двери кабинета или на своей койке
  if (info.approve !== undefined) return T.card.approve(clock(info.approve));
  const what = info.door ? (info.walking ? T.card.toDoor : T.card.atDoor) : info.walking ? T.going[info.doing] : T.doing[info.doing];
  return info.arrive !== undefined ? `${what} · ${T.card.arrives(clock(info.arrive))}` : what;
}

/** Перерыв человека штата (spec docs/specs/2026-10-staff-shifts.md, часть 2): идёт в ординаторскую, там, идёт назад. */
function restLine(r: NonNullable<Extract<PersonInfo, { kind: 'staff' }>['rest']>): string {
  const until = clock(r.until);
  if (r.phase === 'back') return T.card.rest.back(until);
  if (r.kind === 'toilet') return T.card.rest.toilet(until);
  if (r.kind === 'here') return T.card.rest.here(until);
  return r.phase === 'go' ? T.card.rest.toStaff(until) : T.card.rest.staff(until);
}

function personLines(info: PersonInfo, names: Names): [string, string][] {
  // фельдшер скорой (spec docs/specs/2026-10-orderlies.md): кого привёз и что с ним
  if (info.kind === 'medic') return [[T.card.doing, medicLine(info)]];
  // смены (spec docs/specs/2026-10-staff-shifts.md): чья смена; не в больнице — дома до своей смены; на перерыве — где и до
  // какого часа (часть 2)
  if (info.kind === 'staff') {
    const h = info.hours;
    return [
      [T.card.staff, names.role(info.role)],
      // имя и зарплата против рынка (spec docs/specs/2026-10-staff-mood.md); навык, до следующего и наставник (раздел 3)
      ...(info.name ? [[T.card.name, info.name] as [string, string]] : []),
      ...(info.skill !== undefined ? [[T.card.skill, T.card.skillLine(info.skill, info.steps, info.mentor)] as [string, string]] : []),
      // резерв (spec docs/specs/2026-10-staff-mood.md, часть 5): без места; замещает — кого и почему его нет; у отсутствующего — замена
      [T.card.where, info.reserve ? T.card.reserveWhere : info.home && h ? T.card.home(clock(h[0] * 3600)) : names.room(info.room)],
      ...(info.covers ? [[T.card.covers, info.covers.away ? T.card.coversLine(info.covers.who, awayLine(info.covers.away, info.covers.sex)) : info.covers.who] as [string, string]] : []),
      ...(info.coveredBy ? [[T.card.coveredBy, info.coveredBy] as [string, string]] : []),
      ...(info.shift && h ? [[T.card.shift, T.card.shiftLine(info.shift, clock(h[0] * 3600), clock(h[1] * 3600))] as [string, string]] : []),
      ...(info.pay ? [[T.card.salary, (info.reserve ? T.card.salaryDayLine : T.card.salaryLine)(money(info.pay.now), money(info.pay.market))] as [string, string]] : []),
      ...(info.rest ? [[T.card.doing, restLine(info.rest)] as [string, string]] : []),
      // везёт каталку или свободен у каталки (spec docs/specs/2026-10-orderlies.md, «Что видно»)
      ...(info.ride ? [[T.card.doing, rideLine(info.ride, id => lowerFirst(names.room(id)))] as [string, string]] : []),
      ...(info.free ? [[T.card.doing, T.card.ride.free(info.sex === 'f')] as [string, string]] : []),
      // учится или болеет (разделы 4–5)
      ...(info.away ? [[T.card.doing, awayLine(info.away, info.sex)] as [string, string]] : []),
    ];
  }
  // ушёл — на карте его нет: кто и как пришёл, остальное — в пути (spec 2026-10-flow-ui)
  // записан к специалисту (spec docs/specs/2026-10-specialists.md): «по записи к гастроэнтерологу»; направлен к врачу (часть 2)
  // — «сам · направлен к гастроэнтерологу»
  const came = info.to ? T.card.booked(names.dat(info.to)) : (T.visit[info.visit as keyof typeof T.visit] ?? info.visit);
  const visit = info.ref && info.by ? `${came} · ${T.card.referred(names.dat(info.by), info.sex === 'f')}` : came;
  if (info.gone) return [[T.card.complaint, names.finding(info.complaint)], [T.card.visit, visit]];
  return [
    [T.card.complaint, names.finding(info.complaint)],
    // ещё идёт (spec docs/specs/2026-10-owner-play.md): куда, а не «у врача», и к какому часу дойдёт (spec 2026-10-walk);
    // следующий к врачу — у двери его кабинета
    [info.walking ? T.card.whereTo : T.card.where, info.room ? names.room(info.room) : T.card.corridor],
    [T.card.doing, doingLine(info, names)],
    [T.card.triage, T.triage[info.triage]],
    [T.card.by, info.by ? names.role(info.by) : T.card.byNobody],
    [T.card.visit, visit],
  ];
}

/** Учится или болеет (spec docs/specs/2026-10-staff-mood.md, разделы 4–5): до утра каких суток или сегодня не вышел. */
function awayLine(away: { why: 'study' | 'sick'; until: number }, sex: 'm' | 'f'): string {
  return away.why === 'study' ? T.card.awayStudy(Math.floor(away.until / 86400) + 1) : T.card.awaySick(sex);
}

/** Усталость полоской (spec docs/specs/2026-10-staff-shifts.md, часть 2): число и что оно значит. */
function Fatigue({ value, worn }: { value: number; worn?: 'slow' | 'blur' }) {
  return (
    <div className="fatigue" id="card-fatigue" data-value={value}>
      <span className="label">{T.card.fatigue}</span>
      <span className={`fbar${worn ? ` f-${worn}` : ''}`}>
        <i style={{ width: `${Math.min(100, value)}%` }} />
      </span>
      <span>
        {value}
        {worn ? <span className="muted"> — {T.card.worn[worn]}</span> : null}
      </span>
    </div>
  );
}

/**
 * Настроение человека штата (spec docs/specs/2026-10-staff-mood.md): число, стрелка за сутки и две главные причины;
 * «собирается уйти» — до каких суток ответить, «уходит» — в котором часу; «Поднять зарплату» и «В другую смену».
 */
function Mood({ info, actions }: { info: Extract<PersonInfo, { kind: 'staff' }>; actions: Actions }) {
  const m = info.mood;
  const id = info.id;
  if (!m || id === undefined) return null;
  const why = (m.why ?? []).slice(0, 2).join(', ');
  return (
    <div className="mood" id="card-mood" data-value={m.v}>
      <div className={m.v < 30 ? 'bad' : undefined}>
        <span className="label">{T.card.mood}</span> <b>{m.v}</b>
        {m.d ? <span className="muted"> {T.card.moodDelta(m.d)}</span> : null}
        {why ? <span className="muted"> — {why}</span> : null}
      </div>
      {m.go !== undefined ? (
        <div className="bad" id="card-leaving">
          {T.card.leavingAt(clock(m.go))}
        </div>
      ) : m.quit !== undefined ? (
        <div className="bad" id="card-quit">
          {T.card.quitting(m.quit)}
        </div>
      ) : null}
      <div className="row">
        {info.pay?.raise !== undefined ? (
          <button type="button" className="small" id="card-raise" title={T.card.raiseHint} onClick={() => actions.raise(id)}>
            {T.card.raise(money(info.pay.now), money(info.pay.raise))}
          </button>
        ) : null}
        {info.reshift ? (
          <button type="button" className="small" id="card-reshift" title={T.card.reshiftHint(info.reshift.with)} onClick={() => actions.reshift(id)}>
            {T.card.reshift(info.reshift.to)}
          </button>
        ) : null}
        {info.study ? (
          <button type="button" className="small" id="card-study" title={T.card.studyHint} onClick={() => actions.study(id)}>
            {T.card.study(info.study.days, money(info.study.cost))}
          </button>
        ) : null}
      </div>
      {info.said ? (
        <div className={info.said.ok ? 'ok' : 'bad'} id="card-mood-said">
          {info.said.text}
        </div>
      ) : null}
    </div>
  );
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
    const title = info.kind === 'patient' ? T.card.patient(info.sex, info.age, info.name) : info.kind === 'medic' ? T.card.medic : names.role(info.role);
    return (
      <div className="card panel" id="card">
        <div className="cardhead">
          <b id="card-title" data-enc={info.kind === 'staff' ? info.role : undefined}>
            {title}
          </b>
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
        {info.kind === 'staff' && info.fatigue !== undefined ? <Fatigue value={info.fatigue} worn={info.worn} /> : null}
        {info.kind === 'staff' ? <Mood info={info} actions={actions} /> : null}
        {/* в резерве (spec docs/specs/2026-10-staff-mood.md, часть 5): места с «Уволить» у него нет — здесь */}
        {info.kind === 'staff' && info.fire !== undefined && info.id !== undefined ? (
          <div className="row">
            <button type="button" className="small" id="card-dismiss" onClick={() => actions.dismiss(info.id!)}>
              {T.card.dismissHint(money(info.fire))}
            </button>
          </div>
        ) : null}
        {/* ушедший — только карта, сутки (spec docs/specs/2026-10-discharged-card.md) */}
        {info.kind === 'patient' ? <TakeCase info={info} said={hud.doctor?.said} actions={actions} /> : null}
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
            <b id="card-title" data-enc={r.type}>
              {r.name}
            </b>
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
          <b id="card-title" data-enc={r.type}>
            {r.name}
          </b>
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
/** Названия сценариев для строк сохранений (spec docs/specs/2026-10-scenario-1.md): их кладёт экран начала и игра. */
let scenarioNames: Record<string, string> = {};

/** Когда записано — дата и время по часам компьютера. */
const when = (iso: string): string => {
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? '' : d.toLocaleString(lang === 'en' ? 'en-GB' : 'ru-RU', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' });
};

/** Строка сохранения: день и час, больница, какое, когда записано. */
function saveText(r: SaveRow): { title: string; sub: string } {
  const m = r.meta;
  if (!m) return { title: r.slot, sub: T.saves.noMeta };
  const from = m.scenario ? (scenarioNames[m.scenario] ?? m.scenario) : startName(m.start);
  // сложность (spec docs/specs/2026-10-difficulty.md, часть 2): сохранения до неё — «Обычно»
  const level = T.manage.save(T.manage.name[m.manage ?? 'normal'], m.soft === true);
  return { title: T.saves.row(m.day, clock(m.t)), sub: [from, level, T.saves.kind[m.kind] ?? m.kind, T.saves.savedAt(when(m.savedAt))].join(' · ') };
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

/** Меню игры: «Сохранить», сохранения, «Новая игра», «Настройки». */
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
      {/* «Без обучения» (spec docs/specs/2026-10-scenario-1.md) — и в меню, не только в первом письме */}
      {hud.scenario ? (
        <label className="check" title={T.scenario.offHint}>
          <input type="checkbox" id="menu-tutorial" checked={!hud.scenario.off} onChange={e => actions.scenario({ kind: 'off', on: !e.target.checked })} />
          {T.scenario.tutorial}: {T.scenario.tutorialOn}
        </label>
      ) : null}
      {/* настройки (spec docs/specs/2026-10-settings.md): вид и качество — здесь, а не кнопкой на экране */}
      <button
        type="button" id="settings-open" title={T.settings.openHint}
        onClick={() => {
          actions.toggleMenu();
          actions.toggleSettings();
        }}
      >
        ⚙ {T.settings.open}
      </button>
    </div>
  );
}

/** Сложность новой игры по умолчанию: «Обычно», мягкий режим выключен (решение владельца #137). */
const NORMAL: Level = { manage: 'normal', soft: false };

/**
 * Второй шаг экрана начала (spec docs/specs/2026-10-two-ways.md, F4; решение владельца #67): сложность (spec
 * docs/specs/2026-10-difficulty.md, часть 2) и «Кто вы» — три карточки, по строке о каждой; карточка начинает игру.
 * «Назад» — к выбору больницы.
 */
function RoleChooser({ start, hud, actions, back }: { start: 'empty' | 'preset' | 'poly'; hud: Hud; actions: Actions; back: () => void }) {
  const t = T.doctor.role;
  const [level, setLevel] = useState<Level>(NORMAL);
  const row = hud.startLevels?.[level.manage];
  return (
    <div className="start panel" id="start-roles">
      <div className="game">{T.app.title}</div>
      <h2>{T.manage.title}</h2>
      <Difficulty level={level} set={setLevel} row={row} cash={row?.cash[start]} />
      <p className="muted small">{T.manage.medicine}</p>
      <h2>{T.start.roleTitle}</h2>
      <p className="intro">{T.start.roleIntro}</p>
      {ROLES.map(r => (
        <button key={r} type="button" id={`start-role-${r}`} onClick={() => actions.startGame(start, r, level)}>
          <b>{t.name[r]}</b>
          <span>{t.line[r]}</span>
        </button>
      ))}
      <button type="button" id="start-back" className="small" onClick={back}>
        ← {T.start.back}
      </button>
    </div>
  );
}

/**
 * Второй шаг сценария (spec docs/specs/2026-10-difficulty.md, часть 2): сценарий — на уровне игрока, роли нет — вы «Врач»
 * (spec docs/specs/2026-10-scenario-1.md); цели и касса сценария — те же на любом уровне.
 */
function ScenarioStart({ sc, hud, actions, back }: { sc: { id: Id; title: string; about: string }; hud: Hud; actions: Actions; back: () => void }) {
  const [level, setLevel] = useState<Level>(NORMAL);
  return (
    <div className="start panel" id="start-scenario">
      <div className="game">{T.app.title}</div>
      <h2>{sc.title}</h2>
      <p className="intro">{sc.about}</p>
      <h2>{T.manage.title}</h2>
      <Difficulty level={level} set={setLevel} row={hud.startLevels?.[level.manage]} />
      <p className="muted small">{T.manage.scenario}</p>
      <button type="button" id="start-go" className="on" onClick={() => actions.startGame({ scenario: sc.id }, undefined, level)}>
        <b>{T.manage.go}</b>
      </button>
      <button type="button" id="start-back" className="small" onClick={back}>
        ← {T.start.back}
      </button>
    </div>
  );
}

function StartChooser({ hud, actions }: P) {
  const saves = hud.startSaves ?? [];
  // «Продолжить» — самое новое сохранение с шапкой
  const last = saves.find(r => r.meta);
  // больница выбрана — второй шаг: кто вы (F4)
  const [pick, setPick] = useState<'empty' | 'preset' | 'poly' | null>(null);
  // сценарий выбран — второй шаг: сложность (spec docs/specs/2026-10-difficulty.md, часть 2)
  const [scenario, setScenario] = useState<{ id: Id; title: string; about: string } | null>(null);
  const campaign = hud.startScenarios ?? [];
  if (pick) return <RoleChooser start={pick} hud={hud} actions={actions} back={() => setPick(null)} />;
  if (scenario) return <ScenarioStart sc={scenario} hud={hud} actions={actions} back={() => setScenario(null)} />;
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
      {/* «Кампания» (spec docs/specs/2026-10-scenario-1.md): сценарии первыми, под ними — песочница */}
      {campaign.length > 0 ? (
        <>
          <h2>{T.scenario.campaign}</h2>
          {campaign.map(c => (
            <button key={c.id} type="button" id={`start-${c.id.replace(/\./g, '-')}`} onClick={() => setScenario(c)}>
              <b>{c.title}</b>
              <span>{c.about}</span>
            </button>
          ))}
        </>
      ) : null}
      <h2>{campaign.length > 0 ? T.scenario.sandbox : T.start.title}</h2>
      <button type="button" id="start-empty" onClick={() => setPick('empty')}>
        <b>{T.start.empty}</b>
        <span>{T.start.emptyHint}</span>
      </button>
      <button type="button" id="start-poly" onClick={() => setPick('poly')}>
        <b>{T.start.poly}</b>
        <span>{T.start.polyHint}</span>
      </button>
      <button type="button" id="start-preset" onClick={() => setPick('preset')}>
        <b>{T.start.preset}</b>
        <span>{T.start.presetHint}</span>
      </button>
      {/* энциклопедия (spec docs/specs/2026-10-encyclopedia.md) — и до игры: главное меню геймдизайна §9 */}
      <button type="button" id="start-enc" onClick={() => openEncyclopedia()} title="F1">
        <b>{T.encyclopedia.ui.open}</b>
        <span>{T.encyclopedia.ui.openHint}</span>
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
  if (hud.scenarioNames) scenarioNames = hud.scenarioNames;
  const p = { hud, actions, names };
  if (hud.choose)
    return (
      <>
        {/* живая сцена за экраном начала (spec docs/specs/2026-10-aaa-polish.md): к краям темнее — панель читается, сцена видна */}
        <div className="startveil" />
        <StartChooser {...p} />
        <Encyclopedia />
      </>
    );
  return (
    <>
      <TopBar {...p} />
      {/* под часами посередине: «закрыта» — что не так, подсказка первых минут — что сделать, последнее извещение (spec 2026-10-aaa-polish) */}
      <div className="topcenter" id="topcenter">
        {hud.closed ? (
          <div className="banner panel" id="closed" title={T.top.closedHint}>
            {T.top.closed(hud.closed)}
          </div>
        ) : hud.night ? (
          <div className="banner panel calm" id="night">
            {hud.night}
          </div>
        ) : null}
        {/* письмо наставницы (spec docs/specs/2026-10-scenario-1.md) — над строкой подсказки: строка говорит как, письмо — зачем */}
        {!hud.doctor?.card ? <LetterCard s={hud.scenario} actions={actions} /> : null}
        <HintStrip {...p} />
        <Toasts {...p} />
      </div>
      <LeftTools {...p} />
      <GameMenu {...p} />
      <SettingsPanel {...p} />
      <RightTabs {...p} />
      <BottomCard {...p} />
      <DeptLegend hud={hud} />
      {!hud.build.on ? <Dock hud={hud} actions={actions} /> : null}
      {hud.doctor?.card ? <Card key={hud.doctor.card.id} v={hud.doctor.card} level={hud.doctor.level} meanwhile={hud.doctor.meanwhile} next={hud.doctor.next} actions={actions} /> : null}
      {/* планёрка в 08:00 (spec docs/specs/2026-10-economy.md) — когда карта пациента закрыта */}
      {hud.economy?.open && !hud.doctor?.card ? <Meeting e={hud.economy} actions={actions} /> : null}
      {/* «Сценарий пройден» (spec docs/specs/2026-10-scenario-1.md) — после планёрки, когда карта закрыта */}
      {!hud.economy?.open && !hud.doctor?.card ? <ScenarioDone s={hud.scenario} actions={actions} /> : null}
      {hud.debug ? <DebugMenu {...p} /> : null}
      {/* энциклопедия (spec docs/specs/2026-10-encyclopedia.md) — поверх всего, и карты пациента */}
      <Encyclopedia />
      {!hud.ready || hud.status || hud.error ? (
        <div className="status panel" id="status">
          {hud.error ? `${T.app.error}: ${hud.error}` : hud.status || T.app.loading}
        </div>
      ) : null}
    </>
  );
}
