// Таблицы людей Rocketbox в assets/LICENSES.md (раздел 4; spec docs/specs/2026-10-people.md, «Конвертер»): каждый вид игры с
// SHA-256 glb и маски и каждый исходник набора с SHA-256 — из assets/models/rocketbox/sources.json, который пишет
// tools/app/people.mjs; кто вид в игре — из таблицы src/render/cast.ts. Тест tools/test/catalog.test.ts сверяет файл с ними.
//
//   bun tools/app/people-licenses.ts
import { readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { db } from '../../src/content';
import { LOOKS, type LookSpec } from '../../src/render/cast';

const ROOT = join(import.meta.dir, '../..');
const LIC = join(ROOT, 'assets/LICENSES.md');
const rb = JSON.parse(readFileSync(join(ROOT, 'assets/models/rocketbox/sources.json'), 'utf8')) as {
  files: Record<string, string>;
  looks: Record<string, { glb: string; mask: string }>;
};

const role = (id: string) => db.roles[id]?.name.ru.toLowerCase() ?? id;
const job = (id: string, sex: 'm' | 'f') => (sex === 'f' ? db.jobs[id]?.female?.ru : undefined) ?? db.jobs[id]?.name.ru ?? id;

/** Кто вид в игре — по таблице cast.ts. */
function who(s: LookSpec): string {
  if (s.roles) return `${s.sex === 'f' ? 'у женщин' : 'у мужчин'}: ${s.roles.map(role).join(', ')}`;
  if (s.jobs) return `${s.sex === 'f' ? 'пациентка' : 'пациент'} в спецодежде — ${s.jobs.map(j => job(j, s.sex).toLowerCase()).join(', ')}`;
  const old = s.age === 'old';
  return {
    staff: 'врач, специалист, лаборант — белый халат',
    registrar: 'регистратура',
    paramedic: 'фельдшер скорой',
    patient: s.sex === 'f' ? (old ? 'пожилая пациентка' : 'пациентка') : old ? 'пожилой пациент' : 'пациент',
  }[s.use];
}

const looks = [
  '| Вид | Кто в игре | SHA-256 `.glb` | SHA-256 `.mask.png` |',
  '|---|---|---|---|',
  ...LOOKS.map(s => {
    const h = rb.looks[s.name];
    if (!h) throw new Error(`${s.name}: нет в sources.json — сначала node tools/app/people.mjs`);
    return `| \`${s.name}\` | ${who(s)} | \`${h.glb}\` | \`${h.mask}\` |`;
  }),
];
const files = ['| Файл набора | SHA-256 |', '|---|---|', ...Object.entries(rb.files).map(([f, h]) => `| \`${f}\` | \`${h}\` |`)];

// таблицы раздела 4 — от строки заголовка до пустой строки
const lic = readFileSync(LIC, 'utf8').split('\n');
const replace = (head: string, rows: string[]) => {
  const i = lic.findIndex(l => l.startsWith(head));
  if (i < 0) throw new Error(`нет таблицы «${head}» в LICENSES.md`);
  let j = i;
  while (j < lic.length && lic[j].startsWith('|')) j++;
  lic.splice(i, j - i, ...rows);
};
replace('| Вид | Кто в игре |', looks);
replace('| Файл набора | SHA-256 |', files);
writeFileSync(LIC, lic.join('\n'));
console.log(`LICENSES.md: видов ${LOOKS.length}, исходников ${Object.keys(rb.files).length}`);
