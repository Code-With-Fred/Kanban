import { db, TABLES } from "./db";
import { todayIn } from "./dates";
import { downloadFile } from "./utils";

const FORMAT = "codewithfred-hub-backup";

export async function exportBackup(tz: string) {
  const payload: Record<string, unknown> = { format: FORMAT, version: 1, exportedAt: new Date().toISOString() };
  for (const t of TABLES) payload[t] = await db.table(t).toArray();
  // Never write the GitHub token into a backup file.
  payload.settings = (payload.settings as Record<string, unknown>[]).map((s) => ({ ...s, githubToken: "" }));
  downloadFile(`codewithfred-hub-backup-${todayIn(tz)}.json`, JSON.stringify(payload, null, 2), "application/json");
}

export async function importBackup(file: File): Promise<Record<string, number>> {
  const text = await file.text();
  let data: Record<string, unknown>;
  try {
    data = JSON.parse(text);
  } catch {
    throw new Error("That file isn't valid JSON.");
  }
  if (data.format !== FORMAT) throw new Error("This doesn't look like a Project Hub backup file.");
  const counts: Record<string, number> = {};
  await db.transaction("rw", TABLES.map((t) => db.table(t)), async () => {
    const currentToken = (await db.settings.get("me"))?.githubToken ?? "";
    for (const t of TABLES) {
      let rows = data[t] as unknown[];
      if (!Array.isArray(rows)) continue;
      // Backups never contain the token; keep the one already in this browser.
      if (t === "settings") rows = (rows as Record<string, unknown>[]).map((r) => ({ ...r, githubToken: r.githubToken || currentToken }));
      await db.table(t).clear();
      await db.table(t).bulkPut(rows);
      counts[t] = rows.length;
    }
  });
  return counts;
}

export async function wipeAllData() {
  await db.transaction("rw", TABLES.map((t) => db.table(t)), async () => {
    for (const t of TABLES) await db.table(t).clear();
  });
}

/** Ask the browser not to evict this origin's storage under pressure. */
export async function requestPersistentStorage(): Promise<boolean> {
  try {
    if (navigator.storage?.persisted && (await navigator.storage.persisted())) return true;
    return (await navigator.storage?.persist?.()) ?? false;
  } catch {
    return false;
  }
}

export async function storageEstimate(): Promise<{ usage: number; quota: number; persisted: boolean } | null> {
  try {
    const e = await navigator.storage.estimate();
    const persisted = (await navigator.storage.persisted?.()) ?? false;
    return { usage: e.usage ?? 0, quota: e.quota ?? 0, persisted };
  } catch {
    return null;
  }
}
