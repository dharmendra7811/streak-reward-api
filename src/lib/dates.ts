/**
 * Calendar-date helpers.
 *
 * All "calendar days" are represented as Date objects at UTC midnight, so a
 * DATE column value maps 1:1 to a YYYY-MM-DD key with no timezone drift:
 *   todayDate(tz)  -> Date at UTC midnight of today in tz
 *   toDateKey(d)   -> 'YYYY-MM-DD' (safe: DATE values are stored as UTC midnight)
 */
function calendarDate(offsetDays: number, timeZone: string): Date {
  const target = new Date(Date.now() + offsetDays * 24 * 60 * 60 * 1000);
  const key = new Intl.DateTimeFormat('en-CA', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(target); // en-CA -> YYYY-MM-DD
  return new Date(`${key}T00:00:00.000Z`);
}

export function todayDate(timeZone: string): Date {
  return calendarDate(0, timeZone);
}

export function yesterdayDate(timeZone: string): Date {
  const d = todayDate(timeZone);
  d.setUTCDate(d.getUTCDate() - 1);
  return d;
}

export function toDateKey(d: Date): string {
  return d.toISOString().slice(0, 10);
}

export function dateKeyToDate(key: string): Date {
  return new Date(`${key}T00:00:00.000Z`);
}
