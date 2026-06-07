export interface GameDateTime {
  readonly year: number
  readonly month: number   // 1–12
  readonly day: number     // 1–31
  readonly hour: number    // 0–23
  readonly minute: number  // 0–59
}

export function createGameDateTime(
  year: number,
  month: number,
  day: number,
  hour = 0,
  minute = 0,
): GameDateTime {
  const d = new Date(year, month - 1, day, hour, minute);
  if (
    d.getFullYear() !== year ||
    d.getMonth() + 1 !== month ||
    d.getDate() !== day ||
    d.getHours() !== hour ||
    d.getMinutes() !== minute
  ) {
    throw new Error(`Invalid game date: ${year}-${month}-${day} ${hour}:${minute}`);
  }
  return Object.freeze({ year, month, day, hour, minute });
}

function toDate(gdt: GameDateTime): Date {
  return new Date(gdt.year, gdt.month - 1, gdt.day, gdt.hour, gdt.minute);
}

function fromDate(d: Date): GameDateTime {
  return Object.freeze({
    year: d.getFullYear(),
    month: d.getMonth() + 1,
    day: d.getDate(),
    hour: d.getHours(),
    minute: d.getMinutes(),
  });
}

export function addMinutes(gdt: GameDateTime, minutes: number): GameDateTime {
  const d = toDate(gdt);
  d.setMinutes(d.getMinutes() + minutes);
  return fromDate(d);
}

export function addHours(gdt: GameDateTime, hours: number): GameDateTime {
  return addMinutes(gdt, hours * 60);
}

export function addDays(gdt: GameDateTime, days: number): GameDateTime {
  const d = toDate(gdt);
  d.setDate(d.getDate() + days);
  return fromDate(d);
}

export function compareGameDateTime(a: GameDateTime, b: GameDateTime): -1 | 0 | 1 {
  const aMs = toDate(a).getTime();
  const bMs = toDate(b).getTime();
  if (aMs < bMs) {return -1;}
  if (aMs > bMs) {return 1;}
  return 0;
}

export function isAfter(a: GameDateTime, b: GameDateTime): boolean {
  return compareGameDateTime(a, b) === 1;
}

export function isBefore(a: GameDateTime, b: GameDateTime): boolean {
  return compareGameDateTime(a, b) === -1;
}

export function isEqual(a: GameDateTime, b: GameDateTime): boolean {
  return compareGameDateTime(a, b) === 0;
}

const MONTH_NAMES = [
  'Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun',
  'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec',
];

export function formatGameDateTime(gdt: GameDateTime): string {
  const h = String(gdt.hour).padStart(2, '0');
  const m = String(gdt.minute).padStart(2, '0');
  return `${gdt.day} ${MONTH_NAMES[gdt.month - 1]} ${gdt.year} ${h}:${m}`;
}
