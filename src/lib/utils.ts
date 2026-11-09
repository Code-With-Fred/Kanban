import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export function uid(): string {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) return crypto.randomUUID();
  return Math.random().toString(36).slice(2) + Date.now().toString(36);
}

export const nowISO = () => new Date().toISOString();

/** 135 → "2h 15m" */
export function fmtMinutes(min: number | null | undefined): string {
  const m = Math.max(0, Math.round(min ?? 0));
  if (m === 0) return "0m";
  const h = Math.floor(m / 60);
  const r = m % 60;
  if (!h) return `${r}m`;
  return r ? `${h}h ${r}m` : `${h}h`;
}

export const fmtHours = (min: number) => `${(min / 60).toFixed(min % 60 === 0 ? 0 : 1)}h`;

/** Parses "1h30", "1.5h", "90", "90m", "2h 15m", "1:30" → minutes. Returns null if invalid. */
export function parseDuration(input: string): number | null {
  const s = input.trim().toLowerCase();
  if (!s) return null;
  if (/^\d+(\.\d+)?$/.test(s)) return Math.round(Number(s));
  const colon = s.match(/^(\d+):(\d{1,2})$/);
  if (colon) return Number(colon[1]) * 60 + Number(colon[2]);
  // "1h30" / "2 hrs 15" (minutes without a unit after hours)
  const hm = s.match(/^(\d+(?:\.\d+)?)\s*(?:h|hr|hrs|hours?)\s*(\d+)$/);
  if (hm) return Math.round(Number(hm[1]) * 60 + Number(hm[2]));
  const re = /(\d+(?:\.\d+)?)\s*(hours?|hrs?|h|minutes?|mins?|m)/g;
  let total = 0;
  let matched = false;
  let m: RegExpExecArray | null;
  while ((m = re.exec(s))) {
    matched = true;
    const n = Number(m[1]);
    total += m[2].startsWith("h") ? n * 60 : n;
  }
  return matched ? Math.round(total) : null;
}

export function clamp(n: number, min: number, max: number) {
  return Math.min(max, Math.max(min, n));
}

/** Splits free text into bullet items (newlines, bullets, or semicolons). */
export function toBullets(text: string | null | undefined): string[] {
  if (!text) return [];
  return text
    .split(/\n|;|•/)
    .map((s) => s.replace(/^\s*[-*\d.)]+\s*/, "").trim())
    .filter(Boolean);
}

export function normalizeUrl(u: string): string {
  const s = u.trim();
  if (!s) return "";
  return /^https?:\/\//i.test(s) ? s : `https://${s}`;
}

export function pluralize(n: number, one: string, many = one + "s") {
  return `${n} ${n === 1 ? one : many}`;
}

export function downloadFile(filename: string, content: string | Blob, mime = "text/plain") {
  const blob = typeof content === "string" ? new Blob([content], { type: mime }) : content;
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

export async function copyText(text: string): Promise<boolean> {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    try {
      const ta = document.createElement("textarea");
      ta.value = text;
      ta.style.position = "fixed";
      ta.style.opacity = "0";
      document.body.appendChild(ta);
      ta.select();
      const ok = document.execCommand("copy");
      ta.remove();
      return ok;
    } catch {
      return false;
    }
  }
}

export const isMac = () => typeof navigator !== "undefined" && /Mac|iPhone|iPad/.test(navigator.platform);
