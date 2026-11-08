// Строки смены врача по-английски (spec docs/specs/2026-11-doctor-shift.md, часть 2): того же вида, что shift.ru.ts, —
// пропущенная строка не соберётся.
import type { Manage } from '../content/types';
import type { ShiftStrings } from './shift.ru';

const points = (p: number) => p.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
/** The day of a case of the day from `2026-11-08`: «8 November». */
const dayName = (iso: string) => `${Number(iso.slice(8, 10))} ${MONTHS[Number(iso.slice(5, 7)) - 1]}`;

export const shiftEn: ShiftStrings = {
  shift: {
    section: 'For doctors',
    start: 'Doctor’s shift',
    startHint: 'a ready hospital, you are the only doctor — a grade from A to D and a record',
    lead: 'A day shift, 08:00–20:00. Hired office doctors do not see patients today — every patient is yours; nurses, lab techs, X-ray and surgeons work. No building, no cash — only patients.',
    hospital: 'Hospital',
    poly: 'Polyclinic',
    polyHint: 'offices, a lab, ECG; no X-ray',
    city: 'City hospital',
    cityHint: 'every exam, an emergency room and ambulances',
    best: (grade: string, p: number) => `best: ${grade}, score ${points(p)}`,
    noBest: 'no shifts here yet',
    level: 'Level',
    levelHint: 'The level changes the flow and the patience of patients; each hospital and level keeps its own best result.',
    line: {
      calm: 'Fewer patients, and they wait longer.',
      normal: 'Flow and patience as designed.',
      hard: 'More patients, and they wait less.',
    } as Record<Manage, string>,
    numbers: (inflow: string, patience: string) => `flow ${inflow} · patience ${patience}`,
    go: 'Start the shift',
    untilEnd: 'Until the shift ends',
    untilEndSoon: 'to 20:00 as fast as possible; stops when something happens',
    title: (venue: string) => `Shift summary · ${venue}`,
    levelName: (level: string) => `level “${level}”`,
    category: { accuracy: 'Accuracy', defensibility: 'Defensibility', thrift: 'Thrift', safety: 'Safety', speed: 'Speed' } as Record<string, string>,
    overall: 'Overall',
    points: (p: number) => `score ${points(p)} of 3`,
    seen: (seen: number, arrived: number) => `Seen: ${seen} of ${arrived}`,
    left: (n: number) => `Left without being seen: ${n}`,
    correct: (n: number) => `Correct diagnoses: ${n}% (a near miss counts as half)`,
    minutes: (n: number) => `Per patient — ${n} min on average`,
    nobody: 'Nobody was seen — no summary.',
    isBest: 'Your best result in this hospital on this level.',
    bestLine: (grade: string, p: number, iso: string) => `Best here: ${grade}, score ${points(p)} — ${iso}.`,
    again: 'New shift',
    menu: 'To the menu',
  },
  daily: {
    start: 'Case of the day',
    startHint: 'one hard patient a day, the same for everyone; any of the last 30 days, whenever you like',
    lead: 'A hard patient: the complaints fit many illnesses, and questions and an examination are not enough. A city hospital, no other patients, only this one. The first try counts; you can play again.',
    days: 'Days',
    day: (iso: string, i: number) => (i === 0 ? `Today, ${dayName(iso)}` : i === 1 ? `Yesterday, ${dayName(iso)}` : dayName(iso)),
    played: (grade: string, verdict: string) => `played: ${grade}, ${verdict}`,
    notPlayed: 'not played',
    verdict: { correct: 'right diagnosis', partly: 'nearly right', wrong: 'wrong' } as Record<string, string>,
    title: (iso: string) => `Case of the day · ${dayName(iso)}`,
    grade: (grade: string, verdict: string) => `Result: ${grade}, ${verdict}`,
    first: 'Counted: the first try.',
    counted: (grade: string, verdict: string) => `The first try counts: ${grade}, ${verdict}.`,
    review: 'Review',
    again: 'Play again',
  },
};
