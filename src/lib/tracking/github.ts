import { db } from "../db";
import { ensureSettings, updateSettings } from "../repo";
import type { Settings, SyncStatus, TrackedEvent } from "../types";
import { repoFromUrl } from "./drafts";

/**
 * Pulls your recent GitHub activity straight from the browser (GitHub's REST
 * API allows cross-origin requests). Read-only: nothing is ever written to GitHub.
 */

const API = "https://api.github.com";
const FIRST_SYNC_DAYS = 14;
const OVERLAP_HOURS = 48; // re-read a little history each sync so late pushes aren't missed
const MAX_REPOS = 25;
const MAX_PAGES = 3;

export class GitHubError extends Error {
  constructor(
    message: string,
    public status: number,
  ) {
    super(message);
  }
}

let lastRateRemaining: number | null = null;

async function gh<T>(path: string, token: string): Promise<T> {
  const headers: Record<string, string> = {
    Accept: "application/vnd.github+json",
    "X-GitHub-Api-Version": "2022-11-28",
  };
  if (token) headers.Authorization = `Bearer ${token}`;
  let res: Response;
  try {
    res = await fetch(`${API}${path}`, { headers });
  } catch {
    throw new GitHubError("Couldn't reach GitHub. Check your internet connection.", 0);
  }
  const remaining = res.headers.get("x-ratelimit-remaining");
  if (remaining !== null) lastRateRemaining = Number(remaining);
  if (res.ok) return (await res.json()) as T;

  if (res.status === 401) throw new GitHubError("GitHub rejected the token. It may be expired or mistyped.", 401);
  if ((res.status === 403 || res.status === 429) && remaining === "0") {
    const reset = Number(res.headers.get("x-ratelimit-reset") ?? 0) * 1000;
    const mins = reset ? Math.max(1, Math.ceil((reset - Date.now()) / 60_000)) : 60;
    throw new GitHubError(
      `GitHub rate limit reached. It resets in about ${mins} min${token ? "" : " — adding a token raises the limit"}.`,
      res.status,
    );
  }
  if (res.status === 404) throw new GitHubError("Not found (or private without a token).", 404);
  throw new GitHubError(`GitHub responded with ${res.status}.`, res.status);
}

interface GhUser {
  login: string;
  name: string | null;
  avatar_url: string;
  public_repos: number;
}
interface GhRepo {
  full_name: string;
  pushed_at: string | null;
  archived: boolean;
}
interface GhCommit {
  sha: string;
  html_url: string;
  parents: { sha: string }[];
  author: { login: string } | null;
  commit: { message: string; author: { name: string; email: string; date: string } | null };
}
interface GhSearchIssue {
  id: number;
  number: number;
  title: string;
  body: string | null;
  html_url: string;
  created_at: string;
  repository_url: string;
  pull_request?: { merged_at: string | null };
}

/** Verifies the username/token pair. Returns the profile and remaining rate limit. */
export async function testConnection(username: string, token: string) {
  if (!username.trim()) throw new GitHubError("Enter your GitHub username first.", 0);
  const user = await gh<GhUser>(`/users/${encodeURIComponent(username.trim())}`, token);
  let tokenOwner: string | null = null;
  if (token) tokenOwner = (await gh<GhUser>("/user", token)).login;
  return { user, tokenOwner, rateRemaining: lastRateRemaining };
}

function sinceFor(settings: Settings): Date {
  const first = new Date(Date.now() - FIRST_SYNC_DAYS * 86_400_000);
  const last = settings.lastSync?.lastSuccessAt;
  if (!last) return first;
  const s = new Date(new Date(last).getTime() - OVERLAP_HOURS * 3_600_000);
  return s < first ? first : s;
}

async function reposToScan(settings: Settings, since: Date): Promise<string[]> {
  const set = new Set<string>();
  // 1. Repos linked to projects (explicitly or via a project's repo URL).
  const projects = await db.projects.toArray();
  for (const p of projects) {
    if (p.status === "archived") continue;
    const r = repoFromUrl(p.repoUrl);
    if (r) set.add(r);
  }
  for (const r of Object.keys(settings.repoLinks)) set.add(r.toLowerCase());
  // 2. Anything you pushed to recently — so new repos are discovered automatically.
  const list = settings.githubToken
    ? await gh<GhRepo[]>("/user/repos?sort=pushed&per_page=50&affiliation=owner,collaborator,organization_member", settings.githubToken)
    : await gh<GhRepo[]>(`/users/${encodeURIComponent(settings.githubUsername)}/repos?sort=pushed&per_page=50&type=all`, "");
  for (const r of list) {
    if (r.archived || !r.pushed_at || new Date(r.pushed_at) < since) continue;
    set.add(r.full_name.toLowerCase());
  }
  return [...set].slice(0, MAX_REPOS);
}

