// Звуки окна и событий (spec docs/specs/2026-11-sound.md, часть 1): файлы собирает tools/sound/gen.ts из формул, лежат в
// assets/audio. Звук — только в ответ на действие игрока или на событие, которого он ждёт (ADR 0023 устава, правило 6):
// какие и когда — `CUES` и `siteCue`. Браузер даёт звук после первого нажатия игрока (`unlock`); до него — тихо. Правила —
// чистые функции, их проверяют тесты (tools/test/sound.test.ts).

/** Звуки части 1 — по файлам `assets/audio/<звук>.wav`. */
export const CUES = ['click', 'build', 'demolish', 'hire', 'refuse', 'urgent', 'letter', 'meeting', 'goal'] as const;
export type Cue = (typeof CUES)[number];

/** Один и тот же звук — не чаще, мс: строка кнопок и пачка извещений не трещат. */
export const GAP_MS = 80;

/** Громкость — от 0 до 1 шагом 0,1; 0 — без звука. */
export const VOLUMES = [0, 0.1, 0.2, 0.3, 0.4, 0.5, 0.6, 0.7, 0.8, 0.9, 1] as const;
export const DEFAULT_VOLUME = 0.7;

/** Громкость из чего угодно: ближайшая ступень, не число — по умолчанию. */
export function volumeOf(v: unknown): number {
  if (typeof v !== 'number' || !Number.isFinite(v)) return DEFAULT_VOLUME;
  return VOLUMES.reduce((a, b) => (Math.abs(b - v) < Math.abs(a - v) ? b : a));
}

/** Команды стройки со звуком: встало — стук, снесено — два стука вниз, нанят — колокольчики; прочие — без звука. */
const SITE: Partial<Record<string, Cue>> = {
  room: 'build', ready: 'build', item: 'build', door: 'build', bench: 'build', furnish: 'build', move: 'build',
  demolish: 'demolish', remove: 'demolish', undecor: 'demolish', undoor: 'demolish',
  hire: 'hire', reserve: 'hire',
};

/** Звук у результата команды стройки: не прошла — отказ; прошла — по виду команды. */
export function siteCue(cmd: string, ok: boolean): Cue | undefined {
  return ok ? SITE[cmd] : 'refuse';
}

/** Можно ли сыграть звук в `now`, если прошлый раз он звучал в `last`. */
export function due(last: number | undefined, now: number): boolean {
  return last === undefined || now - last >= GAP_MS;
}

/** Звук окна: громкость, файлы, сколько раз звучал каждый (для сценария в браузере). */
export class Sound {
  readonly played = Object.fromEntries(CUES.map(c => [c, 0])) as Record<Cue, number>;
  /** все файлы загружены */
  ready = false;
  private ctx?: AudioContext;
  private out?: GainNode;
  private buffers = new Map<Cue, AudioBuffer>();
  private last = new Map<Cue, number>();

  /** `on` — звук в этой игре вообще есть: на живой сцене экрана начала и в «Авто-бенче» его нет. */
  constructor(private volume: number, private readonly on: boolean, private readonly base = 'assets/audio/') {}

  /** Первое нажатие игрока: браузер даёт звук только после него — тогда и файлы. */
  unlock() {
    if (!this.on || this.ctx || typeof AudioContext === 'undefined') return;
    const ctx = new AudioContext();
    this.ctx = ctx;
    this.out = ctx.createGain();
    this.out.gain.value = this.volume;
    this.out.connect(ctx.destination);
    void ctx.resume().catch(() => {});
    void Promise.all(
      CUES.map(async c => {
        const r = await fetch(`${this.base}${c}.wav`);
        this.buffers.set(c, await ctx.decodeAudioData(await r.arrayBuffer()));
      }),
    ).then(
      () => (this.ready = true),
      () => {},
    );
  }

  setVolume(v: number) {
    this.volume = volumeOf(v);
    if (this.out) this.out.gain.value = this.volume;
  }

  /** Сыграть звук: есть звук, громкость не ноль, окно видно, файл загружен и звук не звучал только что. */
  play(cue: Cue, now = performance.now()) {
    if (!this.on || this.volume <= 0 || !this.ctx || !this.out || (typeof document !== 'undefined' && document.hidden)) return;
    const buf = this.buffers.get(cue);
    if (!buf || !due(this.last.get(cue), now)) return;
    this.last.set(cue, now);
    const src = this.ctx.createBufferSource();
    src.buffer = buf;
    src.connect(this.out);
    src.start();
    this.played[cue]++;
  }
}
