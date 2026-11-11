// Испытания (spec docs/specs/2026-11-challenges.md, часть 2): второй шаг экрана начала — список испытаний, у каждого — условие,
// чьё оно и лучший итог; «Кто вы» — для испытаний главврача (в испытании врача вы — «Врач»). Окно «Итог испытания» — когда
// дошли до его конца: оценка, число итога, правило, рекорд; «Ещё раз», «В меню». Слова — здесь, числа и итоги — из
// src/app/challenges.ts и расчётного потока.
import { useState } from 'react';
import { T } from '../i18n';
import { DEFAULT_ROLE, ROLES, type Role } from '../app/roles';
import { Icon } from './icons';
import type { Actions, ChallengeHud, ChallengeRow, Hud } from './store';
import { WindowHead } from './WindowHead';

/** Число итога коротко — строке рекорда: «не приняты 4,4 %», «приняты 98», «касса 302 416 ₽», «балл 2,89». */
const short = (by: ChallengeRow['by'], value: number): string => T.challenges.short[by](value);

export function ChallengeStart({ hud, actions, back }: { hud: Hud; actions: Actions; back: () => void }) {
  const t = T.challenges;
  const rows = hud.startChallenges ?? [];
  const [role, setRole] = useState<Role>(DEFAULT_ROLE);
  return (
    <div className="start panel" id="start-challenges-step">
      <div className="game">{T.app.title}</div>
      <h2>{t.start}</h2>
      <p className="intro">{t.lead}</p>
      {rows.map(r => (
        <button key={r.id} type="button" id={`challenge-${r.id.slice('challenge.'.length)}`} className={r.record?.passed ? 'on' : undefined} onClick={() => actions.startGame({ challenge: r.id }, r.kind === 'chief' ? role : undefined)}>
          <b>{r.name}</b>
          <span>{r.about}</span>
          <span className="muted">
            {r.kind === 'chief' ? t.chief : t.doctor} · {r.record ? t.best(r.record.grade, short(r.by, r.record.value), r.record.passed) : t.notPlayed}
          </span>
        </button>
      ))}
      <h2>{t.role}</h2>
      <div className="row" id="start-challenge-roles">
        {ROLES.map(x => (
          <button key={x} type="button" id={`start-challenge-role-${x}`} className={x === role ? 'small on' : 'small'} aria-pressed={x === role} onClick={() => setRole(x)}>
            {T.doctor.role.name[x]}
          </button>
        ))}
      </div>
      <button type="button" id="start-back" className="small" onClick={back}>
        <Icon name="back" /> {T.start.back}
      </button>
    </div>
  );
}

export function ChallengeSummary({ s, actions }: { s: ChallengeHud | undefined; actions: Actions }) {
  if (!s) return null;
  const t = T.challenges;
  const e = s.end;
  const value =
    s.by === 'unseen' ? t.value.unseen(e.value, e.seen, e.arrived)
    : s.by === 'seen' ? t.value.seen(e.value, e.arrived)
      : s.by === 'cash' ? t.value.cash(e.value)
        : s.by === 'xrays' ? t.value.xrays(e.value)
        : e.shift ? t.value.shift(e.value)
          : t.nobody;
  const passed = e.passed ? t.passedYes : s.unindicated !== undefined ? t.passedNoRule(s.unindicated) : t.passedNo;
  return (
    <div className="demosum panel" id="challenge-summary" role="dialog" aria-labelledby="challenge-title">
      <WindowHead icon="result" titleId="challenge-title">
        {t.title(s.name)}
      </WindowHead>
      <p id="challenge-grade">
        <b>{t.grade(e.grade)}</b>
      </p>
      <p id="challenge-value">{value}</p>
      {e.reds && s.reds !== undefined ? (
        <p className="muted" id="challenge-reds">
          {t.reds(e.reds.inTime, e.reds.total, s.reds)}
        </p>
      ) : null}
      {e.unindicated !== undefined && s.unindicated !== undefined ? <p id="challenge-unindicated">{t.unindicated(e.unindicated, s.unindicated)}</p> : null}
      <p id="challenge-passed">{passed}</p>
      <p className="muted" id="challenge-best">
        {s.best ? t.isBest : t.bestLine(s.record.grade, short(s.by, s.record.value), s.record.day)}
      </p>
      <div className="row">
        <button type="button" className="on" id="challenge-again" onClick={actions.challengeAgain}>
          {t.again}
        </button>
        <button type="button" id="challenge-menu" onClick={actions.newGame}>
          {T.shift.menu}
        </button>
      </div>
    </div>
  );
}
