// Режим врача в окне (spec docs/specs/2026-10-doctor-mode.md, «Окно»): что пришло из потока — состояние врача и вид карты;
// открыть и закрыть карту; часы стоят, только когда нужно ваше решение (spec docs/specs/2026-10-owner-play-2.md): ваш
// пациент перед вами и открыта его карта — вошёл, вернулся, готов результат; чужая карта часы не останавливает. Действия
// карты и окна врача — командами в поток; автопауза на просьбу и результаты; фигура врача на карте. Правды о больном
// окно не видит: вид карты строит поток расчёта, отсюда — только знание о медицине из базы (caseView.ts: списки
// обследований и «Что это?»).
import type { BodySystem } from '../content/types';
import type { SiteResult } from '../engine/hospital/site';
import { type Command, type Difficulty, type Notice } from '../engine/shift/types';
import { lang, named, T } from '../i18n';
import { useDb } from '../sim/caseView';
import type { Slice } from '../sim/client';
import { AGREE_ALL, DEFAULT_LEVEL, LEVELS } from '../sim/doctor';
import { setUiDb } from '../ui/doctor/db';
import { type DoctorAction, type DoctorHud, initialDoctor } from '../ui/doctor/types';
import type { Speed } from '../ui/store';
import { whyText } from './build';
import type { Game } from './game';
import { firstOffice, type Role, ROLE_SETS, roleOf } from './roles';
import { DEFAULT_ASKS } from '../engine/shift/approve';
import { DOCTOR, standInOf } from '../engine/hospital/requirements';
import { YOU } from '../render/population';

/**
 * Сколько секунд игры ждать, пока фигура дойдёт до приёма (замечание владельца 25.10.2026): движок считает больного вошедшим к
 * своему часу, а фигура ещё встаёт с кушетки или пропускает встречных в двери. Не дошла и за это время — застряла: карта всё
 * равно открывается.
 */
const REACH_WAIT = 300;

/** Уровень медицины из адреса (`?level=`); нет — «Студент» (spec «Сложность»). */
function levelOfUrl(): Difficulty {
  const v = typeof location !== 'undefined' ? new URLSearchParams(location.search).get('level') : null;
  return LEVELS.find(x => x === v) ?? DEFAULT_LEVEL;
}

export class Doctor {
  hud: DoctorHud = { ...initialDoctor, level: levelOfUrl() };
  /** скорость до того, как своя карта остановила часы: закрыли — она же; null — часы не держит */
  private before: Speed | null = null;
  /** чья карта держит часы */
  private heldId: string | undefined;
  /** скорость до автопаузы на просьбу или результаты: ответили или позвали — она же; поменяли скорость сами — забыта */
  private stopped: Speed | null = null;
  /** собирать «За это время»: идёт действие карты */
  private collecting = false;
  /** где стоит фигура врача — номер помещения плана; -1 — фигуры нет */
  private figureAt = -1;
  /** движок сказал «вошёл», а фигура ещё идёт: карта — когда она войдёт (`frame`), не позже `until` по часам игры */
  private reaching: { id: string; until: number } | undefined;
  /** «Взять случай» отправлен: больной у вас — карта; в вашей очереди — сказать об этом */
  private taking: string | undefined;
  /** «Открыть карту» отправлено: карты нет — сказать (карта ушедшего хранится сутки, spec 2026-10-discharged-card) */
  private opening: string | undefined;
  /** подсказки по роли (spec docs/specs/2026-10-two-ways.md, F4): вы уже звали больного, отвечали на решение врача */
  called = false;
  answered = false;

  constructor(private g: Game) {}

  /** Открыта ли карта пациента. */
  get open(): boolean {
    return this.hud.card !== undefined;
  }

