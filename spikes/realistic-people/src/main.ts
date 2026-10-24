// Проба «реалистичные люди»: какой вид открыть — по ?view=.
import { mapView } from './mapview';
import { done, el, fail } from './probe';
import { portraitView } from './portrait';
import { makehumanView } from './mh/view';
import { shapesView } from './shapes';

const VIEWS: [string, string][] = [
  ['map', '1. Rocketbox на карте рядом с нынешними людьми игры'],
  ['lod', '2. Rocketbox упрощённые: полная сетка, ~2,5 и ~0,8 тыс. треугольников'],
  ['portrait', '3. Лицо в карточке: врач, медсестра, пациент'],
  ['expression', '4. Выражения из форм лица'],
  ['makehuman', '5. MakeHuman: три человека из одной сетки'],
  ['sliders', '6. MakeHuman: ползунки лица'],
];

const view = new URLSearchParams(location.search).get('view');
try {
  if (view === 'map' || view === 'lod') await mapView(view);
  else if (view === 'portrait' || view === 'expression') await portraitView(view === 'expression');
  else if (view === 'makehuman' || view === 'sliders') await makehumanView(view === 'sliders');
  else if (view === 'shapes') await shapesView();
  else {
    const menu = el('div', 'menu', document.getElementById('app')!);
    el('h2', '', menu, 'Реалистичные люди — проба');
    for (const [v, title] of VIEWS) {
      const a = el('a', '', menu, title);
      a.href = `?view=${v}`;
    }
  }
  done();
} catch (e) {
  fail(e);
}
