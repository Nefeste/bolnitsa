// Строки испытаний по-английски (spec docs/specs/2026-11-challenges.md, часть 2): того же вида, что challenge.ru.ts, —
// пропущенная строка не соберётся.
import type { ChallengeStrings } from './challenge.ru';

const points = (p: number) => p.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const pct = (v: number) => `${v.toLocaleString('en-US', { maximumFractionDigits: 1 })} %`;
const rub = (n: number) => `${Math.round(n).toLocaleString('en-US')} ₽`;
const day = (iso: string) => iso.split('-').reverse().join('.');

export const challengeEn: ChallengeStrings = {
  challenges: {
    start: 'Challenges',
    pick: 'Pick a challenge',
    startHint: 'one shift with a special condition — a result from A to D and a record',
    lead: 'A short game in a ready hospital with one condition: a shift is 12 game hours, «In Debt» a week. The result is A to D; B or better passes. A failed challenge takes nothing away.',
    chief: 'chief doctor — building, hiring and cash',
    doctor: 'doctor — you alone, no building and no cash',
    notPlayed: 'not played yet',
    passed: 'passed',
    notPassed: 'not passed',
    best: (grade: string, line: string, done: boolean) => `best: ${grade}, ${line} — ${done ? 'passed' : 'not passed'}`,
    role: 'Who you are — in the chief doctor challenges',
    short: {
      unseen: (v: number) => `unseen ${pct(v)}`,
      seen: (v: number) => `seen ${v}`,
      cash: (v: number) => `cash ${rub(v)}`,
      xrays: (v: number) => `X-rays ${v}`,
      shift: (v: number) => `score ${points(v)}`,
    },
    title: (name: string) => `Challenge result · ${name}`,
    grade: (grade: string) => `Result: ${grade}`,
    value: {
      unseen: (v: number, seen: number, arrived: number) => `Unseen by the end: ${pct(v)} — a doctor called ${seen} of ${arrived}`,
      seen: (v: number, arrived: number) => `Seen — called by a doctor by the end: ${v} of ${arrived}`,
      cash: (v: number) => `Cash at the end: ${rub(v)}`,
      xrays: (v: number) => `X-rays taken during the shift: ${v}`,
      shift: (v: number) => `Doctor's shift result — score ${points(v)} of 3`,
    },
    nobody: 'Nobody was seen — no shift result.',
    reds: (inTime: number, total: number, minutes: number) =>
      total === 0 ? 'No reds by the scale came in.' : `Reds by the scale within ${minutes} minutes: ${inTime} of ${total} — for your information`,
    unindicated: (n: number, max: number) => `Exams without an indication: ${n} — at most ${max} allowed`,
    passedYes: 'Passed.',
    passedNo: 'Not passed: the result must be B or better.',
    passedNoRule: (max: number) => `Not passed: the result must be B or better, with at most ${max} exams without an indication.`,
    isBest: 'Your best result in this challenge.',
    bestLine: (grade: string, line: string, iso: string) => `Best: ${grade}, ${line} — ${day(iso)}.`,
    again: 'Again',
    audit: (n: number, max: number) => `Without an indication: ${n} of ${max}`,
    auditHint: 'The insurer checks every visit of yours: an exam without an indication goes unpaid. More fails the challenge.',
    untilEnd: 'To the end of the challenge',
    untilEndSoon: 'as fast as possible; stops when something happens',
  },
};
