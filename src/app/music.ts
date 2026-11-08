// Музыка (spec docs/specs/2026-11-sound.md, часть 3; решения владельца #208 — CC0 и CC BY с OpenGameArt и Free Music
// Archive, #214 — какие пьесы): спокойные пьесы по кругу, вперемешку, с тишиной между ними, тише звуков. Файлы —
// assets/audio/music/<id>.webm (собирает tools/sound/music.ts), список — music.gen.ts. Как и звук части 1, — с первого
// нажатия игрока (`unlock`): раньше браузер звук не даёт; не звучит на живой сцене экрана начала, в «Авто-бенче», в скрытом
// окне и при громкости 0. Пьеса грузится целиком (`fetch`, затем `blob:`) и играет элементом `<audio>`: сжатая, а не
// развёрнутая в память, как звуки, — и протоколу `app://` окна не нужно отдавать файл по частям. Правила — чистые функции,
// их проверяют тесты (tools/test/music.test.ts).
import { VOLUMES } from './sound';

/** Пьеса: название, автор, лицензия, страница; у CC BY — строка атрибуции (её показывают «Настройки»). */
export interface Track {
  id: string;
  title: string;
  author: string;
  license: string;
  page: string;
  credit?: string;
}

/** Громкость «Музыка» — ступени, как у «Звука»; по умолчанию — половина. */
export const DEFAULT_MUSIC = 0.5;
/** Музыка тише звуков: громкость элемента — громкость «Музыка» на эту долю. */
export const MUSIC_GAIN = 0.35;
/** Тишина между пьесами, с. */
export const PAUSE_S = 30;

/** Громкость «Музыка» из чего угодно: ближайшая ступень, не число — по умолчанию. */
export function musicOf(v: unknown): number {
  if (typeof v !== 'number' || !Number.isFinite(v)) return DEFAULT_MUSIC;
  return VOLUMES.reduce((a, b) => (Math.abs(b - v) < Math.abs(a - v) ? b : a));
}

/**
 * Круг пьес: каждая по разу, вперемешку (`rnd` — число из [0, 1)); первая — не та, что звучала последней (`last`), чтобы
 * одна пьеса не шла дважды подряд на стыке кругов.
 */
export function shuffleOrder(n: number, last: number | undefined, rnd: () => number): number[] {
  const a = Array.from({ length: n }, (_, i) => i);
  for (let i = n - 1; i > 0; i--) {
    const j = Math.floor(rnd() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  if (n > 1 && a[0] === last) [a[0], a[1]] = [a[1], a[0]];
  return a;
}

/** Проигрыватель музыки окна: громкость, круг пьес, что звучит, сколько пьес начиналось (для сценария в браузере). */
export class Music {
  /** сколько пьес начало звучать */
  started = 0;
  /** что звучит сейчас; между пьесами и в тишине — нет */
  now?: Track;
  /** зовётся, когда пьеса начала звучать или смолкла: окно показывает, что звучит */
  onChange?: () => void;
  private el?: HTMLAudioElement;
  private url?: string;
  private queue: number[] = [];
  private last?: number;
  private timer?: ReturnType<typeof setTimeout>;
  private unlocked = false;
  /** ждёт: окно скрыто или громкость 0 — продолжит, когда станет можно */
  private idle = false;
  /** пьеса грузится: вторая не начнётся, пока не решится первая */
  private loading = false;

  /** `on` — музыка в этой игре вообще есть: на живой сцене экрана начала и в «Авто-бенче» её нет. */
  constructor(
    private readonly tracks: readonly Track[],
    private volume: number,
    private readonly on: boolean,
    private readonly base = 'assets/audio/music/',
    private readonly rnd: () => number = Math.random,
  ) {}

  /** Первое нажатие игрока: браузер даёт звук только после него — тогда и первая пьеса. */
  unlock() {
    if (!this.on || this.unlocked || typeof Audio === 'undefined' || this.tracks.length === 0) return;
    this.unlocked = true;
    if (typeof document !== 'undefined') document.addEventListener('visibilitychange', () => this.visibility());
    this.tick();
  }

  setVolume(v: number) {
    this.volume = musicOf(v);
    if (this.el) this.el.volume = this.volume * MUSIC_GAIN;
    if (this.volume <= 0) this.stop();
    else this.resume();
  }

  /** Окно скрыто — пьеса на паузе; снова видно — дальше с того же места. */
  private visibility() {
    if (typeof document === 'undefined') return;
    if (document.hidden) this.el?.pause();
    else if (this.el) void this.el.play().catch(() => {});
    else this.resume();
  }

  /** Можно ли звучать сейчас. */
  private can(): boolean {
    return this.on && this.unlocked && this.volume > 0 && !(typeof document !== 'undefined' && document.hidden);
  }

  /** Пора следующей пьесе: можно — играет, нельзя — ждёт. */
  private tick() {
    this.timer = undefined;
    if (this.loading) return;
    if (!this.can()) {
      this.idle = true;
      return;
    }
    this.idle = false;
    if (this.queue.length === 0) this.queue = shuffleOrder(this.tracks.length, this.last, this.rnd);
    const i = this.queue.shift()!;
    this.last = i;
    void this.start(this.tracks[i]);
  }

  private resume() {
    if (this.idle && !this.el && !this.loading && this.timer === undefined) this.tick();
  }

  private async start(t: Track) {
    this.loading = true;
    try {
      const r = await fetch(`${this.base}${t.id}.webm`);
      if (!r.ok) throw new Error(`${t.id}: ${r.status}`);
      const url = URL.createObjectURL(await r.blob());
      this.loading = false;
      if (!this.can()) {
        URL.revokeObjectURL(url);
        this.idle = true;
        return;
      }
      const el = new Audio(url);
      el.volume = this.volume * MUSIC_GAIN;
      el.onended = () => {
        this.drop();
        this.timer = setTimeout(() => this.tick(), PAUSE_S * 1000);
      };
      this.el = el;
      this.url = url;
      await el.play();
      this.started++;
      this.now = t;
      this.onChange?.();
    } catch {
      // файл не загрузился или браузер не дал играть — тишина до следующей пьесы
      this.loading = false;
      this.drop();
      this.timer = setTimeout(() => this.tick(), PAUSE_S * 1000);
    }
  }

  /** Убрать пьесу: элемент, адрес `blob:`, «что звучит». */
  private drop() {
    if (this.el) {
      this.el.onended = null;
      this.el.pause();
    }
    if (this.url) URL.revokeObjectURL(this.url);
    this.el = undefined;
    this.url = undefined;
    const was = this.now;
    this.now = undefined;
    if (was) this.onChange?.();
  }

  /** Громкость 0: тишина сразу; станет больше — новая пьеса. */
  private stop() {
    if (this.timer !== undefined) clearTimeout(this.timer);
    this.timer = undefined;
    this.drop();
    this.idle = true;
  }
}
