// Демо для Next Fest (spec docs/specs/2026-11-demo.md): окно «Итог» после первой планёрки — что построено, больные за сутки,
// ваши приёмы, касса, сколько вы играете, снимок больницы; кнопки «Сохранить снимок», «В список желаемого» (только когда в
// сборке есть номер приложения Steam), «Играть дальше», «В меню». Числа — из окна (src/app/demo.ts), слова — здесь.
import type { DemoResult } from '../app/demo';
import { money, T } from '../i18n';
import type { Actions } from './store';

/** Что «Итог» показывает в окне: числа, названия помещений, снимок адресом `blob:`, куда сохранён, есть ли Steam. */
export interface DemoHud {
  result: DemoResult;
  names: Record<string, string>;
  shot?: string;
  saved?: string;
  wishlist: boolean;
}

export function DemoSummary({ d, actions }: { d: DemoHud | undefined; actions: Actions }) {
  if (!d) return null;
  const t = T.demo;
  const r = d.result;
  const built = r.built.map(b => (b.n > 1 ? `${d.names[b.type] ?? b.type} ×${b.n}` : (d.names[b.type] ?? b.type)));
  return (
    <div className="demosum panel" id="demo-summary" role="dialog" aria-labelledby="demo-title">
      <h2 id="demo-title">{t.title}</h2>
      <p className="muted">{t.lead(r.day)}</p>
      {d.shot ? <img id="demo-shot" className="demoshot" src={d.shot} alt={t.snapshot} /> : null}
      <dl className="demonums">
        <dt>{t.built}</dt>
        <dd id="demo-built">{built.length ? built.join(', ') : t.builtNone}</dd>
        <dt>{t.patients}</dt>
        <dd id="demo-patients">
          {[t.arrived(r.arrived), t.seen(r.seen), t.left(r.left)].join(' · ')}
          {r.waitedYou ? <span className="muted"> ({t.leftYou(r.waitedYou)})</span> : null}
        </dd>
        <dt>{t.own}</dt>
        <dd id="demo-own">{r.own ? t.ownLine(r.own, r.right) : t.ownNone}</dd>
        {r.cash !== null ? (
          <>
            <dt>{t.cash}</dt>
            <dd id="demo-cash">{money(r.cash)}</dd>
          </>
        ) : null}
        <dt>{t.played}</dt>
        <dd id="demo-played">{t.minutes(Math.max(1, Math.round(r.played / 60)))}</dd>
      </dl>
      {d.saved ? (
        <p className="muted" id="demo-saved">
          {d.saved}
        </p>
      ) : null}
      <div className="row">
        <button type="button" id="demo-save" disabled={!d.shot} onClick={() => actions.demo({ kind: 'save' })}>
          {t.saveShot}
        </button>
        {d.wishlist ? (
          <button type="button" id="demo-wishlist" onClick={() => actions.demo({ kind: 'wishlist' })}>
            {t.wishlist}
          </button>
        ) : null}
      </div>
      <div className="row">
        <button type="button" className="on" id="demo-go" onClick={() => actions.demo({ kind: 'close' })}>
          {t.goOn}
        </button>
        <button type="button" id="demo-menu" onClick={actions.newGame}>
          {t.menu}
        </button>
      </div>
    </div>
  );
}
