// Строки демо по-английски (spec docs/specs/2026-11-demo.md): того же вида, что demo.ru.ts, — пропущенная строка не соберётся.
import type { DemoStrings } from './demo.ru';

export const demoEn: DemoStrings = {
  demo: {
    loadContent: 'Disease and hospital database',
    loadModels: (done: number, total: number) => `Furniture and equipment: ${done} of ${total}`,
    loadPeople: (done: number, total: number) => `People: ${done} of ${total}`,
    loadWorld: 'Building the hospital',
    loadStart: 'Opening the shift',
    title: 'Summary',
    lead: (day: number) => `Your clinic's first ${day > 1 ? `${day} days are` : 'day is'} behind you — here it is in numbers.`,
    built: 'Built',
    builtNone: 'nothing',
    patients: 'Patients in the day',
    arrived: (n: number) => `${n} arrived`,
    seen: (n: number) => `${n} seen`,
    left: (n: number) => `${n} left without being seen`,
    hire: 'You cannot see everyone alone: another doctor’s office with a therapist will see the ones you cannot.',
    own: 'Your patients',
    ownLine: (n: number, right: number) => `${n} ${n === 1 ? 'patient' : 'patients'}, ${right} diagnosed right`,
    ownNone: 'you have not seen anyone yourself yet',
    cash: 'Cash this morning',
    played: 'You have played',
    minutes: (m: number) => `${m} ${m === 1 ? 'minute' : 'minutes'}`,
    snapshot: 'Your hospital',
    saveShot: 'Save the picture',
    savedTo: (where: string) => `Saved: ${where}`,
    downloaded: 'The picture is in your browser downloads',
    wishlist: 'Add to Steam wishlist',
    goOn: 'Keep playing',
    menu: 'Main menu',
  },
};
