// из anamnez: tools/test/encyclopedia.test.ts @ 720b613, изменено: без раздела «Подсказки» — вместо его проверки та, что
// его нет; операционная каталога ПК; деньги — `money` «Больницы» (spec docs/specs/2026-10-encyclopedia.md)
// Энциклопедия (src/app/encyclopedia.ts, геймдизайн §9): статья есть у каждой записи
// базы, ссылки ведут в существующие статьи, статья болезни — разделами в порядке
// 11-content.md §4 «Анамнеза», частота словами — по полосам, служебных пометок авторов и доз нет,
// поиск находит и с «е» вместо «ё».
import { describe, expect, test } from 'bun:test';
import { article, bandOf, SECTIONS, search, sectionOf, sectionsOf, sectionView, similar } from '../../src/app/encyclopedia';
import { db } from '../../src/content';
// деньги — как везде в «Больнице» (`money`), а не `T.common.rub` «Анамнеза»
import { money } from '../../src/i18n';

const ids = () => [db.conditions, db.findings, db.exams, db.treatments, db.risks, db.rooms, db.equipment, db.roles].flatMap(t => Object.keys(t));

describe('энциклопедия', () => {
  test('статья есть у каждой записи базы; все ссылки ведут в существующие статьи', () => {
    for (const id of ids()) {
      const a = article(db, id)!;
      expect({ id, title: a.title.length > 0, blocks: a.blocks.length > 0 }).toEqual({ id, title: true, blocks: true });
      for (const b of a.blocks) {
        for (const r of [...(b.refs ?? []), ...(b.rows ?? []).flatMap(x => x.refs)]) {
          expect({ from: id, to: r.id, exists: sectionOf(db, r.id) !== undefined }).toEqual({ from: id, to: r.id, exists: true });
        }
      }
    }
    expect(article(db, 'cond.nothing')).toBeUndefined();
  });

  test('статья болезни — разделы в порядке 11-content.md §4', () => {
    expect(article(db, 'cond.pneumonia_cap')!.blocks.map(b => b.key))
      .toEqual(['what', 'signs', 'who', 'confirm', 'similar', 'treatment', 'where', 'course', 'redFlags', 'pearls', 'sources']);
  });

  test('частота словами — по полосам базы; число из источника — словом ближайшей полосы', () => {
    expect([9500, 7500, 5000, 2500, 800, 200, 0].map(bandOf)).toEqual(['always', 'usually', 'often', 'sometimes', 'rarely', 'veryRarely', 'never']);
    expect(bandOf(6000)).toBe('often');
    const signs = article(db, 'cond.pneumonia_cap')!.blocks.find(b => b.key === 'signs')!;
    expect(signs.rows![0]).toEqual({ label: 'Почти всегда', refs: [{ id: 'img.cxr_infiltrate', title: db.findings['img.cxr_infiltrate'].name.ru }] });
    // у признака несколько связей по тяжести — самая частая и её условие
    const spo2 = signs.rows!.flatMap(r => r.refs).find(r => r.id === 'vital.spo2_low')!;
    expect(spo2.note).toBe('при тяжёлом течении');
  });

  test('с чем спутать — похожие по признакам, не больше трёх и без самой болезни', () => {
    for (const id of Object.keys(db.conditions)) {
      const alike = similar(db, id);
      expect(alike).not.toContain(id);
      expect(alike.length).toBeLessThanOrEqual(3);
    }
    // ближе всех к пневмонии с части 48а — сепсис из лёгких: у него те же признаки очага
    expect(similar(db, 'cond.pneumonia_cap')).toContain('cond.sepsis');
    expect(similar(db, 'cond.cystitis')).toContain('cond.pyelonephritis');
    expect(similar(db, 'cond.migraine')).toContain('cond.tension_headache');
  });

  test('статья фактора риска — что даёт, что повышает и источники', () => {
    const obesity = article(db, 'risk.obesity')!;
    expect(obesity.blocks.at(-1)!.key).toBe('sources');
    expect(obesity.blocks.at(-1)!.text).toContain('Минздрав РФ. Ожирение, 2024');
    for (const id of Object.keys(db.risks)) expect({ id, sources: article(db, id)!.blocks.some(b => b.key === 'sources') }).toEqual({ id, sources: true });
  });

  test('ни служебных пометок авторов базы, ни доз', () => {
    const notes = [...Object.values(db.conditions), ...Object.values(db.exams), ...Object.values(db.treatments), ...Object.values(db.risks)]
      .flatMap(x => x.sources)
      .flatMap(s => (s.note ? [s.note] : []));
    expect(notes.length).toBeGreaterThan(0);
    for (const id of ids()) {
      const text = JSON.stringify(article(db, id));
      expect({ id, note: notes.find(n => text.includes(n)) ?? null }).toEqual({ id, note: null });
      // доза — число с единицей лекарства; «30 мг/л» — порог анализа, не доза
      expect({ id, dose: /\d\s*(мг|мкг|мл|ЕД)(?!\s*\/)/.exec(text)?.[0] ?? null }).toEqual({ id, dose: null });
    }
  });

  test('разделы: каждая запись — ровно в одной группе, пустых групп нет', () => {
    for (const s of SECTIONS) {
      const v = sectionView(db, s);
      const listed = v.groups.flatMap(g => g.items.map(i => i.id));
      expect(new Set(listed).size).toBe(listed.length);
      expect(listed.length).toBe(sectionsOf(db).find(x => x.section === s)!.count);
      for (const g of v.groups) expect(g.items.length).toBeGreaterThan(0);
    }
  });

  test('больница: помещение — что здесь делают и что нужно; анализ — где делают и где берут материал', () => {
    const lab = article(db, 'room.lab')!;
    expect(lab.section).toBe('hospital');
    expect(lab.blocks.map(b => b.key)).toEqual(['what', 'doneHere', 'needs', 'sizes']);
    expect(lab.blocks.find(b => b.key === 'doneHere')!.refs!.map(r => r.id)).toContain('exam.tsh');
    const needs = lab.blocks.find(b => b.key === 'needs')!.rows!;
    expect(needs.map(r => r.label)).toEqual(['Люди', 'Аппарат — хотя бы один']);
    expect(article(db, 'room.procedure')!.blocks.find(b => b.key === 'collectsFor')!.refs!.map(r => r.id)).toContain('exam.cbc');
    expect(article(db, 'room.waiting')!.blocks.find(b => b.key === 'sizes')!.text![2]).toBe(`L — 13\u00a0×\u00a07\u00a0м, ${money(26000)}, содержание ${money(225)} в\u00a0день, 18\u00a0мест.`);
    // смотровая приёмного — места для скорой; шкала NEWS2 — своя статья с баллами (часть 27)
    expect(article(db, 'room.emergency')!.blocks.find(b => b.key === 'sizes')!.text![1]).toBe(`M — 9\u00a0×\u00a06\u00a0м, ${money(38000)}, содержание ${money(260)} в\u00a0день, 2\u00a0места для скорой.`);
    const news = article(db, 'score.news2')!;
    expect(news.section).toBe('scores');
    expect(news.blocks.find(b => b.key === 'points')!.text![0]).toBe('Дыхание, в минуту: 8 и меньше — 3; 9–11 — 1; 12–20 — 0; 21–24 — 2; 25 и больше — 3');
    expect(news.blocks.find(b => b.key === 'points')!.text).toContain('Температура, °C: 35,0 и меньше — 3; 35,1–36,0 — 1; 36,1–38,0 — 0; 38,1–39,0 — 1; 39,1 и больше — 2');
    expect(news.blocks.find(b => b.key === 'uses')!.refs!.map(r => r.id)).toEqual(db.scores['score.news2'].params.map(p => p.f));
    // палата — с койками (часть 26)
    expect(article(db, 'room.ward')!.blocks.find(b => b.key === 'sizes')!.text).toEqual([
      `S — 7\u00a0×\u00a07\u00a0м, ${money(22000)}, содержание ${money(150)} в\u00a0день, 2\u00a0койки.`,
      `M — 9\u00a0×\u00a07\u00a0м, ${money(34000)}, содержание ${money(250)} в\u00a0день, 4\u00a0койки.`,
    ]);
    const where = article(db, 'exam.cbc')!.blocks.find(b => b.key === 'where')!;
    expect(where.refs!.map(r => [r.id, r.note ?? ''])).toEqual([['room.lab', ''], ['eq.hematology_analyzer', ''], ['room.procedure', 'берут материал']]);
    // расспрос — у врача в кабинете
    expect(article(db, 'exam.ask_complaints')!.blocks.find(b => b.key === 'where')!.refs!.map(r => r.id)).toEqual(['room.office']);
  });

  test('больница: плёночный рентген медленнее и менее точен, цифровой — его улучшение; врача не нанимают', () => {
    const analog = article(db, 'eq.xray_analog')!;
    expect(analog.blocks.find(b => b.key === 'upgradedBy')!.refs!.map(r => r.id)).toEqual(['eq.xray_digital']);
    const text = analog.blocks.find(b => b.key === 'prices')!.text!.join(' ');
    expect(text).toContain('в\u00a01,3\u00a0раза дольше');
    expect(text).toContain('чувствительность — на\u00a06, специфичность — на\u00a03\u00a0процентных пункта');
    expect(article(db, 'eq.xray_digital')!.blocks.find(b => b.key === 'upgrades')!.refs!.map(r => r.id)).toEqual(['eq.xray_analog']);
    expect(article(db, 'role.doctor')!.blocks.map(b => b.key)).toEqual(['what', 'worksIn']);
    expect(article(db, 'role.nurse')!.subtitle).toBe(`Должность · ${money(1300)}–${money(2100)} за смену`);
    expect(search(db, 'анализатор').map(r => r.id)).toContain('eq.urine_analyzer');
  });

  test('без подсказок героев кампании «Анамнеза»: ни раздела, ни статей, ни в поиске', () => {
    expect(Object.keys(db.tips).length).toBeGreaterThan(0);
    expect(SECTIONS).not.toContain('tips');
    expect(sectionOf(db, 'tip.strep')).toBeUndefined();
    expect(article(db, 'tip.strep')).toBeUndefined();
    expect(search(db, 'расспрос').map(r => r.id).filter(id => id.startsWith('tip.'))).toEqual([]);
  });

  test('больница ПК: операционная — операции, бригада и все аппараты сразу; раздел — все помещения, аппараты и должности', () => {
    const or = article(db, 'room.or')!;
    expect(or.blocks.map(b => b.key)).toEqual(['what', 'doneHere', 'needs', 'sizes']);
    expect(or.blocks.find(b => b.key === 'doneHere')!.refs!.map(r => r.id)).toContain('tx.appendectomy');
    const needs = or.blocks.find(b => b.key === 'needs')!.rows!;
    expect(needs.map(r => r.label)).toEqual(['Люди', 'Аппараты — все сразу']);
    expect(needs[0].refs.map(r => r.id)).toEqual(db.rooms['room.or'].staff);
    const all = Object.keys(db.rooms).length + Object.keys(db.equipment).length + Object.keys(db.roles).length;
    expect(sectionsOf(db).find(x => x.section === 'hospital')!.count).toBe(all);
  });

  test('поиск: по названию и коду МКБ, «е» вместо «ё», регистр не важен', () => {
    expect(search(db, 'пневм').map(r => r.id)).toContain('cond.pneumonia_cap');
    expect(search(db, 'j18').map(r => r.id)).toEqual(['cond.pneumonia_cap']);
    expect(search(db, 'КАШЕЛЬ').map(r => r.id)).toContain('sym.cough');
    expect(search(db, 'подъем сегмента').map(r => r.id)).toEqual(['ecg.st_elevation']);
    expect(search(db, '   ')).toEqual([]);
  });
});
