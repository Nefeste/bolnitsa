// Сторона потока отрисовки (spec docs/specs/2026-10-shell-3d.md, «Обмен между потоками»): Web Worker с движком, ход
// часов кадрами, последний срез. В пути — не больше одного `tick`: пока ответ не пришёл, игровые секунды копятся, и
// поток не захлёбывается кадрами, если не успевает.
// Исправлено, как в копии «Фармзавода» (pharma: src/sim/client.ts @ b9696c0, Nefeste/pharma#53): счёт `roundTripsTaken`
// — память времён обрезана, и отметка начала прогона бенча длиной массива давала пустую выборку.
import type { Command, Notice, Ride, ShiftState } from '../engine/shift/types';
import type { CrewView } from '../engine/shift/crew';
import type { MoodView } from '../engine/shift/mood';
import type { NameRow } from './pack';
import type { SaveMeta } from './packing';
import type { DoctorAct, DoctorOut, FromSim, PathView, ToSim, World } from './protocol';

/** Срез и, если изменились, режим врача (spec docs/specs/2026-10-doctor-mode.md). */
export interface Slice extends DoctorOut {
  buf: Int32Array;
  names: NameRow[];
  notices: Notice[];
  lag: number;
  world?: World;
  /** путь пациента, которого показывает окно (`watch`) — когда он изменился */
  path?: PathView;
  /** сломанные с утра аппараты, «помещение:место», — когда список изменился */
  broken?: string[];
  /** кто из штата не в смене, а ещё в больнице — доводит приёмы (spec 2026-10-staff-shifts); когда список изменился */
  late?: number[];
  /** усталость и перерывы врачей в смене (spec 2026-10-staff-shifts, часть 2); когда изменились */
  crew?: CrewView[];
  /** настроение нанятых со сменой (spec 2026-10-staff-mood); когда изменилось */
  moods?: MoodView[];
  /** перевозки на каталке (spec 2026-10-orderlies); когда изменились */
  rides?: Ride[];
}

export class SimClient {
  private worker: Worker;
  private ticking = false;
  /** игровые секунды, которые часы игры прошли, а в поток ещё не отправлены (с дробью) */
  private owed = 0;
  private saves: ((s: ShiftState) => void)[] = [];
  /** файлы сохранения в пути (spec docs/specs/2026-10-saves.md): по очереди, как ответы потока */
  private packs: { ok: (r: { bytes: Uint8Array; meta: SaveMeta }) => void; fail: (e: Error) => void }[] = [];
  /** время на поток: от отправки `tick` до ответа, мс — для бенча; последние 1000–2000 */
  readonly roundTrips: number[] = [];
  /** сколько времён пришло всего: отметка начала прогона бенча (`since` в src/app/stats.ts) */
  roundTripsTaken = 0;
  private sentAt = 0;
  onSlice: (s: Slice) => void = () => {};
  onError: (message: string) => void = () => {};

  constructor(url: string) {
    this.worker = new Worker(url);
    this.worker.onmessage = (e: MessageEvent<FromSim>) => this.receive(e.data);
    this.worker.onerror = e => this.onError(e.message);
  }

  private post(msg: ToSim) {
    this.worker.postMessage(msg);
  }

  private receive(msg: FromSim) {
    if (msg.kind === 'error') return this.onError(msg.message);
    if (msg.kind === 'state') {
      this.saves.shift()?.(msg.state);
      return;
    }
    if (msg.kind === 'packed') {
      this.packs.shift()?.ok({ bytes: msg.bytes, meta: msg.meta });
      return;
    }
    if (msg.kind === 'packFailed') {
      this.packs.shift()?.fail(new Error(msg.message));
      return;
    }
    if (this.ticking) {
      this.ticking = false;
      this.roundTrips.push(performance.now() - this.sentAt);
      this.roundTripsTaken++;
      if (this.roundTrips.length > 2000) this.roundTrips.splice(0, 1000);
    }
    this.onSlice({
      buf: msg.buf, names: msg.names, notices: msg.notices, lag: msg.lag, ...(msg.world ? { world: msg.world } : {}),
      ...(msg.doctor ? { doctor: msg.doctor } : {}), ...(msg.card !== undefined ? { card: msg.card } : {}), ...(msg.seen ? { seen: msg.seen } : {}), ...(msg.errors ? { errors: msg.errors } : {}),
      ...(msg.refused ? { refused: msg.refused } : {}),
      ...(msg.path ? { path: msg.path } : {}), ...(msg.broken ? { broken: msg.broken } : {}), ...(msg.late ? { late: msg.late } : {}), ...(msg.crew ? { crew: msg.crew } : {}),
      ...(msg.moods ? { moods: msg.moods } : {}), ...(msg.rides ? { rides: msg.rides } : {}),
    });
  }

  start(msg: Extract<ToSim, { kind: 'start' }>) {
    this.owed = 0;
    this.post(msg);
  }

  /** Открыть сохранение (spec docs/specs/2026-10-saves.md): снимок, уже прошедший миграции. */
  load(state: ShiftState) {
    this.owed = 0;
    this.post({ kind: 'load', state });
  }

  /** Файл сохранения: поток сжимает снимок с шапкой и видом окна. */
  pack(meta: Omit<SaveMeta, 'day' | 't' | 'cash'>, view?: unknown): Promise<{ bytes: Uint8Array; meta: SaveMeta }> {
    return new Promise((ok, fail) => {
      this.packs.push({ ok, fail });
      this.post({ kind: 'pack', meta, ...(view !== undefined ? { view } : {}) });
    });
  }

  command(cmd: Command) {
    this.post({ kind: 'command', cmd });
  }

  /** Режим врача: карта, «Взять случай», действие в карте (spec docs/specs/2026-10-doctor-mode.md). */
  doctor(act: DoctorAct) {
    this.post({ kind: 'doctor', act });
  }

  /** `tick` в пути: промотка («До утра», бенч) добавляет секунды, только когда поток ответил, — иначе при сотнях кадров в
   *  секунду долг копится быстрее, чем поток считает, и промотка проскакивает цель. */
  get busy(): boolean {
    return this.ticking;
  }

  /** Кадр: часам прибавилось `gameSeconds` (с дробью); поток получает целые секунды и бюджет. */
  frame(gameSeconds: number, budgetMs: number) {
    this.owed += gameSeconds;
    if (this.ticking) return;
    const seconds = Math.floor(this.owed);
    this.owed -= seconds;
    this.ticking = true;
    this.sentAt = performance.now();
    this.post({ kind: 'tick', seconds, budgetMs });
  }

  /** Показывать путь этого пациента (номер в движке); null — никого (spec docs/specs/2026-10-flow-ui.md). */
  watch(id: string | null) {
    this.post({ kind: 'watch', id });
  }

  save(): Promise<ShiftState> {
    return new Promise(resolve => {
      this.saves.push(resolve);
      this.post({ kind: 'save' });
    });
  }

  terminate() {
    this.worker.terminate();
  }
}
