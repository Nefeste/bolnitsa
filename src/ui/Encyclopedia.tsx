// Энциклопедия (spec docs/specs/2026-10-encyclopedia.md, «Окно»): поверх карты — разделы, список, статья, поиск, «Назад».
// Статьи собирает src/app/encyclopedia.ts (копия «Анамнеза») из базы окна; часы окно не останавливает. Открыть: F1 — курсор
// над названием записи базы (`data-enc`, у обследований — `data-exam`) сразу на её статье; «Подробнее в энциклопедии» в
// «Что это?»; кнопка экрана начала.
import { type RefObject, useEffect, useMemo, useRef, useSyncExternalStore } from 'react';
import { loadContent } from '../app/content';
import { article, type Article, type Block, type Ref, search, type Section, sectionOf, sectionsOf, sectionView } from '../app/encyclopedia';
import type { ContentDb, Id } from '../content/types';
import { lang, T } from '../i18n';
import { Icon } from './icons';
import { WindowHead } from './WindowHead';

interface View {
  open: boolean;
  /** открытая статья; нет — только список раздела */
  id?: Id;
  section: Section;
  query: string;
  /** прежние статьи — «Назад» */
  back: Id[];
  db?: ContentDb;
}

/** Сколько статей помнит «Назад». */
const BACK = 50;

let view: View = { open: false, section: 'conditions', query: '', back: [] };
const subs = new Set<() => void>();

function set(patch: Partial<View>) {
  view = { ...view, ...patch };
  for (const f of subs) f();
}

const subscribe = (f: () => void) => {
  subs.add(f);
  return () => {
    subs.delete(f);
  };
};
const snapshot = () => view;

/** Открыто ли окно. */
export const encyclopediaOpen = (): boolean => view.open;

/** Есть ли статья у записи базы — у вида помещения, должности, признака… (база окна ещё не прочитана — нет). */
export const hasArticle = (id: Id | undefined): boolean => !!id && !!view.db && sectionOf(view.db, id) !== undefined;

/** Перейти к статье: прежняя — в «Назад», список — её раздела. Статьи нет — ничего. */
function go(id: Id) {
  const section = view.db ? sectionOf(view.db, id) : undefined;
  if (!section || id === view.id) return;
  set({ id, section, back: view.id ? [...view.back, view.id].slice(-BACK) : view.back });
}

function back() {
  const prev = view.back[view.back.length - 1];
  if (!prev) return;
  const section = view.db ? sectionOf(view.db, prev) : undefined;
  set({ id: prev, back: view.back.slice(0, -1), ...(section ? { section } : {}) });
}

/**
 * Открыть; `id` — сразу на его статье, в списке — её раздел (прежний поиск не мешает); статьи нет — там, где закрыли. База
 * читается при первом открытии.
 */
export function openEncyclopedia(id?: Id) {
  set({ open: true });
  loadContent()
    .then(db => {
      if (!view.db) set({ db });
      if (id && sectionOf(db, id)) {
        if (view.query) set({ query: '' });
        go(id);
      }
    })
    .catch(() => undefined);
}

export function closeEncyclopedia() {
  if (view.open) set({ open: false });
}

let mouse = { x: -1, y: -1 };

/**
 * F1 и Esc окна — раньше клавиш игры: слушатель захвата на `window` останавливает событие, и игра его не видит (Esc при
 * открытом окне закрывает только окно — не карту пациента и не выбор на плане).
 */
export function installEncyclopediaKeys() {
  window.addEventListener(
    'mousemove',
    e => {
      mouse = { x: e.clientX, y: e.clientY };
    },
    { passive: true },
  );
  window.addEventListener(
    'keydown',
    e => {
      if (e.code === 'F1') {
        e.preventDefault();
        e.stopImmediatePropagation();
        if (e.repeat) return;
        // над самим окном F1 только закрывает его: ссылки окна открываются щелчком
        const under = document.elementFromPoint(mouse.x, mouse.y);
        const el = under?.closest('#enc') ? null : under?.closest<HTMLElement>('[data-enc],[data-exam]');
        const id = el?.dataset.enc ?? el?.dataset.exam;
        if (id) openEncyclopedia(id);
        else if (view.open) closeEncyclopedia();
        else openEncyclopedia();
      } else if (e.code === 'Escape' && view.open) {
        e.preventDefault();
        e.stopImmediatePropagation();
        closeEncyclopedia();
      }
    },
    true,
  );
}

/** Номер элемента для сценария в браузере: точки и прочее — дефисом. */
const dom = (id: Id) => id.replace(/[^a-z0-9_-]/gi, '-');

