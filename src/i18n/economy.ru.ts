// Строки части 5б по-русски (spec docs/specs/2026-10-economy.md): касса и репутация в верхней полосе, экран планёрки и
// вкладка «Отчёты», часы приёма, кредит, обход ваших лежащих. Слова кассы, репутации и обхода — как в «Анамнезе» (его
// src/i18n/sections/sandbox.ts и shift.ts @ 89965a5, разделы «касса, репутация» и «обход»). Английский — economy.en.ts.
import { lowerFirst } from './case';
import { pluralRu } from './plural';

/** Минуты: «45 мин», «1 ч 20 мин». */
const dur = (min: number) => (min >= 60 ? `${Math.floor(min / 60)} ч${min % 60 ? ` ${min % 60} мин` : ''}` : `${min} мин`);

export const economyRu = {
  /** касса в верхней полосе и в стройке */
  money: {
    cash: 'Касса',
    today: (delta: string) => `${delta} за сутки`,
    cashHint: (limit: string) =>
      `Касса сейчас и её изменение с планёрки 08:00. Стройка оплачивается из кассы; в минус — до ${limit}, на долг каждые сутки начисляется процент`,
    below: (limit: string) => `Касса ниже предела ${limit}: стройка ждёт денег, на планёрке банк предложит кредит`,
    reputation: 'Репутация',
    repHint: (score: number | undefined) =>
      score === undefined ? 'Репутация 0–100: каждое утро сдвигается к оценке суток; от неё — поток пациентов (±30 %) и доля ДМС и платных' : `Оценка прошлых суток — ${score} из 100; репутация сдвигается к ней каждое утро`,
    short: (rub: string) => `не хватает ${rub}`,
  },
  /** экран планёрки в 08:00 и вкладка «Отчёты» (геймдизайн §12) */
  meeting: {
    dur,
    title: (day: number) => `Планёрка · сутки ${day} · 08:00`,
    autopause: 'Открывать в 08:00 (автопауза)',
    resume: 'Продолжить',
    reopen: 'Открыть планёрку',
    none: 'Первая планёрка — в 08:00 вторых суток: итог суток, деньги и репутация.',
    day: 'Сутки в цифрах',
    arrived: (n: number, amb: number) => `пришли ${n}${amb > 0 ? ` (скорая — ${amb})` : ''}`,
    seen: (n: number, you: number, hired: number) => `приняты ${n}${you > 0 ? ` (вы — ${you}, нанятые врачи — ${hired})` : ''}`,
    left: (n: number) => `ушли, не дождавшись, — ${n}`,
    /**
     * «Почему?» у цифр планёрки (spec docs/specs/2026-10-why.md): кто пришёл и от чего поток сегодня; почему ушли и что с этим
     * делать
     */
    why: {
      open: 'почему?',
      arrivedHint: (parts: string) => `${parts} — и от чего поток`,
      leftHint: 'Почему ушли и что с этим делать',
      by: { walkIn: 'сами', appointment: 'по записи', ambulance: 'скорая', return: 'повторно' } as Record<string, string>,
      part: (what: string, n: number) => `${what} — ${n}`,
      arrived: (parts: string) => `Пришли: ${parts}.`,
      flow: 'Сколько придёт сегодня — от больницы:',
      /** сами: на кабинет в сутки, репутация и её поправка в процентах, сколько кабинетов сейчас и сколько придёт */
      walk: (per: number, rep: number, pct: number, n: number, day: number) =>
        `сами — от кабинетов терапевтов в смене и от репутации: на кабинет около ${per} в сутки (репутация ${rep}${pct !== 0 ? ` — поток ${pct > 0 ? '+' : '−'}${Math.abs(pct)} %` : ''}); ${n} ${pluralRu(n, 'кабинет', 'кабинета', 'кабинетов')} — около ${day}`,
      noOffice: 'сами — от кабинетов терапевтов в смене: такого кабинета нет — сами не приходят',
      closed: 'сами — больница закрыта: пока её не откроют, сами не придут',
      book: (per: number, n: number, day: number) => `по записи — к специалистам в смене: около ${per} в сутки к каждому; ${n} ${pluralRu(n, 'специалист', 'специалиста', 'специалистов')} — около ${day}`,
      amb: (per: number, n: number, day: number) =>
        `скорая — от мест смотровой приёмного: около ${per} ${pluralRu(per, 'машины', 'машин', 'машин')} в сутки на место; ${n} ${pluralRu(n, 'место', 'места', 'мест')} — около ${day}`,
      ret: 'повторно — кому не помогло лечение: стало хуже, не стало лучше или реакция на лекарство',
      more: 'Больше пришедших сами — ещё кабинет терапевта, выше репутация и дольше часы приёма (внизу планёрки).',
      left: 'Почему ушли, не дождавшись:',
      busy: (n: number) => `Все врачи, кто принял бы их, были заняты — ${n}.`,
      busyFix: 'Нужен ещё врач в эту смену или ещё кабинет.',
      asks: (n: number) => `Из них ${n} — пока врачи ждали вашего ответа «Просят посмотреть»: ждущий ответа врач не зовёт следующего.`,
      none: (n: number) => `В смене не было врача, который принял бы их, — ${n}.`,
      noneFix: 'Наймите врача в эту смену или закройте приём раньше (часы приёма — внизу планёрки).',
      rest: (n: number) => `Их врач ушёл на перерыв — ${n}.`,
      restFix: 'Устал до предела или ушёл в туалет: второй врач в смене делит нагрузку.',
      you: (n: number) => `Ждали вас — ${n}.`,
      youFix: 'Отдайте часть больных нанятым врачам: «Свои больные» в окне врача.',
      other: (n: number) => `Другое — ${n}.`,
      stood: (n: number) => `${n} из ушедших стояли у кабинета — терпения вдвое меньше. Зал ожидания ближе к кабинету или скамьи у дверей.`,
      gone: 'Кто ушёл',
      goneHint: '«Пациенты» → «Ушли»: путь каждого и почему ушёл',
    },
    ward: (admitted: number, discharged: number, transferred: number, died: number, lying: number) =>
      `стационар: поступили ${admitted}, выписаны ${discharged}, переведены ${transferred}${died > 0 ? `, умерли ${died}` : ''}, лежат ${lying}`,
    hired: 'Нанятые врачи',
    hiredRow: (role: string, skill: number, seen: number, correct: number) =>
      `${role}, навык ${skill}: ${seen} ${pluralRu(seen, 'приём', 'приёма', 'приёмов')}${seen > 0 ? `, верно ${correct} %` : ''}`,
    hiredMore: (asked: number, taken: number, unsafe: number, tired = 0, sent = 0) =>
      [
        asked > 0 ? `просил посмотреть — ${asked}` : '', taken > 0 ? `вы забрали — ${taken}` : '', unsafe > 0 ? `решений с замечанием безопасности — ${unsafe}` : '',
        // spec docs/specs/2026-10-staff-shifts.md, часть 2
        tired > 0 ? `диагнозов уставшим — ${tired}` : '',
        // spec docs/specs/2026-10-specialists.md, часть 2
        sent > 0 ? `направил к специалистам — ${sent}` : '',
      ].filter(Boolean).join(', '),
    /** специалист без записи за сутки (spec docs/specs/2026-10-specialists.md) */
    idle: 'к нему никто не записался',
    you: (seen: number, correct: number) => `Вы: ${seen} ${pluralRu(seen, 'приём', 'приёма', 'приёмов')}, верно ${correct}`,
    cash: 'Касса за сутки',
    income: (rub: string) => `Доходы: ${rub}`,
    payers: { oms: 'ОМС', dms: 'ДМС', self: 'платно' } as Record<string, string>,
    payerLine: (payer: string, n: number, rub: string) => `${payer} — ${n} ${pluralRu(n, 'приём', 'приёма', 'приёмов')}: ${rub}`,
    wardLine: (n: number, rub: string) => `стационар — ${n} ${pluralRu(n, 'случай', 'случая', 'случаев')}: ${rub}`,
    audit: (rub: string, why: string) => `Страховая не оплатила ${rub}${why ? `: ${why}` : ''}`,
    auditWhy: (weak: number, unconfirmed: number, unindicated: number) =>
      [
        weak > 0 ? `обоснованность ниже A — ${weak}` : '',
        unconfirmed > 0 ? `без подтверждения диагноза — ${unconfirmed}` : '',
        unindicated > 0 ? `обследований без показаний — ${unindicated}` : '',
      ].filter(Boolean).join(', '),
    level: (pct: number) => `тариф ОМС за приём — ${pct} %`,
    expenses: (rub: string) => `Расходы: ${rub}`,
    expense: {
      salaries: 'зарплаты', rooms: 'содержание помещений', equipment: 'обслуживание аппаратов', consumables: 'расходники', ward: 'койко-дни',
      repairs: 'ремонт аппаратов', works: 'стройка', interest: 'проценты по долгу', loan: 'кредит', severance: 'выплаты уволенным', study: 'учёба персонала',
    } as Record<string, string>,
    net: (rub: string) => `Итог суток: ${rub}`,
    cashAt: (rub: string) => `В кассе на 08:00: ${rub}`,
    debt: (interest: string) => `Касса в минусе: за сутки начислено ${interest} процентов.`,
    belowLimit: (limit: string) => `Касса ниже предела ${limit}: стройка ждёт денег.`,
    loanOffer: (rub: string, total: string, days: number) => `Банк предлагает кредит ${rub}: вернуть ${total} за ${days} суток равными долями на планёрках.`,
    loanTake: (rub: string) => `Взять кредит ${rub}`,
    loanLeft: (left: string, perDay: string) => `Кредит: осталось вернуть ${left}, по ${perDay} в сутки.`,
    loanTaken: (rub: string) => `Кредит взят: ${rub} — в кассе; возврат — на планёрках.`,
    rep: 'Репутация',
    repLine: (from: number, to: number, score: number | undefined) => `${from} → ${to}${score !== undefined ? ` · оценка суток ${score} из 100` : ''}`,
    repNobody: 'За сутки никто не пришёл — репутация прежняя.',
    repReason: {
      correct: (n: number) => `верный диагноз — ${n}`,
      wrong: (n: number) => `ошибка в диагнозе — ${n}`,
      left: (n: number) => `ушли, не дождавшись, — ${n}`,
      unseen: (n: number) => `не успели принять — ${n}`,
      returned: (n: number) => `вернулись хуже после лечения — ${n}`,
      waitShort: (min: number) => `ждали недолго: в среднем ${min} мин`,
      waitLong: (min: number) => `ждали долго: в среднем ${min} мин`,
      noToilet: () => 'нет санузла',
      died: (n: number) => `умерли в стационаре — ${n}`,
      severe: (n: number) => `переведены в тяжёлом состоянии — ${n}`,
    },
    repHint: (pull: number) => `Каждое утро репутация сдвигается к оценке суток на ${pull} % разницы. От неё — поток пациентов (±30 %) и доля ДМС и платных.`,
    load: 'Узкие места суток',
    loadNone: 'Узких мест не было: никто не ждал полчаса и дольше.',
    doctors: (queue: number, wait: number) => `врачи: в очереди до ${queue}, ожидание до ${dur(wait)}`,
    room: (name: string, queue: number, wait: number, n: number) => `${lowerFirst(name)}: впереди до ${queue}, ожидание до ${dur(wait)} (${n} ${pluralRu(n, 'обследование', 'обследования', 'обследований')})`,
    door: (n: number) => `скорая у входа: до ${n} сразу — мест в смотровой не хватало`,
    beds: (peak: number, of: number) => `стационар: лежали до ${peak} из ${of} ${pluralRu(of, 'койки', 'коек', 'коек')}`,
    /**
     * каталка (spec docs/specs/2026-10-orderlies.md): лежачие ждали её дольше `over` минут; `now` — ждут и сейчас: везти
     * некому (решение владельца #99)
     */
    gurney: (n: number, wait: number, over: number, now = 0) =>
      now > 0 && n === 0
        ? `каталку ждут дольше ${over} мин: ${now} — везти некому; дольше всех — ${dur(wait)}`
        : `каталку ждали дольше ${over} мин: ${n} ${pluralRu(n, 'раз', 'раза', 'раз')}${now > 0 ? `, ждут и сейчас — ${now}, везти некому;` : ','} дольше всех — ${dur(wait)}`,
    broken: 'Сломалось с утра',
    brokenRow: (eq: string, room: string, rub: string) => `${eq} (${lowerFirst(room)}) — до завтра, ремонт ${rub}`,
    worse: 'Обход: стало хуже',
    worseRow: (who: string, state: string) => `${who} — ${lowerFirst(state)}`,
    /** персонал (spec docs/specs/2026-10-staff-mood.md): упало настроение, собирается уйти, уходит */
    staff: 'Персонал',
    staffLow: (who: string) => `${who}: настроение ниже 30`,
    staffQuit: (who: string, day: number) => `${who} собирается уйти: ответьте до утра дня ${day} — поднимите зарплату или переведите в другую смену`,
    staffLeave: (who: string, why: string) => `${who} уходит после своей смены${why ? ` — ${why}` : ''}`,
    staffGrew: (who: string, skill: number, sex: 'm' | 'f') => `${who} ${sex === 'f' ? 'выросла' : 'вырос'} до навыка ${skill} — зарплата прежняя, ниже рынка: поднимите`,
    staffBack: (who: string, skill: number, sex: 'm' | 'f') => `${who} ${sex === 'f' ? 'вернулась' : 'вернулся'} с учёбы — навык ${skill}`,
    staffSick: (who: string) => `${who} болеет — сегодня на смену не выйдет`,
    /** резерв (spec docs/specs/2026-10-staff-mood.md, часть 5): кто кого заменил, кто вернулся в резерв */
    staffCovered: (who: string, by: string) => `Замена из резерва: ${who} → ${by}`,
    staffReturned: (who: string, sex: 'm' | 'f') => `${who} ${sex === 'f' ? 'вернулась' : 'вернулся'} в резерв`,
    /** итог главврача (spec docs/specs/2026-10-two-ways.md, F5): решения на утверждении за сутки и что из них вышло */
    chief: 'Главврач',
    chiefAsked: (n: number, discharges: number) =>
      `на утверждение пришло ${n} ${pluralRu(n, 'решение', 'решения', 'решений')} врачей${discharges > 0 ? ` (выписок — ${discharges})` : ''}`,
    chiefAnswers: (agreed: number, silent: number, changed: number) => `вы согласились — ${agreed}, ответа не было — ${silent}, изменили — ${changed}`,
    chiefChanged: (better: number, worse: number) => `из изменённых: к лучшему — ${better}, к худшему — ${worse}`,
    chiefMissed: (agreed: number, silent: number) =>
      `прошли ошибки врачей: ${[agreed > 0 ? `с вашим «Согласен» — ${agreed}` : '', silent > 0 ? `без ответа — ${silent}` : ''].filter(Boolean).join(', ')}`,
    chiefNoMiss: 'среди утверждённых неверных решений нет',
    /** ошибки нанятых врачей (F5; решение владельца #66): одной строкой — диагноз, верно ли, правда, главное замечание */
    errors: 'Ошибки нанятых врачей',
    errorsHint: 'Закрытые за сутки случаи нанятых врачей с неверным диагнозом или замечанием безопасности. «Карта» — что врач знал и решил',
    errorRow: (diagnosis: string, verdict: string, truth?: string) => `${diagnosis} — ${lowerFirst(verdict)}${truth ? `; на самом деле — ${truth}` : ''}`,
    errorChief: { agreed: 'вы согласились', silent: 'ответа не было' } as Record<string, string>,
    errorsMore: (n: number) => `и ещё ${n}`,
    tip: 'Подсказка',
    tips: {
      below: 'Касса ниже предела: стройка ждёт денег. Возьмите кредит банка или сократите расходы — уволить лишних, снести ненужное (половина цены вернётся).',
      debt: 'Касса в минусе: на долг каждые сутки — процент. Больше принятых — больше денег: ещё кабинет врача с терапевтом.',
      left: (n: number, of: number, wait: string) => `Ушли ${n} из ${of}, не дождавшись врача (ждали до ${wait}): нужен ещё кабинет врача с терапевтом.`,
      room: (name: string, wait: string) => `${name}: ожидание до ${wait} — второй такой кабинет или аппарат быстрее.`,
      door: 'Скорая ждала у входа: в смотровой приёмного не хватает мест.',
      beds: 'Стационар полон: больных переводят в другие больницы, а ОМС платит за случай только своим.',
      toilet: 'Нет санузла: репутация каждые сутки теряет 10.',
      audit: (rub: string) => `Страховая не оплатила обследования без показаний на ${rub}: врачи назначают лишнее.`,
      worse: 'Вашим лежащим хуже — посмотрите «Обход» в окне врача: сменить лечение, перевести, в операционную.',
      idle: 'К специалисту никто не записался: к нему записываются с болезнями его профиля, которые больница принимает, — к инфекционисту, только когда работает бокс.',
      fine: 'Больница справляется. Поток растёт с кабинетами врачей и с репутацией.',
    },
    hours: 'Часы приёма',
    hoursHint: 'Сами приходят только в часы приёма; приёмное и палаты работают круглые сутки',
    from: 'с',
    to: 'до',
  },
  /** обход ваших лежащих (геймдизайн §5, §6) — строки обхода «Анамнеза» */
  round: {
    vital: {
      'vital.fever': 'Температура',
      'vital.tachycardia': 'Пульс',
      'vital.tachypnea': 'Дыхание',
      'vital.spo2_low': 'Сатурация',
      'vital.bp_high': 'Давление',
    } as Record<string, string>,
    noTreatment: 'не назначено',
    treatments: (list: string) => `Лечение: ${list}`,
    reaction: (tx: string, by: string) => `реакция на ${lowerFirst(tx)}: ${lowerFirst(by)}`,
    harmAs: (name: string, tx: string) => `${name} после лечения «${tx}»`,
    inIcu: 'Палата интенсивной терапии, под монитором',
    inRicu: 'Реанимация, под монитором',
    onVent: 'Реанимация, на ИВЛ',
    inBox: 'Бокс инфекционного отделения',
    shock: 'За сутки — фибрилляция желудочков: дежурные сняли её разрядом под монитором, ритм восстановлен',
    opWaiting: (op: string, n: number) => `Ждёт операции: ${lowerFirst(op)}${n > 1 ? ` · в очереди ${n}-й` : ''}`,
    opOn: (op: string, until: string) => `Идёт операция: ${lowerFirst(op)}, до ${until}`,
    opDone: (op: string) => `После операции: ${lowerFirst(op)}`,
    opStage: (name: string) => `на операции — ${lowerFirst(name)}`,
    opComplication: 'после операции — осложнение, стационар дольше',
    replan: 'Сменить лечение',
    replanHint: 'Открыть карту: лечение по группам — что можно у его койки',
    apply: 'Сменить лечение',
    applyHint: 'Болезнь пойдёт дальше с новым лечением с этих суток',
    current: 'Назначено сейчас',
    suggested: 'При этом диагнозе',
    all: 'Всё лечение',
    operate: 'В операционную',
    title: 'Обход',
    worse: (name: string) => `${name}: стало хуже — «Обход» в окне врача`,
    worseShort: 'стало хуже',
    autopause: 'Автопауза: просьбы, результаты и ухудшение ваших больных',
  },
};

export type EconomyStrings = typeof economyRu;
