// Поток расчёта (spec docs/specs/2026-10-engine-speed.md, «Поток расчёта»; docs/specs/2026-10-shell-3d.md): разбирает
// сообщения `ToSim` и отвечает `FromSim`. Без привязки к виду потока: Web Worker окна Electron (src/sim/worker.ts),
// `worker_threads` Node/Bun в тестах — у каждого своя тонкая обёртка. Движок однопоточный и детерминированный: тот же
// порядок сообщений даёт то же состояние, что и в основном потоке. Срез упаковывается (pack.ts). Путь пациента, которого
// показывает окно (`watch`, spec docs/specs/2026-10-flow-ui.md), — в срезе, когда он изменился.
import type { ContentDb } from '../content/types';
import { onlyDeptsChanged } from '../engine/hospital/departments';
import { apply, catchUp, crewList, lateOf, newFlowShift, prepareFinish } from '../engine/shift/engine';
import { crewOf, type CrewView } from '../engine/shift/crew';
import { moodsOf, type MoodView } from '../engine/shift/mood';
import { sliceOf } from '../engine/shift/slice';
import type { Command, Notice, Ride, Round, ShiftState } from '../engine/shift/types';
import { scenarioKey, scenarioView, type ScenarioView } from './campaign';
import { patientName } from './caseView';
import { comingAt, DoctorDesk, officeOf, takeCommand } from './doctor';
import { type Leg, legsOf } from './legs';
import { Handles, packSlice } from './pack';
import { challengeEnd, type ChallengeEnd, challengeEndAt, unindicatedOf } from './challenge';
import { dailyCaseSeed, type DailyEnd } from './daily';
import { type DeviceView, repairsView } from './repairs';
import { seasonOfDay } from './days';
import { MetDesk } from './met';
import { shiftEnd, type ShiftEnd, shiftEndOf } from './shift';
import { type DoctorOut, type FromSim, LEGS_EVERY, type PathView, ROOMS_DAYS, type RoomsMoney, type ToSim, type World } from './protocol';

/** Счёт до `ms` от сейчас; одно событие — всегда (как `budget` в session.ts «Анамнеза»). */
function budget(ms: number): () => boolean {
  const end = performance.now() + ms;
  let first = true;
  return () => {
    if (first) {
      first = false;
      return true;
    }
    return performance.now() <= end;
  };
}

export interface SimHost {
  handle(msg: ToSim): FromSim;
}

/**
 * До какой минуты идут часы игры: у испытания — до его конца (spec docs/specs/2026-11-challenges.md, `challengeEndAt`), у смены
 * врача — до 20:00 (spec docs/specs/2026-11-doctor-shift.md, `shiftEndOf`); у случая дня и всех прочих — без конца.
 */
function endOfIn(db: ContentDb, s: ShiftState): number | undefined {
  const c = s.meta.challenge ? db.challenges?.[s.meta.challenge] : undefined;
  if (c) return challengeEndAt(c);
  return s.meta.solo && s.meta.daily === undefined ? shiftEndOf(db) : undefined;
}

