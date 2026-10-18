// Касса и планёрка в окне (spec docs/specs/2026-10-economy.md, «Верхняя полоса», «Планёрка», «Часы приёма», «Предел минуса и
// кредит»): касса сейчас, изменение с 08:00 и репутация — из упакованного среза; планёрка в 08:00 — из извещения `morning`:
// данные для экрана (названия из базы — здесь, слова — при отрисовке), автопауза и «Продолжить»; часы приёма и кредит —
// командами движка. Пока открыта карта пациента, планёрка ждёт её закрытия.
import type { Id } from '../content/types';
import { REPAIR_PCT } from '../engine/shift/engine';
import type { DayLoad, DaySummary, Notice } from '../engine/shift/types';
import { named } from '../i18n';
import { H, NO_CASH } from '../sim/pack';
import type { Slice } from '../sim/client';
import type { Speed } from '../ui/store';
import type { Game } from './game';

/** Нанятый врач на планёрке: должность, навык, приёмы за сутки. */
export interface DoctorDay {
  role: string;
  skill: number;
  seen: number;
  correct: number;
  asked: number;
  taken: number;
  unsafe: number;
  /** специалист без записи — в потоке не принимает (spec «Чего в части нет») */
  idle: boolean;
}

/** Подсказка планёрки — ключ строки и числа к ней (spec «Планёрка», «Подсказка»). */
export type Tip =
  | { key: 'below' | 'debt' | 'door' | 'beds' | 'toilet' | 'worse' | 'idle' | 'fine' }
  | { key: 'left'; n: number; of: number; wait: number }
  | { key: 'room'; name: string; wait: number }
  | { key: 'audit'; rub: number };

/** Планёрка для экрана: итог суток и то, что окну нужно назвать словами. */
export interface MeetingView {
  summary: DaySummary;
  doctors: DoctorDay[];
  /** кабинеты обследований из узких мест: номер помещения → название */
  rooms: Record<string, string>;
  broken: { eq: string; room: string; repair: number }[];
  /** ваши лежащие, которым стало хуже: кто и как */
  worse: { id: string; who: string; state: string }[];
  tip: Tip;
  /** кредит взят с этой планёрки: сколько */
  loanTaken?: number;
}

export interface EconomyHud {
  /** касса сейчас, изменение с 08:00, репутация; кассы нет — undefined */
  cash?: number;
  today?: number;
  reputation?: number;
  /** последняя планёрка; до первой — нет */
  meeting?: MeetingView;
  /** экран планёрки открыт */
  open: boolean;
  /** автопауза планёрки: открывать в 08:00 */
  autopause: boolean;
  /** часы приёма */
  hours: [number, number];
  /** предел минуса, ₽, и условия кредита (`money.yaml`) */
  limit: number;
  loan: { fee: number; days: number };
}

export type MoneyAction =
  | { kind: 'open' }
  | { kind: 'close' }
  | { kind: 'autopause'; on: boolean }
  | { kind: 'hours'; open: number; close: number }
  | { kind: 'loan' };

/** Узкое место: ждали полчаса и дольше или в очереди было от пяти (spec «Узкие места суток»). */
export const SLOW_WAIT = 30;
export const LONG_QUEUE = 5;

export class Money {
  hud: EconomyHud;
  /** скорость до планёрки: «Продолжить» — она же; «До утра» — ×1 */
  private before: Speed | null = null;
  /** планёрка пришла, пока карта пациента открыта, — откроется, когда её закроют */
  private pending = false;

  constructor(private g: Game) {
    this.hud = { open: false, autopause: true, hours: [8, 20], limit: 0, loan: { fee: 0, days: 1 } };
  }

  /** Игра началась: часы приёма, предел минуса и кредит — из базы (поля игры при создании окна ещё пусты). */
  start() {
    const db = this.g.db;
    this.hud = {
      ...this.hud, hours: [...(db.day?.hours ?? [8, 20])] as [number, number], limit: db.money?.overdraft ?? 0,
      loan: { fee: db.money?.loan.fee ?? 0, days: db.money?.loan.days ?? 1 },
    };
  }

  // ---------------------------------------------------------------- из потока