export function Encyclopedia() {
  const v = useSyncExternalStore(subscribe, snapshot);
  const scroll = useRef<HTMLDivElement>(null);
  // новая статья — с начала
  useEffect(() => {
    scroll.current?.scrollTo(0, 0);
  }, [v.id]);
  if (!v.open) return null;
  const e = T.encyclopedia;
  return (
    <div className="enc panel" id="enc" role="dialog" aria-labelledby="enc-name">
      <WindowHead
        icon="book"
        titleId="enc-name"
        tools={
          <>
            <input className="search" id="enc-search" type="search" value={v.query} placeholder={e.search} onChange={x => set({ query: x.target.value })} />
            <button type="button" id="enc-back" disabled={v.back.length === 0} onClick={back}>
              <Icon name="back" /> {e.ui.back}
            </button>
          </>
        }
        close={{ id: 'enc-close', hint: `Esc · F1 — ${e.ui.close}`, onClick: closeEncyclopedia }}
      >
        {e.title}
      </WindowHead>
      <div className="enc-note">{e.disclaimer}</div>
      {v.db ? <Body db={v.db} v={v} scroll={scroll} /> : <div className="muted">{T.app.loading}</div>}
    </div>
  );
}

function Body({ db, v, scroll }: { db: ContentDb; v: View; scroll: RefObject<HTMLDivElement | null> }) {
  const e = T.encyclopedia;
  // язык меняется на ходу: статьи и списки — заново
  const l = lang;
  const sections = useMemo(() => sectionsOf(db), [db, l]);
  const list = useMemo(() => sectionView(db, v.section), [db, v.section, l]);
  const found = useMemo(() => (v.query.trim() ? search(db, v.query) : undefined), [db, v.query, l]);
  const a = useMemo(() => (v.id ? article(db, v.id) : undefined), [db, v.id, l]);
  return (
    <div className="enc-body">
      <nav className="enc-sections">
        {sections.map(s => (
          <button key={s.section} type="button" id={`enc-sec-${s.section}`} className={!found && v.section === s.section ? 'on' : undefined} onClick={() => set({ section: s.section, query: '' })}>
            <span>{s.title}</span>
            <small>{s.count}</small>
          </button>
        ))}
      </nav>
      <div className="enc-list" id="enc-list">
        {found ? (
          <>
            <div className="muted small" id="enc-found">
              {found.length > 0 ? e.ui.found(found.length) : e.nothing}
            </div>
            {found.map(r => (
              <Item key={r.id} r={r} on={r.id === v.id} note={e.sections[r.section]} />
            ))}
          </>
        ) : (
          list.groups.map(g => (
            <div key={g.key} className="enc-group">
              <h3>{g.title}</h3>
              {g.items.map(r => (
                <Item key={r.id} r={r} on={r.id === v.id} />
              ))}
            </div>
          ))
        )}
      </div>
      <div className="enc-article" id="enc-article" ref={scroll}>
        {a ? <ArticleView a={a} /> : <p className="muted">{e.ui.choose}</p>}
      </div>
    </div>
  );
}

function Item({ r, on, note }: { r: Ref; on: boolean; note?: string }) {
  const ref = useRef<HTMLButtonElement>(null);
  // открытая статья в длинном списке раздела — на виду
  useEffect(() => {
    if (on) ref.current?.scrollIntoView({ block: 'nearest' });
  }, [on]);
  return (
    <button ref={ref} type="button" className={on ? 'enc-item on' : 'enc-item'} id={`enc-item-${dom(r.id)}`} data-enc={r.id} onClick={() => go(r.id)}>
      {r.title}
      {note ? <small className="muted"> · {note}</small> : null}
    </button>
  );
}

function ArticleView({ a }: { a: Article }) {
  return (
    <article>
      <h2 id="enc-title">{a.title}</h2>
      <div className="muted" id="enc-subtitle">
        {a.subtitle}
      </div>
      {a.blocks.map(b => (
        <BlockView key={b.key} b={b} />
      ))}
    </article>
  );
}

function BlockView({ b }: { b: Block }) {
  return (
    <section className="enc-block" id={`enc-b-${b.key}`}>
      <h4>{b.title}</h4>
      {b.text?.map((t, i) => (
        <p key={i}>{t}</p>
      ))}
      {b.rows?.map((r, i) => (
        <div key={i} className="enc-row">
          <span className="label">{r.label}</span>
          <Refs refs={r.refs} />
        </div>
      ))}
      {b.refs && b.refs.length > 0 ? <Refs refs={b.refs} /> : null}
      {b.note ? <p className="muted small">{b.note}</p> : null}
    </section>
  );
}

function Refs({ refs }: { refs: Ref[] }) {
  return (
    <div className="enc-refs">
      {refs.map((r, i) => (
        <button key={i} type="button" className="enc-ref" data-enc={r.id} onClick={() => go(r.id)}>
          {r.title}
          {r.note ? <small> — {r.note}</small> : null}
        </button>
      ))}
    </div>
  );
}