export function createSim(db: ContentDb): SimHost {
  let s: ShiftState | undefined;
  /** игровые секунды, которые часы игры уже прошли, а движок ещё не начал */
  let owed = 0;
  const handles = new Handles();
  // номера помещений и штата в срезе — по спискам больницы; меняются вместе с ними
  let shown: { hospital: ShiftState['hospital']; staff: ShiftState['staff'] } = { hospital: undefined, staff: undefined };
  /** список сломанных аппаратов, который окно уже получило; null — ещё никакого */
  let sentBroken: unknown = null;
  /** кто из ушедших со сменой ещё в больнице — как окно уже получило (номера в списке штата через запятую) */
  let sentLate = '';
  /** усталость и перерывы врачей в смене — как окно уже получило */
  let sentCrew = '';
  /** настроение нанятых со сменой (spec docs/specs/2026-10-staff-mood.md) — как окно уже получило */
  let sentMoods = '';
  /** перевозки на каталке (spec docs/specs/2026-10-orderlies.md) — как окно уже получило */
  let sentRides = '';
  let sentRounds = '';
  let sentRepairs = '';
  /** деньги по помещениям (spec docs/specs/2026-10-metrics-layer.md, часть 2): какими окно их уже получило */
  let sentMoney = '';
  let sentDays = -1;
  /** ход сценария (spec docs/specs/2026-10-scenario-1.md): по чему он посчитан и каким окно его уже получило */
  let scenarioAt: unknown[] = [];
  let sentScenario = '';
  /** смена врача (spec docs/specs/2026-11-doctor-shift.md): итог уже ушёл окну */
  let sentShift = false;
  let sentDaily = false;
  /** испытание (spec docs/specs/2026-11-challenges.md, часть 2): итог уже ушёл окну; «Без показаний» — по чему посчитано и каким ушло */
  let sentChallenge = false;
  let auditAt = -1;
  let sentAudit = -1;
  /** чей путь показывает окно и каким он был отправлен */
  let watch: string | null = null;
  let sentPath: string | undefined;
  /** слой «Пути пациентов» (spec docs/specs/2026-10-layers.md, часть 2): включён ли, когда посчитаны переходы и какими отправлены */
  let legsOn = false;
  let legsAt = -Infinity;
  let sentLegs = '';
  let rooms = new Map<string, number>();
  let staff = new Map<string, number>();
  // режим врача (spec docs/specs/2026-10-doctor-mode.md): что окно уже получило — состояние врача и вид карты
  const desk = new DoctorDesk(db);
  /** встреченные болезни (spec docs/specs/2026-11-sandbox.md, часть 2б): какие уже ушли окну */
  const metDesk = new MetDesk();
  const endOf = (x: ShiftState) => endOfIn(db, x);
  const slice = (notices: Notice[], refused?: DoctorOut['refused']): FromSim => {
    let world: World | undefined;
    if (s!.hospital !== shown.hospital || s!.staff !== shown.staff) {
      // отметки отделений (spec docs/specs/2026-10-departments.md, часть 2) — та же сцена: меняются полосы, слой и подписи
      const was = shown.hospital?.site;
      const now = s!.hospital?.site;
      const staffOnly = s!.hospital === shown.hospital || (!!was && !!now && onlyDeptsChanged(was, now));
      shown = { hospital: s!.hospital, staff: s!.staff };
      rooms = new Map((s!.hospital?.rooms ?? []).map((r, i) => [r.id, i]));
      staff = new Map((s!.staff ?? []).map((m, i) => [m.id, i]));
      if (s!.hospital) {
        world = {
          hospital: s!.hospital, staff: s!.staff ?? [], ...(s!.works ? { works: { spent: s!.works.spent, undo: s!.works.undo.length } } : {}),
          ...(staffOnly ? { staffOnly: true as const } : {}),
        };
      }
    }
    // сломанные аппараты — отдельно от больницы: новый список в 08:00 не пересобирает сцену окна
    let broken: string[] | undefined;
    if (s!.broken !== sentBroken) {
      sentBroken = s!.broken;
      broken = [...(s!.broken ?? [])];
    }
    // путь, который показывает окно: шагов стало больше, путь кончился, его убрали — заново
    let path: PathView | undefined;
    if (watch !== null) {
      const j = s!.journeys?.of[watch] ?? null;
      const sig = j ? `${j.steps.length}:${j.end?.t ?? ''}:${j.steps[j.steps.length - 1]?.t ?? ''}:${j.bed?.t ?? ''}:${j.bed?.pick ?? ''}` : '';
      if (sig !== sentPath) {
        sentPath = sig;
        path = { id: watch, journey: j ? structuredClone(j) : null };
      }
    }
    // смены (spec docs/specs/2026-10-staff-shifts.md): кто не в смене, а доводит приёмы — на карте он ещё на месте; список
    // изменился или штат стал другим (номера в нём — по новому списку) — заново
    let late: number[] | undefined;
    const lateNow = s!.flow ? lateOf(db, s!).flatMap(m => staff.get(m.id) ?? []) : [];
    if (lateNow.join() !== sentLate || world) {
      sentLate = lateNow.join();
      late = lateNow;
    }
    // усталость и перерывы (spec docs/specs/2026-10-staff-shifts.md, часть 2): врачи в смене — очки и перерыв; изменились или
    // больница стала другой — заново
    let crew: CrewView[] | undefined;
    const crewNow = s!.flow ? crewOf(db, s!, crewList(db, s!)) : [];
    const crewSig = JSON.stringify(crewNow);
    if (crewSig !== sentCrew || world) {
      sentCrew = crewSig;
      crew = crewNow;
    }
    // настроение (spec docs/specs/2026-10-staff-mood.md): меняется на планёрке и от действий с людьми — тогда и заново
    let moods: MoodView[] | undefined;
    const moodsNow = s!.flow ? moodsOf(db, s!) : [];
    const moodSig = JSON.stringify(moodsNow);
    if (moodSig !== sentMoods || world) {
      sentMoods = moodSig;
      moods = moodsNow;
    }
    // перевозки на каталке (spec docs/specs/2026-10-orderlies.md): записываются и кончаются событиями — тогда и заново
    let rides: Ride[] | undefined;
    const ridesNow = s!.flow ? (s!.rides ?? []) : [];
    const rideSig = JSON.stringify(ridesNow);
    if (rideSig !== sentRides || world) {
      sentRides = rideSig;
      rides = structuredClone(ridesNow);
    }
    // утренний обход (spec docs/specs/2026-10-staff-motion.md, часть 2): начинается и кончается событиями — тогда и заново
    let rounds: Round[] | undefined;
    const roundsNow = s!.flow ? (s!.rounds?.on ?? []) : [];
    const roundSig = JSON.stringify(roundsNow);
    if (roundSig !== sentRounds || world) {
      sentRounds = roundSig;
      rounds = structuredClone(roundsNow);
    }
    // техники и поломки в работе (spec docs/specs/2026-11-technicians.md, часть 2): аппараты — когда изменились
    let repairs: DeviceView[] | undefined;
    const repairsNow = repairsView(db, s!) ?? [];
    const repairSig = JSON.stringify(repairsNow);
    if (repairSig !== sentRepairs || world) {
      sentRepairs = repairSig;
      repairs = repairsNow;
    }
    // сценарий (spec docs/specs/2026-10-scenario-1.md): письма, цели и отметки — когда изменились; не сценарий — ничего
    let scenario: ScenarioView | undefined;
    const key = scenarioKey(s!);
    if (key.some((x, i) => x !== scenarioAt[i])) {
      scenarioAt = key;
      const now = scenarioView(db, s!);
      const sig = JSON.stringify(now ?? null);
      if (now && sig !== sentScenario) {
        sentScenario = sig;
        scenario = now;
      }
    }
    // смена врача (spec docs/specs/2026-11-doctor-shift.md): дошли до 20:00 — итог, один раз; у испытания врача — свой конец
    let shift: ShiftEnd | undefined;
    if (s!.meta.solo && s!.meta.daily === undefined && s!.meta.challenge === undefined && !sentShift && s!.until === undefined && s!.t >= shiftEndOf(db)) {
      sentShift = true;
      shift = shiftEnd(s!);
    }
    // испытание (spec docs/specs/2026-11-challenges.md, часть 2): дошли до его конца — итог, один раз
    let challenge: ChallengeEnd | undefined;
    const ch = s!.meta.challenge ? db.challenges?.[s!.meta.challenge] : undefined;
    if (ch && !sentChallenge && s!.until === undefined && s!.t >= challengeEndAt(ch)) {
      sentChallenge = true;
      challenge = challengeEnd(db, s!);
    }
    // «Только по показаниям»: обследований без показаний у ваших закрытых приёмов — когда закрытых стало больше
    let audit: { n: number; max: number } | undefined;
    if (ch?.unindicated !== undefined) {
      const closed = Object.values(s!.patients).filter(p => p.closed && !p.closed.by).length + (s!.past?.length ?? 0);
      if (closed !== auditAt) {
        auditAt = closed;
        const n = unindicatedOf(db, s!);
        if (n !== sentAudit) {
          sentAudit = n;
          audit = { n, max: ch.unindicated };
        }
      }
    }
    // случай дня (часть 3): приём больного дня закрыт — итог, один раз
    let daily: DailyEnd | undefined;
    if (s!.meta.daily !== undefined && !sentDaily) {
      const p = Object.values(s!.patients).find(x => x.daily && x.closed && !x.closed.by);
      if (p) {
        sentDaily = true;
        daily = { id: p.id, verdict: p.closed!.verdict, grade: p.closed!.grades.overall };
      }
    }
    // деньги по помещениям (часть 2 слоя «Показатели»): сегодня — когда сдвинулись; прошедшие сутки — когда их прибавилось
    let money: RoomsMoney | undefined;
    if (s!.flow && s!.hospital?.site) {
      const now = s!.summary.rooms ?? {};
      let income = 0;
      let expenses = 0;
      for (const r of Object.values(now)) {
        income += r.income;
        expenses += r.expenses;
      }
      const sig = `${s!.day}:${Object.keys(now).length}:${income}:${expenses}`;
      const days = s!.history.length !== sentDays;
      if (sig !== sentMoney || days) {
        sentMoney = sig;
        money = { now: structuredClone(now) };
        if (days) {
          sentDays = s!.history.length;
          money.days = s!.history.slice(-ROOMS_DAYS).flatMap(d => (d.rooms ? [{ day: d.day, rooms: structuredClone(d.rooms) }] : []));
        }
      }
    }
    // переходы за сутки — пока слой «Пути пациентов» включён: сразу, потом раз в десять игровых минут или после стройки
    let legs: Leg[] | undefined;
    if (legsOn && s!.flow && (s!.t - legsAt >= LEGS_EVERY || world)) {
      legsAt = s!.t;
      const now = legsOf(s!, officeOf(db, s!));
      const sig = JSON.stringify(now);
      if (sig !== sentLegs) {
        sentLegs = sig;
        legs = now;
      }
    }
    // встреченные болезни (spec docs/specs/2026-11-sandbox.md, часть 2б): у сценария кампании — новые главные болезни закрытых
    const met = metDesk.out(db, s!);
    const lag = owed + (s!.until !== undefined ? s!.until - s!.t : 0);
    const { buf, names } = packSlice(s!, sliceOf(s!, officeOf(db, s!)), lag, handles, rooms, staff, patientName);
    return { kind: 'slice', buf, names, notices, lag, ...(world ? { world } : {}), ...(path ? { path } : {}), ...(broken ? { broken } : {}), ...(late ? { late } : {}), ...(crew ? { crew } : {}), ...(moods ? { moods } : {}), ...(rides ? { rides } : {}), ...(rounds ? { rounds } : {}), ...(repairs ? { repairs } : {}), ...(scenario ? { scenario } : {}), ...(money ? { money } : {}), ...(legs ? { legs } : {}), ...(shift ? { shift } : {}), ...(daily ? { daily } : {}), ...(challenge ? { challenge } : {}), ...(audit ? { audit } : {}), ...(met ? { met } : {}), ...desk.out(s!), ...(refused ? { refused } : {}) };
  };
  const fresh = () => {
    owed = 0;
    handles.reset();
    shown = { hospital: undefined, staff: undefined };
    sentBroken = null;
    sentLate = '';
    sentCrew = '';
    sentMoods = '';
    sentRides = '';
    sentRounds = '';
    sentRepairs = '';
    sentMoney = '';
    sentDays = -1;
    scenarioAt = [];
    sentScenario = '';
    sentShift = false;
    sentDaily = false;
    sentChallenge = false;
    auditAt = -1;
    sentAudit = -1;
    sentPath = undefined;
    legsAt = -Infinity;
    sentLegs = '';
    desk.reset();
    metDesk.reset();
  };
  /** Дожить время, которое часы игры уже прошли: команда видит больницу такой, как игрок. */
  const settle = (): Notice[] => {
    const before = owed > 0 ? apply(db, s!, { kind: 'advance', seconds: owed }) : [];
    owed = 0;
    return before;
  };
  /** Команда сначала доживает прошедшее время — как в игре; извещения этого времени — тоже в ответ. */
  const run = (cmd: Command): Notice[] => [...settle(), ...apply(db, s!, cmd)];
  return {
    handle(msg) {
      try {
        switch (msg.kind) {
          case 'start':
            s = newFlowShift(db, {
              seed: msg.seed, season: msg.season, hospital: msg.hospital, staff: msg.staff, flow: msg.flow, ...(msg.economy ? { economy: msg.economy } : {}),
              ...(msg.scenario ? { scenario: msg.scenario } : {}),
              ...(msg.manage ? { manage: msg.manage } : {}),
              ...(msg.soft ? { soft: true } : {}),
              ...(msg.solo ? { solo: true } : {}),
              // случай дня (spec docs/specs/2026-11-doctor-shift.md, часть 3): подбор — здесь, в потоке расчёта; принимаете только вы
              ...(msg.daily ? { daily: dailyCaseSeed(db, msg.daily), solo: true, season: seasonOfDay(msg.daily) } : {}),
              // испытание (spec docs/specs/2026-11-challenges.md, часть 2): поток, касса и «вы один» — из записи
              ...(msg.challenge ? { challenge: msg.challenge } : {}),
              // песочница «только встреченные в кампании» (spec docs/specs/2026-11-sandbox.md, часть 2б)
              ...(msg.only && msg.only.length > 0 ? { only: msg.only } : {}),
            });
            fresh();
            // начало испытания позже 08:00 — «Одна ночь» с 20:00: часы сразу идут до него, больных до него нет
            {
              const c = s.meta.challenge ? db.challenges?.[s.meta.challenge] : undefined;
              if (c && c.from * 3600 > s.t) apply(db, s, { kind: 'advance', seconds: c.from * 3600 - s.t });
            }
            return slice([]);
          case 'load':
            s = msg.state;
            fresh();
            return slice([]);
          case 'command':
            if (!s) return { kind: 'error', message: 'нет смены' };
            // команда сначала доживает прошедшее время — как в игре: состояние то же, что без отставания; извещения этого
            // времени — тоже в ответ: по ним автопауза («Просят посмотреть», spec 2026-10-consults)
            return slice(run(msg.cmd));
          case 'doctor': {
            if (!s) return { kind: 'error', message: 'нет смены' };
            const act = msg.act;
            if (act.kind === 'view') {
              desk.view(act.open, act.lang, act.level);
              return slice([]);
            }
            // сначала — прожитое часами игры: решать, что значит «Взять», и действовать — по больнице на этот час
            const before = settle();
            if (act.kind === 'take') {
              // «Взять случай» — одна команда движка по состоянию больного (doctor.ts, takeCommand)
              const t = takeCommand(db, s, act.id);
              if (t.refused) return slice(before, { act: 'take', id: act.id, why: t.refused });
              const notices = t.cmd ? [...before, ...apply(db, s, t.cmd)] : before;
              // позвали — карта не открывается, пока он идёт к вам (spec 2026-10-owner-play-2): окно откроет её на «вошёл к вам»
              if (!t.cmd || (s.current === act.id && comingAt(s) === undefined)) desk.focus = act.id;
              // идёт к вам: открытая карта закрывается — часы идут
              else if (s.current === act.id) desk.focus = null;
              return slice(notices);
            }
            // действие в карте — только с тем, кто у вас в кабинете: окно и поток могли разойтись на кадр
            if (s.current !== act.id) return slice(before, { act: 'case', id: act.id, why: 'notInOffice' });
            if (comingAt(s) !== undefined) return slice(before, { act: 'case', id: act.id, why: 'coming' });
            return slice([...before, ...apply(db, s, act.cmd)]);
          }
          case 'tick': {
            if (!s) return { kind: 'error', message: 'нет смены' };
            owed += msg.seconds;
            // смена врача (spec docs/specs/2026-11-doctor-shift.md) и испытание (spec docs/specs/2026-11-challenges.md): часы —
            // не дальше их конца; начатое действие доживает своё
            {
              const end = endOf(s);
              if (end !== undefined) owed = Math.max(0, Math.min(owed, end - Math.max(s.t, s.until ?? s.t)));
            }
            const more = budget(msg.budgetMs);
            const notices: Notice[] = [];
            if (s.until !== undefined) notices.push(...catchUp(db, s, more));
            if (s.until === undefined && owed > 0) {
              const seconds = owed;
              owed = 0;
              notices.push(...apply(db, s, { kind: 'advance', seconds }, more));
            }
            // карта открыта, часы стоят: разбор вашего приёма — заранее, в свободном бюджете кадра (spec 2026-10-doctor-mode)
            if (s.until === undefined && owed === 0 && desk.focus !== null && desk.focus === s.current && more()) prepareFinish(db, s, more);
            return slice(notices);
          }
          case 'watch':
            watch = msg.id;
            sentPath = undefined;
            if (!s) return { kind: 'error', message: 'нет смены' };
            return slice([]);
          case 'legs':
            legsOn = msg.on;
            legsAt = -Infinity;
            sentLegs = '';
            if (!s) return { kind: 'error', message: 'нет смены' };
            return slice([]);
          case 'pack':
            // файл сохранения сжимается асинхронно — это делает обёртка потока (worker.ts), а не разбор сообщений
            return { kind: 'packFailed', message: 'pack: only in the worker' };
          case 'save':
            if (!s) return { kind: 'error', message: 'нет смены' };
            // сохранение — всё прожитое: недожитое время сначала доживается
            if (s.until !== undefined) catchUp(db, s);
            return { kind: 'state', state: s };
        }
      } catch (e) {
        return { kind: 'error', message: e instanceof Error ? e.message : String(e) };
      }
    },
  };
}
