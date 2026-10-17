// Режим врача в окне (spec docs/specs/2026-10-doctor-mode.md, «Окно»): что пришло из потока — состояние врача и вид карты;
// открыть и закрыть карту (мир стоит, пока она открыта; закрыли — прежняя скорость); действия карты и окна врача —
// командами в поток; автопауза на просьбу и результаты; фигура врача на карте. Правды о больном окно не видит: вид карты
// строит поток расчёта, отсюда — только знание о медицине из базы (caseView.ts: списки обследований и «Что это?»).
import type { BodySystem } from '../content/types';
import type { SiteResult } from '../engine/hospital/site';
import { type Command, type Difficulty, type Notice } from '../engine/shift/types';
import { lang, named, T } from '../i18n';
import { useDb } from '../sim/caseView';
import type { Slice } from '../sim/client';
import { DEFAULT_LEVEL, LEVELS } from '../sim/doctor';
import { setUiDb } from '../ui/doctor/db';
import { type DoctorAction, type DoctorHud, initialDoctor } from '../ui/doctor/types';
import type { Speed } from '../ui/store';
import { whyText } from './build';
import type { Game } from './game';

/** Уровень медицины из адреса (`?level=`); нет — «Студент» (spec «Сложность»). */
function levelOfUrl(): Difficulty {
  const v = typeof location !== 'undefined' ? new URLSearchParams(location.search).get('level') : null;
  return LEVELS.find(x => x === v) ?? DEFAULT_LEVEL;
}

export class Doctor {
  hud: DoctorHud = { ...initialDoctor, level: levelOfUrl() };
  /** скорость до того, как открыли карту: закрыли — она же */
  private before: Speed | null = null;
  /** собирать «За это время»: идёт действие карты */
  private collecting = false;
  /** где стоит фигура врача — номер помещения плана; -1 — фигуры нет */
  private figureAt = -1;
  /** «Взять случай» отправлен: больной у вас — карта; в вашей очереди — сказать об этом */
  private taking: string | undefined;

  constructor(private g: Game) {}

  /** Открыта ли карта пациента: мир стоит, скорость не меняется. */
  get open(): boolean {
    return this.hud.card !== undefined;
  }

  /** Смена началась: окну — база для знания о медицине (списки обследований, их цена, «Что это?»); потоку — язык, уровень. */
  start() {
    useDb(this.g.db);
    setUiDb(this.g.db);
    this.view(null);
  }

  private view(open: string | null) {
    this.g.client.doctor({ kind: 'view', open, lang, level: this.hud.level });
  }

  /** Язык сменили: поток пересоберёт строки. */
  relang() {
    this.view(this.hud.card?.id ?? null);
  }

  // ---------------------------------------------------------------- из потока

  onSlice(s: Slice) {
    if (s.doctor) {
      this.hud.state = s.doctor;
      // кого позвать после разбора — только свободному: тот же объект, пока список тот же
      const next = s.doctor.current ? undefined : (s.doctor.yours[0] ?? s.doctor.others[0]);
      if (next?.id !== this.hud.next?.id || next?.who !== this.hud.next?.who) this.hud.next = next ? { id: next.id, who: next.who } : undefined;
      this.placeFigure();
      const queued = this.taking ? s.doctor.yours.find(r => r.id === this.taking) : undefined;
      if (queued && !s.doctor.current) this.taking = undefined;
      else if (queued) {
        this.say(true, T.doctor.queued(queued.who));
        this.taking = undefined;
      }
    }
    if (s.card !== undefined) {
      const was = this.open;
      if (s.card) this.hud.card = s.card;
      else delete this.hud.card;
      if (s.card && !was) this.pause();
      if (!s.card && was) this.resume();
    }
    if (s.refused) {
      this.say(false, T.doctor.refused[s.refused.why] ?? s.refused.why);
      this.taking = undefined;
    }
    if (this.taking && this.hud.card?.id === this.taking) {
      this.say(true, T.doctor.notices.taken(this.hud.card.title));
      this.taking = undefined;
    }
    for (const n of s.notices) this.notice(n);
  }

  /** Извещение движка: автопауза на просьбу и результаты ваших; «За это время», пока идёт действие карты. */
  private notice(n: Notice) {
    if (this.open && this.collecting) {
      const line = this.meanwhileText(n);
      if (line) this.hud.meanwhile = [...this.hud.meanwhile, line];
    }
    if (!this.hud.autopause || this.open) return;
    if (n.kind === 'consult') {
      this.g.setSpeed(0);
      this.g.store.set({ tab: 'asks' });
    } else if (n.kind === 'resultsReady') this.g.setSpeed(0);
  }

