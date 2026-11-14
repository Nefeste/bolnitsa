// Проба к спецификации «Сценарий 7 «Кризис»» (docs/specs/2026-11-scenario-7.md, «Замер»): чужая больница в кризисе — касса в
// минусе, низкая репутация, люди на грани ухода, аппараты давно без обслуживания и два сломаны с утра, — выберется ли она сама и
// что делает разумный главврач. Геймдизайн §9: «чужая больница: долги, плохая репутация, сломанные аппараты, недовольные люди»,
// учит «настроение, ремонт, кредиты», пример целей — «выйти из долгов за 30 дней; неделя без ухода сотрудников».
//
// Кризис в начале: касса `--cash` (−150 000), долг — кредит банка `--loan` (900 000) на 30 суток равными долями, репутация `--rep`
// (25), настроение всех нанятых со сменой `--mood` (25 — ниже порога ухода 30), износ всех аппаратов `--wear` суток (28 — шанс
// поломки втрое).
// Игры: `none` — никто ничего не делает (нанятые врачи принимают); `quit` — главврач каждое утро поднимает зарплату тем, кто
// «собирается уйти», и включает правило «Подтверждать диагноз»; `all` — так же, но всем, у кого настроение ниже порога ухода;
// `tech` — как `quit` и в первое утро нанимает техника днём. Кредит банка берут, когда тот предлагает (с долгом в начале — нет).
//
// bun tools/bench/crisis.ts [--days 30] [--seeds 1,2] [--hospital district,city] [--play none,chief] [--cash -150000] [--loan 900000] [--rep 25] [--mood 25] [--wear 28]
import type { ContentDb, Id } from '../../src/content/types';
import { db as bundle } from '../../src/content';
import { hospitalOf } from '../../src/engine/hospital/site';
import { siteOfPreset } from '../../src/engine/hospital/site-preset';
import { presetStaff, withNightShift } from '../../src/engine/hospital/staff';
import { apply, hospitalCtx, newFlowShift } from '../../src/engine/shift/engine';
import { devicesOf } from '../../src/engine/shift/repair';
import { expensesOf, incomeOf } from '../../src/engine/economy/economy';
import { cashNow } from '../../src/engine/shift/money';
import type { Notice, ShiftState } from '../../src/engine/shift/types';

const arg = (name: string, def: string) => {
  const i = process.argv.indexOf(`--${name}`);
  return i >= 0 ? process.argv[i + 1] : def;
};
const DAYS = Number(arg('days', '30'));
const SEEDS = arg('seeds', '1,2').split(',').map(Number);
const HOSPITALS = arg('hospital', 'district,city').split(',');
const PLAYS = arg('play', 'none,quit,all').split(',');
const CASH = Number(arg('cash', '-150000'));
const LOAN = Number(arg('loan', '900000'));
const REP = Number(arg('rep', '25'));
const MOOD = Number(arg('mood', '25'));
const WEAR = Number(arg('wear', '28'));
const db: ContentDb = bundle;
const H = 3600;
const DAY = 24 * H;

function start(name: string, seed: number): ShiftState {
  const rec = db.presets[({ district: 'preset.district', city: 'preset.city', vascular: 'preset.vascular' } as Record<string, Id>)[name] ?? name];
  const { mine: _, ...site } = siteOfPreset(db, rec);
  const s = newFlowShift(db, { seed, season: 'winter', hospital: hospitalOf(db, site), staff: withNightShift(db, site.rooms, presetStaff(db, rec)), flow: { perHour: 0, auto: true }, economy: { cash: CASH } });
  for (const r of s.hospital!.site!.rooms.filter(x => x.type === 'room.office')) {
    for (const shift of ['day', 'night'] as const) {
      if (!s.staff!.some(m => m.room === r.id && (m.shift === shift || m.shift === undefined) && db.roles[m.role]?.stands === 'role.doctor')) apply(db, s, { kind: 'site', cmd: { kind: 'hire', room: r.id, role: 'role.doctor', shift } });
    }
  }
  apply(db, s, { kind: 'site', cmd: { kind: 'done' } });
  // кризис: касса, репутация, настроение, износ и два сломанных аппарата
  s.economy!.cash = CASH;
  s.economy!.reputation = REP;
  if (LOAN > 0) s.economy!.loan = { left: LOAN, perDay: Math.ceil(LOAN / 30) };
  for (const m of s.staff ?? []) if (m.shift) (s.moods ??= {})[m.id] = { v: MOOD };
  return s;
}

