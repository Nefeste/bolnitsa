// Карта на PixiJS 8 (WebGL). Неподвижный слой — один Graphics: геометрия строится один раз и
// дальше только рисуется. Люди — ParticleContainer: одна текстура (атлас), на кадр меняются
// только позиции.
// Pixi без eval: страница живёт под строгим CSP (без 'unsafe-eval')
import 'pixi.js/unsafe-eval';
import { autoDetectRenderer, CanvasSource, Container, Graphics, Particle, ParticleContainer, Rectangle, Texture, type WebGLRenderer } from 'pixi.js';
import type { Crowd } from './crowd';
import { BACKGROUND, CELL_PX, type Hospital, staticShapes } from './hospital';
import { SPR, SPR_SCALE } from './sprites';
import { BITMAP_SCALE, type Camera, gpuString, HIDE, STATIC_MODE, type MapRenderer, type RendererFactory } from './types';

export const createPixi: RendererFactory = async (hospital: Hospital, atlasCanvas, w, h, dpr) => {
  const canvas = document.createElement('canvas');
  const renderer = (await autoDetectRenderer({
    canvas,
    width: w,
    height: h,
    resolution: dpr,
    autoDensity: true,
    // MSAA холста — только по ?aa=1: в программном WebGL он кратно дороже (README, «Результаты»)
    antialias: new URLSearchParams(location.search).get('aa') === '1',
    background: BACKGROUND,
    preference: ['webgl'],
  })) as WebGLRenderer;

  const stage = new Container();
  const world = new Container();
  stage.addChild(world);

  const g = new Graphics();
  const { rects, discs } = staticShapes(hospital);
  for (const r of rects) g.rect(r.x, r.y, r.w, r.h).fill(r.color);
  for (const d of discs) g.circle(d.x, d.y, d.r).fill(d.color);
  if (STATIC_MODE === 'bitmap') g.cacheAsTexture({ resolution: BITMAP_SCALE, antialias: true });
  if (HIDE !== 'static') world.addChild(g);

  const source = new CanvasSource({ resource: atlasCanvas });
  const frames: Texture[] = [];
  for (let i = 0; i < atlasCanvas.width / SPR; i++) frames.push(new Texture({ source, frame: new Rectangle(i * SPR, 0, SPR, SPR) }));
  const people = new ParticleContainer({ dynamicProperties: { position: true, rotation: false, vertex: false, color: false }, texture: frames[0] });
  if (HIDE !== 'people') world.addChild(people);
  let particles: Particle[] = [];

  const self: MapRenderer = {
    name: 'pixi',
    canvas,
    gpu: `PixiJS ${renderer.name}, пол: ${STATIC_MODE} — ${gpuString(renderer.gl)}`,
    setCrowd(crowd: Crowd) {
      // тот же контейнер: другие люди — другие частицы
      people.removeParticles();
      particles = [];
      for (let i = 0; i < crowd.n; i++) {
        const p = new Particle({ texture: frames[crowd.look[i]], anchorX: 0.5, anchorY: 0.5, scaleX: SPR_SCALE, scaleY: SPR_SCALE });
        particles.push(p);
      }
      people.addParticle(...particles);
      people.update();
    },
    draw(crowd: Crowd, cam: Camera) {
      world.position.set(cam.tx, cam.ty);
      world.scale.set(cam.s);
      for (let i = 0; i < particles.length; i++) {
        const p = particles[i];
        p.x = (crowd.x[i] + 0.5) * CELL_PX;
        p.y = (crowd.y[i] + 0.5) * CELL_PX;
      }
      renderer.render(stage);
    },
    resize(nw: number, nh: number, ndpr: number) {
      renderer.resize(nw, nh, ndpr);
    },
    destroy() {
      stage.destroy({ children: true });
      renderer.destroy();
      canvas.remove();
    },
  };
  return self;
};