  private meanwhileText(n: Notice): string | undefined {
    switch (n.kind) {
      case 'arrived':
        return n.triage === 'red' ? T.notices.arrivedRed : undefined;
      case 'ambulance':
        return T.notices.ambulance;
      case 'consult':
        return this.consultText(n);
      case 'resultsReady':
        return n.id === this.hud.card?.id ? undefined : this.resultsText(n.id);
      case 'arrest':
        return T.notices.arrest;
      case 'left':
        return T.notices.left;
      default:
        return undefined;
    }
  }

  /** Строка журнала о просьбе: кто просит. */
  consultText(n: Extract<Notice, { kind: 'consult' }>): string {
    const m = this.g.staff.find(x => x.id === n.by);
    return T.doctor.notices.consult(m ? named(this.g.db.roles[m.role]?.name, m.role) : '');
  }

  /** Строка журнала: готовы результаты вашего больного. */
  resultsText(id: string): string {
    const st = this.hud.state;
    const row = [...(st?.away ?? []), ...(st?.yours ?? []), ...(st?.current ? [st.current] : [])].find(r => r.id === id);
    return row ? T.doctor.notices.results(row.who) : T.notices.resultsReady;
  }

  /** Ответ потока на «Мой кабинет» и «Не принимаю». */
  onOffice(n: SiteResult) {
    if (n.ok) this.say(true, n.room ? T.doctor.office2.done : T.doctor.office2.offDone);
    else this.say(false, T.doctor.office2.failed(whyText(this.g.db, this.g.hospital.site, n.error ?? { kind: 'unknown' })));
  }

  private say(ok: boolean, text: string) {
    this.hud.said = { ok, text };
  }

  // ---------------------------------------------------------------- карта: мир стоит

  private pause() {
    this.before = this.g.speed;
    this.g.ff = false;
    this.g.speed = 0;
    this.hud.meanwhile = [];
  }

  private resume() {
    const back = this.before ?? 0;
    this.before = null;
    this.collecting = false;
    this.g.speed = back;
  }

  /** Закрыть карту (Esc, «Закрыть»): поток больше не шлёт её вид. */
  close(): boolean {
    if (!this.open) return false;
    delete this.hud.card;
    this.resume();
    this.view(null);
    this.g.refresh();
    return true;
  }

  // ---------------------------------------------------------------- действия панелей

  dispatch(a: DoctorAction) {
    const client = this.g.client;
    switch (a.kind) {
      case 'take':
        delete this.hud.said;
        this.taking = a.id;
        client.doctor({ kind: 'take', id: a.id });
        break;
      case 'open':
        this.view(a.id);
        break;
      case 'close':
        this.close();
        return;
      case 'act':
      case 'acts': {
        const id = this.hud.card?.id;
        if (!id) break;
        this.hud.meanwhile = [];
        this.collecting = true;
        for (const cmd of a.kind === 'act' ? [a.cmd] : a.cmds) client.doctor({ kind: 'case', id, cmd });
        break;
      }
      case 'consult':
        client.command({ kind: 'consult', id: a.id, answer: a.answer, ...(a.to ? { to: a.to } : {}) });
        break;
      case 'mine':
        client.command({ kind: 'mine', systems: a.systems as BodySystem[] });
        break;
      case 'mineOpen':
        this.hud.mineOpen = a.open;
        break;
      case 'office':
        client.command({ kind: 'site', cmd: { kind: 'office', ...(a.room ? { room: a.room } : {}) } });
        break;
      case 'level':
        this.hud.level = a.level;
        this.view(this.hud.card?.id ?? null);
        break;
      case 'autopause':
        this.hud.autopause = a.on;
        break;
      case 'ward':
        client.command({ kind: a.how, id: a.id } as Command);
        break;
      case 'fold':
        this.hud.folded = a.folded;
        break;
      case 'next': {
        const next = this.hud.state?.yours[0];
        if (next) client.doctor({ kind: 'take', id: next.id });
        break;
      }
    }
    this.g.refresh();
  }

  // ---------------------------------------------------------------- фигура врача

  /** Фигура — там, где вы: ваш кабинет или смотровая, где вы у привезённого скорой; нет кабинета — нет фигуры. */
  placeFigure(force = false) {
    const at = this.hud.state?.at;
    const n = at ? this.g.plan.rooms.findIndex(r => r.id === at) : -1;
    if (n === this.figureAt && !force) return;
    this.figureAt = n;
    this.g.pop.placeYou(n);
  }

  /** Стройка пересобрала план: фигура — на место в новом плане. */
  relayout() {
    this.placeFigure(true);
  }
}
