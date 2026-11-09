import type { ISODate } from "./types";

/**
 * All "calendar day" logic is anchored to the user's configured timezone
 * (default Africa/Lagos), not the browser's, so "today" is always correct
 * even when travelling or using a machine set to another zone.
 */

const pad = (n: number) => String(n).padStart(2, "0");

/** YYYY-MM-DD for an instant, as seen in `tz`. */
export function dateInTz(instant: Date | string | number, tz: string): ISODate {
  const d = instant instanceof Date ? instant : new Date(instant);
  try {
    const parts = new Intl.DateTimeFormat("en-CA", {
      timeZone: tz,
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
    }).formatToParts(d);
    const get = (t: string) => parts.find((p) => p.type === t)?.value ?? "";
    return `${get("year")}-${get("month")}-${get("day")}`;
  } catch {
    return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
  }
}

export const todayIn = (tz: string): ISODate => dateInTz(new Date(), tz);

/** Current HH:mm in `tz`. */
export function timeInTz(tz: string, instant: Date = new Date()): string {
  try {
    return new Intl.DateTimeFormat("en-GB", { timeZone: tz, hour: "2-digit", minute: "2-digit", hour12: false })
      .format(instant)
      .replace(/^24/, "00");
  } catch {
    return `${pad(instant.getHours())}:${pad(instant.getMinutes())}`;
  }
}

export function hourInTz(tz: string): number {
  return Number(timeInTz(tz).slice(0, 2));
}

/** Parse YYYY-MM-DD as a UTC-noon Date (safe for pure calendar arithmetic). */
export function parseISODate(d: ISODate): Date {
  const [y, m, day] = d.split("-").map(Number);
  return new Date(Date.UTC(y, (m || 1) - 1, day || 1, 12));
}

export function toISODate(d: Date): ISODate {
  return `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}-${pad(d.getUTCDate())}`;
}

export function addDays(d: ISODate, n: number): ISODate {
  const x = parseISODate(d);
  x.setUTCDate(x.getUTCDate() + n);
  return toISODate(x);
}

export function diffDays(a: ISODate, b: ISODate): number {
  return Math.round((parseISODate(a).getTime() - parseISODate(b).getTime()) / 86_400_000);
}

export function dayOfWeek(d: ISODate): number {
  return parseISODate(d).getUTCDay();
}

export function startOfWeek(d: ISODate, weekStartsOn: 0 | 1 = 1): ISODate {
  const dow = dayOfWeek(d);
  const delta = (dow - weekStartsOn + 7) % 7;
  return addDays(d, -delta);
}

export function rangeDays(start: ISODate, end: ISODate): ISODate[] {
  const out: ISODate[] = [];
  for (let d = start; d <= end; d = addDays(d, 1)) out.push(d);
  return out;
}

export function startOfMonth(d: ISODate): ISODate {
  return d.slice(0, 8) + "01";
}

export function addMonths(d: ISODate, n: number): ISODate {
  const x = parseISODate(startOfMonth(d));
  x.setUTCMonth(x.getUTCMonth() + n);
  return toISODate(x);
}

export function endOfMonth(d: ISODate): ISODate {
  return addDays(addMonths(d, 1), -1);
}

const fmtCache = new Map<string, Intl.DateTimeFormat>();
function fmt(opts: Intl.DateTimeFormatOptions, tz = "UTC") {
  const key = JSON.stringify(opts) + tz;
  let f = fmtCache.get(key);
  if (!f) {
    f = new Intl.DateTimeFormat("en-GB", { ...opts, timeZone: tz });
    fmtCache.set(key, f);
  }
  return f;
}

/** "Mon, 9 Nov" */
export const fmtShort = (d: ISODate) => fmt({ weekday: "short", day: "numeric", month: "short" }).format(parseISODate(d));
/** "9 Nov 2026" */
export const fmtMedium = (d: ISODate) => fmt({ day: "numeric", month: "short", year: "numeric" }).format(parseISODate(d));
/** "Monday, 9 November 2026" */
export const fmtLong = (d: ISODate) =>
  fmt({ weekday: "long", day: "numeric", month: "long", year: "numeric" }).format(parseISODate(d));
/** "November 2026" */
export const fmtMonth = (d: ISODate) => fmt({ month: "long", year: "numeric" }).format(parseISODate(d));
/** "Mon" */
export const fmtWeekday = (d: ISODate) => fmt({ weekday: "short" }).format(parseISODate(d));
/** "9 Nov" */
export const fmtDayMonth = (d: ISODate) => fmt({ day: "numeric", month: "short" }).format(parseISODate(d));

/** Time of a timestamp in tz, e.g. "14:05". */
export const fmtTime = (ts: string, tz: string) => fmt({ hour: "2-digit", minute: "2-digit", hour12: false }, tz).format(new Date(ts));

/** Human relative label for a calendar date vs today. */
export function relativeDay(d: ISODate, today: ISODate): string {
  const n = diffDays(d, today);
  if (n === 0) return "Today";
  if (n === 1) return "Tomorrow";
  if (n === -1) return "Yesterday";
  if (n > 1 && n < 7) return `In ${n} days`;
  if (n < -1 && n > -7) return `${-n} days ago`;
  return fmtDayMonth(d);
}

/** "3m ago", "2h ago", "4d ago" */
export function timeAgo(ts: string): string {
  const s = Math.max(0, (Date.now() - new Date(ts).getTime()) / 1000);
  if (s < 45) return "just now";
  if (s < 3600) return `${Math.round(s / 60)}m ago`;
  if (s < 86400) return `${Math.round(s / 3600)}h ago`;
  if (s < 86400 * 30) return `${Math.round(s / 86400)}d ago`;
  return new Date(ts).toLocaleDateString("en-GB", { day: "numeric", month: "short" });
}

export function greeting(tz: string): string {
  const h = hourInTz(tz);
  if (h < 5) return "Burning the midnight oil";
  if (h < 12) return "Good morning";
  if (h < 17) return "Good afternoon";
  return "Good evening";
}

/** Fallback list if Intl.supportedValuesOf is unavailable. */
const COMMON_TZ = [
  "Africa/Lagos",
  "Africa/Accra",
  "Africa/Nairobi",
  "Africa/Johannesburg",
  "Africa/Cairo",
  "Europe/London",
  "Europe/Berlin",
  "Europe/Paris",
  "America/New_York",
  "America/Chicago",
  "America/Los_Angeles",
  "America/Toronto",
  "Asia/Dubai",
  "Asia/Kolkata",
  "Asia/Singapore",
  "Asia/Tokyo",
  "Australia/Sydney",
  "UTC",
];

export function allTimezones(): string[] {
  try {
    const list = (Intl as unknown as { supportedValuesOf?: (k: string) => string[] }).supportedValuesOf?.("timeZone");
    if (list && list.length) return list.includes("UTC") ? list : [...list, "UTC"];
  } catch {
    /* ignore */
  }
  return COMMON_TZ;
}
