// Файлы MakeHuman (CC0) — свои разборщики по самим файлам, без кода MakeHuman/MPFB (их код — AGPL/GPL):
//   .obj   — базовая сетка hm08 и сетки «прокси» (глаза, брови, ресницы, волосы, одежда): v, vt, f (четырёх- и треугольники), g;
//   .target — сдвиги вершин базовой сетки: «номер dx dy dz» на строку (номера с нуля, только сдвинутые вершины);
//   .mhclo — как прокси сидит на теле: для каждой вершины прокси три вершины тела, веса и сдвиг; сдвиг масштабируется по
//            осям отношением нынешнего расстояния между двумя опорными вершинами тела к записанному (x_scale, y_scale,
//            z_scale); delete_verts — вершины тела, скрытые под одеждой.

export interface Obj {
  /** координаты вершин подряд (x, y, z) в порядке строк v */
  v: Float32Array;
  vt: Float32Array;
  /** грани: начало в fv/ft, число углов (3 или 4), группа */
  fStart: Uint32Array;
  fSize: Uint8Array;
  fGroup: Uint16Array;
  fv: Uint32Array;
  ft: Uint32Array;
  groups: string[];
}

export function parseObj(text: string): Obj {
  const v: number[] = [];
  const vt: number[] = [];
  const fStart: number[] = [];
  const fSize: number[] = [];
  const fGroup: number[] = [];
  const fv: number[] = [];
  const ft: number[] = [];
  const groups: string[] = [];
  let group = -1;
  for (const line of text.split('\n')) {
    const c0 = line.charCodeAt(0);
    if (c0 === 118 /* v */) {
      const p = line.trim().split(/\s+/);
      if (p[0] === 'v') v.push(+p[1], +p[2], +p[3]);
      else if (p[0] === 'vt') vt.push(+p[1], +p[2]);
    } else if (c0 === 102 /* f */) {
      const p = line.trim().split(/\s+/);
      fStart.push(fv.length);
      fSize.push(p.length - 1);
      if (group < 0) {
        groups.push('default');
        group = 0;
      }
      fGroup.push(group);
      for (let k = 1; k < p.length; k++) {
        const [a, b] = p[k].split('/');
        fv.push(+a - 1);
        ft.push(b ? +b - 1 : +a - 1);
      }
    } else if (c0 === 103 /* g */) {
      const name = line.slice(2).trim();
      group = groups.indexOf(name);
      if (group < 0) group = groups.push(name) - 1;
    }
  }
  return {
    v: new Float32Array(v),
    vt: new Float32Array(vt),
    fStart: new Uint32Array(fStart),
    fSize: new Uint8Array(fSize),
    fGroup: new Uint16Array(fGroup),
    fv: new Uint32Array(fv),
    ft: new Uint32Array(ft),
    groups,
  };
}

export interface Target {
  idx: Uint32Array;
  /** сдвиги (dx, dy, dz) подряд */
  d: Float32Array;
}

export function parseTarget(text: string): Target {
  const idx: number[] = [];
  const d: number[] = [];
  for (const line of text.split('\n')) {
    const c0 = line.charCodeAt(0);
    if (!(c0 >= 48 && c0 <= 57)) continue; // строка данных начинается с номера вершины
    const p = line.split(/\s+/);
    idx.push(+p[0]);
    d.push(+p[1], +p[2], +p[3]);
  }
  return { idx: new Uint32Array(idx), d: new Float32Array(d) };
}

export interface Clo {
  name: string;
  objFile: string;
  /** три опорные вершины тела на вершину прокси */
  refs: Uint32Array;
  w: Float32Array;
  off: Float32Array;
  /** опорные пары и расстояние по осям x, y, z (на сетке, где прокси делали) */
  scale: [number, number, number][];
  /** вершины тела, которые прокси закрывает (одежда) */
  hide: Set<number>;
  zDepth: number;
}

export function parseMhclo(text: string): Clo {
  const refs: number[] = [];
  const w: number[] = [];
  const off: number[] = [];
  const scale: [number, number, number][] = [
    [0, 0, 1],
    [0, 0, 1],
    [0, 0, 1],
  ];
  const hide = new Set<number>();
  let name = '';
  let objFile = '';
  let zDepth = 0;
  let mode = '';
  for (const raw of text.split('\n')) {
    const line = raw.trim();
    if (!line || line.startsWith('#')) continue;
    const p = line.split(/\s+/);
    if (/^[a-z_]+$/.test(p[0])) {
      // разделы данных — только verts и delete_verts; прочие слова (material, tag…) могут стоять и после «verts 0»
      if (p[0] === 'verts' || p[0] === 'delete_verts') mode = p[0];
      if (p[0] === 'name') name = p[1];
      else if (p[0] === 'obj_file') objFile = p[1];
      else if (p[0] === 'z_depth') zDepth = +p[1];
      else if (p[0] === 'x_scale' || p[0] === 'y_scale' || p[0] === 'z_scale') scale['xyz'.indexOf(p[0][0])] = [+p[1], +p[2], +p[3]];
      continue;
    }
    if (mode === 'verts') {
      if (p.length >= 9) {
        refs.push(+p[0], +p[1], +p[2]);
        w.push(+p[3], +p[4], +p[5]);
        off.push(+p[6], +p[7], +p[8]);
      } else {
        // одна опорная вершина — вершина прокси совпадает с вершиной тела
        refs.push(+p[0], +p[0], +p[0]);
        w.push(1, 0, 0);
        off.push(0, 0, 0);
      }
    } else if (mode === 'delete_verts') {
      for (let k = 0; k < p.length; k++) {
        if (p[k + 1] === '-') {
          for (let i = +p[k]; i <= +p[k + 2]; i++) hide.add(i);
          k += 2;
        } else hide.add(+p[k]);
      }
    }
  }
  return { name, objFile, refs: new Uint32Array(refs), w: new Float32Array(w), off: new Float32Array(off), scale, hide, zDepth };
}

/** Вершины прокси по нынешней (с целями) сетке тела `body`; результат — в `out`. */
export function fitProxy(c: Clo, body: Float32Array, out: Float32Array) {
  const s = [0, 1, 2].map(ax => {
    const [a, b, d] = c.scale[ax];
    return d ? Math.abs(body[a * 3 + ax] - body[b * 3 + ax]) / d : 1;
  });
  const n = c.refs.length / 3;
  for (let i = 0; i < n; i++) {
    const r0 = c.refs[i * 3] * 3;
    const r1 = c.refs[i * 3 + 1] * 3;
    const r2 = c.refs[i * 3 + 2] * 3;
    const w0 = c.w[i * 3];
    const w1 = c.w[i * 3 + 1];
    const w2 = c.w[i * 3 + 2];
    for (let ax = 0; ax < 3; ax++) out[i * 3 + ax] = w0 * body[r0 + ax] + w1 * body[r1 + ax] + w2 * body[r2 + ax] + c.off[i * 3 + ax] * s[ax];
  }
}