  /** Держит ли часы своя карта: пациент перед вами — скорость не меняется, пока карта открыта. */
  get holding(): boolean {
    return this.before !== null;
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
      const st = s.doctor;
      this.hud.state = st;
      if (st.current) this.called = true;
      // кого позвать после разбора — только свободному: тот же объект, пока список тот же
      const next = st.current ? undefined : (st.yours[0] ?? st.others[0]);
      if (next?.id !== this.hud.next?.id || next?.who !== this.hud.next?.who) this.hud.next = next ? { id: next.id, who: next.who } : undefined;
      this.placeFigure();
      if (this.taking && st.current?.id === this.taking) {
        // позвали или взяли — идёт к вам: часы идут, автопаузу игры — снять (spec 2026-10-owner-play-2)
        this.say(true, st.current.coming !== undefined ? T.doctor.notices.coming(st.current.who) : T.doctor.notices.taken(st.current.who));
        if (st.current.coming !== undefined) this.unstop();
        this.taking = undefined;
      } else if (this.taking) {
        const queued = st.yours.find(r => r.id === this.taking);
        if (queued && st.current) {
          this.say(true, T.doctor.queued(queued.who));
          this.taking = undefined;
        }
      }
    }
    if (s.card !== undefined) {
      if (s.card) this.hud.card = s.card;
      else delete this.hud.card;
      if (this.opening !== undefined && (!s.card || s.card.id === this.opening)) {
        if (!s.card) this.say(false, T.doctor.noCard);
        this.opening = undefined;
      }
      this.settle();
    }
    if (s.refused) {
      this.say(false, T.doctor.refused[s.refused.why] ?? s.refused.why);
      this.taking = undefined;
    }
    for (const n of s.notices) this.notice(n);
  }

  /**
   * Часы и своя карта (spec 2026-10-owner-play-2): ваш пациент перед вами и приём идёт — стоят; открыли чужую — идут; своя
   * перестала быть приёмом — разбор читают до «Закрыть», а отпустили или вышли к срочному — карта закрывается.
   */
  private settle() {
    const c = this.hud.card;
    if (c?.active) {
      if (!this.holding) this.hold(c.id);
      return;
    }
    if (!this.holding) return;
    if (c && c.id === this.heldId) {
      if (c.decision) return;
      delete this.hud.card;
      this.view(null);
    }
    this.release();
  }

  /**
   * Извещение движка: ваш пациент вошёл — его карта и пауза; автопауза на просьбу и результаты ваших; «За это время», пока
   * идёт действие карты.
   */
  private notice(n: Notice) {
    if (this.holding && this.collecting) {
      const line = this.meanwhileText(n);
      if (line) this.hud.meanwhile = [...this.hud.meanwhile, line];
    }
    // «стало хуже» (spec docs/specs/2026-10-economy.md, «Обход»): строки обхода отмечены до следующей планёрки
    if (n.kind === 'morning') this.hud.worse = [];
    if (n.kind === 'worse') this.hud.worse = [...(this.hud.worse ?? []), n.id];
    // вошёл к вам, вернулся с обследования (spec 2026-10-owner-play-2): решать — вам; карта и пауза всегда — вы его звали
    if (n.kind === 'reached') return this.own(n.id);
    if (!this.hud.autopause || this.holding) return;
    if (n.kind === 'consult') {
      this.stop();
      this.g.store.set({ tab: 'asks' });
    } else if (n.kind === 'resultsReady') {
      // у вас в кабинете — его карта и пауза; ушёл на снимок — карта, когда вернётся; отпущенный ждать — пауза и строка
      const cur = this.hud.state?.current;
      if (cur?.id !== n.id) this.stop();
      else if (cur.coming === undefined && (cur.back === undefined || cur.back <= this.g.t)) this.own(n.id);
    } else if (n.kind === 'worse') {
      // автопауза и окно врача раскрыто: обход — в нём
      this.stop();
      this.hud.folded = false;
    }
  }

  /**
   * Карта вашего пациента — когда он перед вами (замечание владельца 25.10.2026: карта открывалась, пока больной ещё шёл по
   * коридору, и пауза останавливала его за дверью): фигура ещё идёт — карта в `frame`, когда войдёт. Часы встанут, когда
   * карта придёт (`settle`).
   */
  private own(id: string) {
    if (this.hud.card?.id === id && this.hud.card.active) return;
    if (!this.arrived(id)) {
      this.reaching = { id, until: this.g.t + REACH_WAIT };
      return;
    }
    this.reaching = undefined;
    this.view(id);
  }

  /** Каждый кадр: фигура дошла до приёма — его карта; не дошла к сроку — тоже; больной уже не ваш — ждать нечего. */
  frame() {
    const r = this.reaching;
    if (!r) return;
    if (this.hud.state?.current?.id !== r.id) {
      this.reaching = undefined;
      return;
    }
    if (!this.arrived(r.id) && this.g.t < r.until) return;
    this.reaching = undefined;
    this.view(r.id);
  }

  /**
   * Дошёл ли до приёма тот, кто идёт: ваш больной — его фигура в помещении, где вы принимаете (`at`), и уже не идёт; к
   * привезённому скорой идёте вы — и ваша фигура там же. Фигуры на карте нет — не ждать её.
   */
  private arrived(id: string): boolean {
    const at = this.hud.state?.at;
    const room = at ? this.g.plan.rooms.find(r => r.id === at) : undefined;
    if (!room) return true;
    const here = (key: string | undefined) => {
      const w = key ? this.g.crowd.walkers.get(key) : undefined;
      if (!w || w.leaving) return true;
      const inside = w.x >= room.x && w.x <= room.x + room.w && w.z >= room.y && w.z <= room.y + room.h;
      return inside && w.goals.length === 0 && w.state !== 'walk';
    };
    return here(this.g.pop.keyOf(id)) && here(YOU);
  }

  /** Автопауза игры: скорость запомнить — снимется, когда ответите или позовёте. */
  private stop() {
    if (this.g.speed > 0) this.stopped = this.g.speed;
    this.g.setSpeed(0);
  }

  /** Снять автопаузу игры: часы — с прежней скоростью, если вы их с тех пор не трогали. */
  private unstop() {
    if (this.stopped !== null && this.g.speed === 0 && !this.g.ff) this.g.setSpeed(this.stopped);
    this.stopped = null;
  }

  /** Скорость поменяли сами: автопаузу игры больше не снимать. */
  manualSpeed() {
    this.stopped = null;
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
      case 'worse':
        return this.worseText(n.id);
      default:
        return undefined;
    }
  }

  /** Строка журнала о просьбе: кто просит. */
  consultText(n: Extract<Notice, { kind: 'consult' }>): string {
    const m = this.g.staff.find(x => x.id === n.by);
    return T.doctor.notices.consult(m ? named(this.g.db.roles[m.role]?.name, m.role) : '');
  }

  /**
   * Верхнее решение на утверждении (spec docs/specs/2026-10-two-ways.md, F3): Enter — «Согласен», Shift+Enter — его карта.
   * Карта открыта — клавиша её не трогает.
   */
  top(card: boolean) {
    const x = this.hud.state?.decisions[0];
    if (!x || this.open) return;
    if (card) this.dispatch({ kind: 'open', id: x.id });
    else this.dispatch({ kind: 'approve', id: x.id, answer: 'agree' });
  }

  /** Строка журнала: решение нанятого врача ждёт вашего ответа (spec 2026-10-two-ways, F3). */
  approveText(n: Extract<Notice, { kind: 'approve' }>): string {
    const m = this.g.staff.find(x => x.id === n.by);
    return T.doctor.notices.approve(m ? named(this.g.db.roles[m.role]?.name, m.role) : '');
  }

  /** Строка журнала: вашему лежащему стало хуже (spec 2026-10-economy). */
  worseText(id: string): string {
    const row = this.hud.state?.ward.find(r => r.id === id);
    return T.round.worse(row?.who ?? id);
  }

  /** Строка журнала: ваш пациент вошёл к вам или вернулся с обследования (spec 2026-10-owner-play-2). */
  reachedText(id: string): string {
    const who = this.hud.state?.current?.id === id ? this.hud.state.current.who : undefined;
    return who ? T.doctor.notices.reached(who) : T.doctor.notices.reachedSomeone;
  }

  /**
   * Роль (spec docs/specs/2026-10-two-ways.md, F4; решение владельца #67): ставит разом «Мой кабинет», «Свои больные», галочки
   * «О чём спрашивать главврача» и автопаузу; окно врача у «Управляющего» свёрнуто. На старте больница уже построена под роль
   * (`startFor` в src/app/roles.ts): потоку — только галочки, если они не по умолчанию. В игре: «Врачу» — первый кабинет врача,
   * если своего нет (врач того кабинета — в резерв); «Главврачу» и «Управляющему» — «Не принимаю», в бывший кабинет — врач из
   * резерва, и без «Своих больных».
   */
  setRole(role: Role, start = false) {
    const set = ROLE_SETS[role];
    const client = this.g.client;
    this.hud.role = role;
    this.hud.autopause = set.autopause;
    this.hud.folded = set.folded;
    const asks = [...set.asks];
    if (!start || asks.length !== DEFAULT_ASKS.length || asks.some(x => !DEFAULT_ASKS.includes(x))) client.command({ kind: 'asks', rules: asks });
    if (start) return;
    const st = this.hud.state;
    const site = this.g.hospital.site;
    let office = false;
    if (!set.office) {
      if (st?.office) {
        client.command({ kind: 'site', cmd: { kind: 'office' } });
        // в бывший ваш кабинет — врачи из резерва, если они есть (ушли туда, когда кабинет стал вашим), по одному на смену:
        // кабинет не пустует; нового не нанимаем — это решение игрока. У вас пациент — «Не принимаю» нельзя, и их не зовём
        const stand = standInOf(this.g.db, DOCTOR);
        const shifts = new Set(this.g.staff.filter(m => m.room === undefined && m.role === stand).map(m => m.shift ?? 'day'));
        if (!st.current) for (const shift of shifts) client.command({ kind: 'site', cmd: { kind: 'hire', room: st.office, role: DOCTOR, shift } });
        office = true;
      }
      if (st?.mine.length) client.command({ kind: 'mine', systems: [] });
    } else if (!st?.office && site) {
      const room = firstOffice(site);
      if (room) {
        client.command({ kind: 'site', cmd: { kind: 'office', room } });
        office = true;
      }
    }
    // ответ на «Мой кабинет» и «Не принимаю» скажет сам (`onOffice`)
    if (!office) this.say(true, T.doctor.role.done(T.doctor.role.name[role]));
    this.g.refresh();
  }

  /**
   * Роль из сохранения: только из списка; галочки, кабинет и автопауза уже в сохранении — их не трогать; свёрнуто ли окно
   * врача, в сохранении нет — по роли.
   */
  restoreRole(role: unknown) {
    const r = roleOf(role);
    if (!r) return;
    this.hud.role = r;
    this.hud.folded = ROLE_SETS[r].folded;
  }

  /** Уровень медицины из сохранения (spec 2026-10-saves): только из списка уровней. */
  restoreLevel(level: string) {
    const l = LEVELS.find(x => x === level);
    if (l) this.hud.level = l;
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

  // ---------------------------------------------------------------- своя карта: часы стоят

  private hold(id: string) {
    this.before = this.g.ff ? 1 : this.g.speed;
    this.heldId = id;
    this.g.ff = false;
    this.g.speed = 0;
    this.hud.meanwhile = [];
  }

  private release() {
    if (this.before === null) return;
    const back = this.before;
    this.before = null;
    this.heldId = undefined;
    this.collecting = false;
    this.g.speed = back;
  }

  /** Закрыть карту (Esc, «Закрыть»): поток больше не шлёт её вид; держала часы — идут с прежней скоростью. */
  close(): boolean {
    if (!this.open) return false;
    delete this.hud.card;
    this.release();
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
        delete this.hud.said;
        this.opening = a.id;
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
        const cmds = a.kind === 'act' ? [a.cmd] : a.cmds;
        for (const cmd of cmds) client.doctor({ kind: 'case', id, cmd });
        // «Ждать» (spec 2026-10-owner-play-2): решать пока нечего — карта закрывается, часы идут; вернётся или будет готово
        // — карта и пауза
        if (cmds.some(c => c.kind === 'waitResults')) {
          this.close();
          return;
        }
        break;
      }
      case 'consult':
        client.command({ kind: 'consult', id: a.id, answer: a.answer, ...(a.to ? { to: a.to } : {}) });
        // ответили на просьбу — автопаузу игры снять
        this.unstop();
        break;
      // «Главврач утверждает» (spec docs/specs/2026-10-two-ways.md, F3): «Взять» — как «Взять случай»: поток проверит
      // кабинет и скажет, что вышло
      case 'approve':
        this.answered = true;
        if (a.answer === 'take') {
          delete this.hud.said;
          this.taking = a.id;
          client.doctor({ kind: 'take', id: a.id });
        } else client.command({ kind: 'approve', id: a.id, answer: a.answer, ...(a.to ? { to: a.to } : {}) });
        break;
      case 'agreeAll':
        this.answered = true;
        for (const d of this.hud.state?.decisions ?? []) if (d.p !== undefined && d.p >= AGREE_ALL) client.command({ kind: 'approve', id: d.id, answer: 'agree' });
        break;
      case 'order':
        this.answered = true;
        for (const exam of a.exams) client.command({ kind: 'order', id: a.id, exam });
        break;
      case 'role':
        // сценарий кампании — в роли «Врач», без смены (решение владельца #115)
        if (this.g.scenario.view) return;
        this.setRole(a.role);
        return;
      case 'asks':
        client.command({ kind: 'asks', rules: a.rules });
        break;
      case 'mine':
        client.command({ kind: 'mine', systems: a.systems as BodySystem[] });
        break;
      case 'mineOpen':
        this.hud.mineOpen = a.open;
        break;
      case 'theirsOpen':
        this.hud.theirsOpen = a.open;
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
      case 'replan':
        client.command({ kind: 'replan', id: a.id, treatments: a.treatments });
        break;
      case 'fold':
        this.hud.folded = a.folded;
        break;
      case 'next': {
        const next = this.hud.state?.yours[0];
        if (next) {
          this.taking = next.id;
          client.doctor({ kind: 'take', id: next.id });
        }
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