  /** Срез: касса и репутация; планёрка — открыть; `was` — скорость до автопауз этого среза. */
  onSlice(s: Slice, was: Speed) {
    const b = s.buf;
    const cash = b[H.cash];
    if (cash === NO_CASH) {
      delete this.hud.cash;
      delete this.hud.today;
      delete this.hud.reputation;
    } else {
      this.hud.cash = cash;
      this.hud.today = b[H.today];
      this.hud.reputation = b[H.reputation];
    }
    const morning = s.notices.find((n): n is Extract<Notice, { kind: 'morning' }> => n.kind === 'morning');
    if (!morning) return;
    const worse = s.notices.filter((n): n is Extract<Notice, { kind: 'worse' }> => n.kind === 'worse').map(n => n.id);
    this.hud.meeting = this.viewOf(morning.summary, morning.broken ?? [], worse);
    if (this.hud.autopause) this.show(was);
  }

  /** Планёрка для экрана: врачи, кабинеты узких мест, сломанное с ценой ремонта, кому хуже, подсказка. */
  private viewOf(summary: DaySummary, broken: readonly string[], worseIds: readonly string[]): MeetingView {
    const { db, plan, staff } = this.g;
    const doctors: DoctorDay[] = Object.entries(summary.colleagues ?? {}).map(([id, c]) => {
      const m = staff.find(x => x.id === id);
      const role = c.role ?? m?.role ?? '';
      return {
        role: named(db.roles[role]?.name, role), skill: m?.skill ?? 0, seen: c.seen, correct: c.seen > 0 ? Math.round((100 * c.correct) / c.seen) : 0,
        asked: c.asked ?? 0, taken: c.taken ?? 0, unsafe: c.unsafe ?? 0, idle: false,
      };
    });
    // специалисты, которые за сутки никого не приняли: к ним никто не записался (spec docs/specs/2026-10-specialists.md)
    for (const m of staff) {
      if (!m.room || !db.roles[m.role]?.profile || summary.colleagues?.[m.id]) continue;
      doctors.push({ role: named(db.roles[m.role]?.name, m.role), skill: m.skill, seen: 0, correct: 0, asked: 0, taken: 0, unsafe: 0, idle: true });
    }
    const rooms: Record<string, string> = {};
    for (const id of Object.keys(summary.load?.rooms ?? {})) {
      const r = plan.rooms.find(x => x.id === id);
      rooms[id] = r ? named(db.rooms[r.type]?.name, r.type) : id;
    }
    const out = broken.flatMap(key => {
      const [roomId, slot] = key.split(':');
      const r = plan.rooms.find(x => x.id === roomId);
      const eq = r?.equipment[Number(slot)];
      if (!r || !eq) return [];
      return [{ eq: named(db.equipment[eq]?.name, eq), room: named(db.rooms[r.type]?.name, r.type), repair: Math.round((db.equipment[eq].price * REPAIR_PCT) / 100) }];
    });
    const ward = this.g.doctor.hud.state?.ward ?? [];
    const worse = worseIds.map(id => {
      const w = ward.find(x => x.id === id);
      return { id, who: w?.who ?? id, state: w?.stateText ?? '' };
    });
    return { summary, doctors, rooms, broken: out, worse, tip: tipOf(summary, rooms, worse.length > 0, doctors.some(d => d.idle), this.hud.limit) };
  }

  // ---------------------------------------------------------------- экран

  /** Открыть планёрку с автопаузой; карта пациента открыта — после неё. `was` — к какой скорости вернёт «Продолжить». */
  private show(was: Speed) {
    if (this.g.doctor.open) {
      this.pending = true;
      return;
    }
    if (!this.hud.open) this.before = was;
    this.g.setSpeed(0);
    this.hud.open = true;
  }

  /** Кадр панелей: планёрка ждала, пока закроют карту пациента. */
  frame() {
    if (this.pending && !this.g.doctor.open) {
      this.pending = false;
      this.show(this.g.speed);
    }
  }

  private close() {
    if (!this.hud.open) return;
    this.hud.open = false;
    // пауза до планёрки — не причина стоять после неё: часы пойдут ×1
    this.g.setSpeed(this.before || 1);
    this.before = null;
  }

  /** Для панелей (10 раз в секунду): планёрка, ждавшая закрытия карты, — сейчас; снимок — новый объект. */
  view(): EconomyHud {
    this.frame();
    return { ...this.hud };
  }

  /** Открыта ли планёрка: клавиши скорости молчат, пока её не закроют. */
  get open(): boolean {
    return this.hud.open;
  }