function isMine(c: GhCommit, settings: Settings): boolean {
  const login = settings.githubUsername.trim().toLowerCase();
  if (c.author?.login?.toLowerCase() === login) return true;
  const email = c.commit.author?.email?.toLowerCase();
  return !!email && settings.githubEmails.some((e) => e.toLowerCase() === email);
}

async function commitsFor(repo: string, settings: Settings, since: Date): Promise<TrackedEvent[]> {
  const out: TrackedEvent[] = [];
  for (let page = 1; page <= MAX_PAGES; page++) {
    let batch: GhCommit[];
    try {
      batch = await gh<GhCommit[]>(`/repos/${repo}/commits?since=${since.toISOString()}&per_page=100&page=${page}`, settings.githubToken);
    } catch (e) {
      // An empty repo returns 409; a private repo without a token returns 404. Skip, don't fail the sync.
      if (e instanceof GitHubError && (e.status === 404 || e.status === 409)) return out;
      throw e;
    }
    for (const c of batch) {
      if (c.parents.length > 1 || !isMine(c, settings) || !c.commit.author?.date) continue;
      const [title, ...rest] = c.commit.message.split("\n");
      out.push({
        id: `gh:commit:${c.sha}`,
        source: "github",
        kind: "commit",
        repo,
        title: title.trim(),
        body: rest.join("\n").trim().slice(0, 2000),
        url: c.html_url,
        occurredAt: new Date(c.commit.author.date).toISOString(),
      });
    }
    if (batch.length < 100) break;
  }
  return out;
}

async function pullRequests(settings: Settings, since: Date): Promise<TrackedEvent[]> {
  const day = since.toISOString().slice(0, 10);
  const q = encodeURIComponent(`author:${settings.githubUsername.trim()} type:pr updated:>=${day}`);
  const res = await gh<{ items: GhSearchIssue[] }>(`/search/issues?q=${q}&per_page=50&sort=updated`, settings.githubToken);
  const out: TrackedEvent[] = [];
  for (const it of res.items) {
    const repo = it.repository_url.replace(`${API}/repos/`, "").toLowerCase();
    const base = { source: "github" as const, repo, title: it.title, body: (it.body ?? "").slice(0, 2000), url: it.html_url, number: it.number };
    if (new Date(it.created_at) >= since) out.push({ ...base, id: `gh:pr:${it.id}:opened`, kind: "pr_opened", occurredAt: it.created_at });
    const merged = it.pull_request?.merged_at;
    if (merged && new Date(merged) >= since) out.push({ ...base, id: `gh:pr:${it.id}:merged`, kind: "pr_merged", occurredAt: merged });
  }
  return out;
}

let inFlight: Promise<SyncStatus> | null = null;

/** Syncs GitHub activity into the local database. Safe to call often — concurrent calls share one run. */
export function syncGitHub(): Promise<SyncStatus> {
  if (inFlight) return inFlight;
  inFlight = (async () => {
    const settings = await ensureSettings();
    if (!settings.githubUsername.trim()) throw new GitHubError("Add your GitHub username in Settings → Automatic tracking.", 0);
    const since = sinceFor(settings);
    let status: SyncStatus;
    try {
      const repos = await reposToScan(settings, since);
      const events: TrackedEvent[] = [];
      // Small concurrency keeps it fast without hammering the API.
      for (let i = 0; i < repos.length; i += 4) {
        const chunk = await Promise.all(repos.slice(i, i + 4).map((r) => commitsFor(r, settings, since)));
        chunk.forEach((c) => events.push(...c));
      }
      try {
        events.push(...(await pullRequests(settings, since)));
      } catch (e) {
        // Search has its own, stricter rate limit — commits still count if it fails.
        if (!(e instanceof GitHubError) || e.status === 401) throw e;
      }
      const existing = new Set((await db.trackedEvents.bulkGet(events.map((e) => e.id))).filter(Boolean).map((e) => e!.id));
      await db.trackedEvents.bulkPut(events);
      const at = new Date().toISOString();
      status = {
        ok: true,
        at,
        newEvents: events.filter((e) => !existing.has(e.id)).length,
        reposScanned: repos.length,
        rateRemaining: lastRateRemaining,
        lastSuccessAt: at,
      };
    } catch (e) {
      status = {
        ok: false,
        at: new Date().toISOString(),
        newEvents: 0,
        reposScanned: 0,
        rateRemaining: lastRateRemaining,
        error: e instanceof Error ? e.message : "Sync failed",
        lastSuccessAt: settings.lastSync?.lastSuccessAt ?? null,
      };
    }
    await updateSettings({ lastSync: status });
    if (!status.ok) throw new GitHubError(status.error ?? "Sync failed", 0);
    return status;
  })().finally(() => {
    inFlight = null;
  });
  return inFlight;
}

/** True when auto-sync should run now. */
export function syncDue(settings: Settings, minIntervalMin = 15): boolean {
  if (!settings.autoTrackEnabled || !settings.githubUsername.trim()) return false;
  const last = settings.lastSync?.at;
  return !last || Date.now() - new Date(last).getTime() > minIntervalMin * 60_000;
}