const fmt = (x: number) => Math.round(x).toLocaleString('ru-RU');

for (const name of HOSPITALS) {
  for (const play of PLAYS) {
    for (const seed of SEEDS) {
      const s = start(name, seed);
      // износ: каждый аппарат, что ломается, — `WEAR` суток без обслуживания
      for (const d of devicesOf(db, hospitalCtx(db, s).plan)) (s.wear ??= {})[d.key] = WEAR;
      const t0 = performance.now();
      let left = 0;
      let debtFree: number | undefined;
      let loanTaken = 0;
      const rows: string[] = [];
      const staff0 = (s.staff ?? []).length;
      while (s.t < DAYS * DAY + 8 * H + 60) {
        const notices: Notice[] = apply(db, s, { kind: 'advance', seconds: 600 });
        for (const n of notices) {
          if (n.kind !== 'morning') continue;
          const e = s.economy!;
          if (play !== 'none') {
            if (n.summary.day === 1) apply(db, s, { kind: 'confirms', on: true });
            // кредит банка — когда предлагает
            if (e.offer !== undefined && !e.loan) {
              apply(db, s, { kind: 'loan' });
              loanTaken++;
            }
            // зарплата — тем, кто собирается уйти или ниже порога
            for (const m of s.staff ?? []) {
              const mood = s.moods?.[m.id];
              const want = play === 'all' ? mood !== undefined && (mood.quit !== undefined || mood.v < db.economy.staff.mood!.quit) : mood?.quit !== undefined;
              if (mood && !mood.go && want) apply(db, s, { kind: 'site', cmd: { kind: 'raise', id: m.id } });
            }
            if (play === 'tech' && n.summary.day === 1 && !(s.staff ?? []).some(m => m.role === 'role.technician')) {
              const staffRoom = s.hospital!.site!.rooms.find(r => r.type === 'room.staff');
              if (staffRoom) apply(db, s, { kind: 'site', cmd: { kind: 'hire', room: staffRoom.id, role: 'role.technician', shift: 'day' } });
            }
            apply(db, s, { kind: 'site', cmd: { kind: 'done' } });
          }
          const h = n.summary;
          const cash = cashNow(s) ?? 0;
          if (debtFree === undefined && cash >= 0 && !e.loan) debtFree = h.day;
          const gone = n.staff?.leave?.length ?? 0;
          left += gone;
          const l = h.economy?.ledger;
          const inc = l ? incomeOf(l) : 0;
          const exp = l ? expensesOf(l) : 0;
          rows.push(`    сутки ${h.day}: касса ${fmt(cash)}${e.loan ? `, кредит ${fmt(e.loan.left)}` : ''} · доходы ${fmt(inc)}, расходы ${fmt(exp)} (из них кредит ${fmt(l?.expenses.loan ?? 0)}, ремонт ${fmt(l?.expenses.repairs ?? 0)}) · репутация ${e.reputation ?? 0} · пришли ${h.arrived}, ушли ${h.left} · сломалось ${h.repairs?.broke ?? 0} · уходят ${gone}${n.staff?.quit?.length ? `, собираются ${n.staff.quit.length}` : ''}`);
        }
      }
      console.log(`\n=== ${name}, ${play}, зерно ${seed} (${Math.round((performance.now() - t0) / 1000)} с): штат ${staff0} → ${(s.staff ?? []).length}, ушли сами ${left}; из минуса без кредита — ${debtFree !== undefined ? `к суткам ${debtFree}` : 'нет'}; кредитов ${loanTaken}`);
      for (const r of rows.filter((_, i) => i < 3 || i % 5 === 4 || i === rows.length - 1)) console.log(r);
    }
  }
}