  dispatch(a: MoneyAction) {
    switch (a.kind) {
      case 'open':
        if (this.hud.meeting && !this.hud.open) this.show(this.g.ff ? 1 : this.g.speed);
        break;
      case 'close':
        this.close();
        break;
      case 'autopause':
        this.hud.autopause = a.on;
        break;
      case 'hours':
        // часы приёма — целые, открытие раньше закрытия (команда `hours` части 5а); неверные движок не примет
        if (Number.isInteger(a.open) && Number.isInteger(a.close) && a.open >= 0 && a.close <= 24 && a.open < a.close) {
          this.hud.hours = [a.open, a.close];
          this.g.client.command({ kind: 'hours', open: a.open, close: a.close });
        }
        break;
      case 'loan': {
        // кредит — то, что банк предложил на планёрке; второй раз — не предлагается
        const offer = this.hud.meeting?.summary.economy?.offer;
        if (offer === undefined || !this.hud.meeting) break;
        this.g.client.command({ kind: 'loan' });
        const { offer: _, ...rest } = this.hud.meeting.summary.economy!;
        this.hud.meeting = { ...this.hud.meeting, summary: { ...this.hud.meeting.summary, economy: rest }, loanTaken: offer };
        break;
      }
    }
    this.g.refresh();
  }
}

/**
 * Подсказка планёрки — первая подходящая (spec «Планёрка»): касса ниже предела → в минусе → ушли 10 % и больше → кабинет с
 * ожиданием от часа → скорая у входа → стационар полон → нет санузла → страховая не оплатила обследования без показаний →
 * вашим лежащим хуже → специалисты без записи → «больница справляется».
 */
export function tipOf(d: DaySummary, rooms: Record<string, string>, worse: boolean, idle: boolean, limit: number): Tip {
  const e = d.economy;
  const load: DayLoad | undefined = d.load;
  if (e && e.cash < -limit) return { key: 'below' };
  if (e && e.cash < 0) return { key: 'debt' };
  if (d.arrived > 0 && d.left * 10 >= d.arrived && d.left > 0) return { key: 'left', n: d.left, of: d.arrived, wait: load?.wait ?? 0 };
  const slow = Object.entries(load?.rooms ?? {}).sort((a, b) => b[1].wait - a[1].wait)[0];
  if (slow && slow[1].wait >= 60) return { key: 'room', name: rooms[slow[0]] ?? slow[0], wait: slow[1].wait };
  if ((load?.door ?? 0) > 0) return { key: 'door' };
  if (load?.beds && load.beds.of > 0 && load.beds.peak >= load.beds.of) return { key: 'beds' };
  if (e?.reputation.reasons.some(r => r.key === 'noToilet')) return { key: 'toilet' };
  if (e && e.ledger.audit.unindicated > 0 && e.ledger.audit.cut > 0) return { key: 'audit', rub: e.ledger.audit.cut };
  if (worse) return { key: 'worse' };
  if (idle) return { key: 'idle' };
  return { key: 'fine' };
}

/** Узкие места суток для экрана — до трёх, где ждали полчаса и дольше или очередь была от пяти, самые долгие сначала. */
export function slowOf(load: DayLoad | undefined): ({ kind: 'doctors'; queue: number; wait: number } | { kind: 'room'; id: Id; queue: number; wait: number; n: number } | { kind: 'door'; n: number } | { kind: 'beds'; peak: number; of: number })[] {
  if (!load) return [];
  const out: { wait: number; row: ReturnType<typeof slowOf>[number] }[] = [];
  if (load.wait >= SLOW_WAIT || load.queue >= LONG_QUEUE) out.push({ wait: load.wait, row: { kind: 'doctors', queue: load.queue, wait: load.wait } });
  for (const [id, r] of Object.entries(load.rooms ?? {})) if (r.wait >= SLOW_WAIT || r.queue >= LONG_QUEUE) out.push({ wait: r.wait, row: { kind: 'room', id, queue: r.queue, wait: r.wait, n: r.n } });
  if ((load.door ?? 0) > 0) out.push({ wait: Infinity, row: { kind: 'door', n: load.door! } });
  if (load.beds && load.beds.of > 0 && load.beds.peak >= load.beds.of) out.push({ wait: Infinity, row: { kind: 'beds', peak: load.beds.peak, of: load.beds.of } });
  return out.sort((a, b) => b.wait - a.wait).slice(0, 3).map(x => x.row);
}
