// Привезённых скорой зовут по срочности (spec docs/specs/2026-11-scenario-2.md, «Замер»; 0.64.1): у пришедшего сам при приходе
// есть свой врач, у привезённого — нет, он лежит в смотровой, и врач идёт к нему. Прежде свободный врач звал его, только когда
// своих в очереди не было, а очередь привезённых была длиннее чужих: пока врачи принимали «зелёных», «красный» в смотровой
// ждал днём до 6 часов в городской больнице и до 12 — в районной. Теперь его зовёт первый свободный врач смены наравне со
// своими, по срочности очереди. Готовая городская больница: один терапевт на смотровую на три места и пришедших сами.
import { describe, expect, test } from 'bun:test';
import { db } from '../../src/content';
import { hospitalOf } from '../../src/engine/hospital/site';
import { siteOfPreset } from '../../src/engine/hospital/site-preset';
import { presetStaff, withNightShift } from '../../src/engine/hospital/staff';
import { apply, newFlowShift } from '../../src/engine/shift/engine';
import { startCash } from '../../src/engine/shift/money';
import { DAY } from '../../src/engine/shift/types';

const H = 3600;
const rec = db.presets['preset.city'];
const site = siteOfPreset(db, rec);
const city = (seed: number) =>
  newFlowShift(db, {
    seed, season: 'winter', hospital: hospitalOf(db, site), staff: withNightShift(db, site.rooms, presetStaff(db, rec)), flow: { perHour: 0, auto: true },
    economy: { cash: startCash(db, 'preset') },
  });

describe('привезённых скорой зовут по срочности', () => {
  test('днём «красного» врач зовёт раньше «зелёных» пришедших: двое суток, три зерна — никто не ждал больше двух часов', () => {
    const waits: number[] = [];
    for (const seed of [1, 2, 3]) {
      const s = city(seed);
      const seen = new Set<string>();
      while (s.t < 56 * H) {
        apply(db, s, { kind: 'advance', seconds: 60 });
        for (const p of Object.values(s.patients)) {
          if (p.kind !== 'ambulance' || p.calledT === undefined || seen.has(p.id)) continue;
          seen.add(p.id);
          const hour = Math.floor((p.arriveT % DAY) / H);
          if (hour >= 8 && hour < 20 && p.scale?.triage === 'red') waits.push((p.calledT - p.arriveT) / 60);
        }
      }
    }
    // «красные» днём были; до 0.64.1 у этих зёрен ждали до 228, 217 и 356 минут, теперь — не дольше 48
    expect(waits.length).toBeGreaterThan(5);
    expect(Math.max(...waits)).toBeLessThanOrEqual(120);
  }, 300_000);
});
