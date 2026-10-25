// Строки сценария кампании по-английски (spec docs/specs/2026-10-scenario-1.md, часть 2): того же вида, что scenario.ru.ts, —
// пропущенная строка не соберётся (tsc).
import type { ScenarioStrings } from './scenario.ru';

export const scenarioEn: ScenarioStrings = {
  scenario: {
    campaign: 'Campaign',
    sandbox: 'Sandbox',
    title: (n: number, name: string) => `Scenario ${n}. ${name}`,
    ok: 'Got it',
    skip: 'Skip',
    off: 'No tutorial',
    offHint: 'No more letters on how to build and see patients, and no tips in the chart; goals and occasion letters stay',
    letterDay: (day: number) => (day === 0 ? 'at the start' : `day ${day}`),
    main: 'Main goals',
    extra: 'Optional',
    progress: (value: number, target: number) => `${value} of ${target}`,
    accuracy: (n: number) => `accuracy ${n} %`,
    doneMark: 'done',
    note: 'Goals move with each day’s results, at the 08:00 meeting.',
    letters: 'Letters',
    noLetters: 'No letters yet.',
    tutorial: 'Tutorial',
    tutorialOn: 'the mentor’s letters and tips',
    guide: 'Build order',
    guideHint: 'What to build in which order and why: the step number in the catalog, done steps ticked. You can turn it off',
    guideNext: 'next',
    guideAll: 'Everything in the order is built; from here, follow your own plan.',
    meetingLetters: 'Letters',
    goalDone: (text: string) => `Goal done: ${text}`,
    doneTitle: 'Scenario complete',
    doneText: 'All main goals are done. You can keep playing here, as in the sandbox, or go back to the menu.',
    stay: 'Keep playing here',
    menu: 'To the menu',
  },
};
