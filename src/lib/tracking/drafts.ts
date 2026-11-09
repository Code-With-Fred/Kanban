import { dateInTz } from "../dates";
import type { DraftDecision, ISODate, Project, Settings, Task, TrackedEvent } from "../types";

/**
 * Turns raw GitHub activity into suggested work-log entries — one per project
 * per day. Everything here is pure and deterministic so it can be unit-tested.
 */

/* --------------------------------- Repos --------------------------------- */

/** `https://github.com/Owner/Repo.git` → `owner/repo` (or null if not a GitHub repo URL). */
export function repoFromUrl(url: string | null | undefined): string | null {
  if (!url) return null;
  const m = url.trim().match(/github\.com[/:]([\w.-]+)\/([\w.-]+?)(?:\.git)?(?:[/#?].*)?$/i);
  return m ? `${m[1]}/${m[2]}`.toLowerCase() : null;
}

/** Resolves which project a repo belongs to: explicit link first, then a project's repo URL. */
export function buildRepoResolver(projects: Project[], links: Record<string, string>) {
  const live = new Map(projects.map((p) => [p.id, p]));
  const byUrl = new Map<string, Project>();
  for (const p of projects) {
    const r = repoFromUrl(p.repoUrl);
    if (r && !byUrl.has(r)) byUrl.set(r, p);
  }
  return (repo: string): Project | null => {
    const linked = links[repo];
    if (linked && live.has(linked)) return live.get(linked)!;
    return byUrl.get(repo) ?? null;
  };
}

/* ------------------------------- Messages -------------------------------- */

const CONVENTIONAL = /^(feat|fix|chore|docs|refactor|perf|test|tests|style|build|ci|revert)(\([^)]*\))?!?:\s*/i;

/** "feat(auth): add login rate limit" → "Add login rate limit". */
export function cleanSubject(message: string): string {
  const first = message.split("\n")[0].trim().replace(CONVENTIONAL, "").replace(/\s+/g, " ");
  if (!first) return "";
  return first[0].toUpperCase() + first.slice(1);
}

export function isNoiseCommit(message: string): boolean {
  const s = message.split("\n")[0].trim();
  return /^merge (pull request|branch|remote-tracking)/i.test(s) || /^(wip|\.|-+|update|updates|minor|fix|fixes)$/i.test(s);
}

const uniq = (xs: string[]) => {
  const seen = new Set<string>();
  return xs.filter((x) => {
    const k = x.toLowerCase();
    if (!x || seen.has(k)) return false;
    seen.add(k);
    return true;
  });
};

/* ------------------------------- Sessions -------------------------------- */

/**
 * Estimates working time from commit timestamps. Commits closer together than
 * `gapMinutes` belong to one session; each session is credited its span plus
 * `leadMinutes` for the work before its first commit. Rounded to 5 minutes and
 * capped at 12h/day. This is an estimate and is always editable.
 */
export function estimateMinutes(timestamps: string[], gapMinutes: number, leadMinutes: number): number {
  if (!timestamps.length) return 0;
  const t = timestamps.map((x) => new Date(x).getTime()).sort((a, b) => a - b);
  let total = 0;
  let start = t[0];
  let prev = t[0];
  for (let i = 1; i <= t.length; i++) {
    const cur = t[i];
    if (cur === undefined || cur - prev > gapMinutes * 60_000) {
      total += (prev - start) / 60_000 + leadMinutes;
      start = cur;
    }
    prev = cur;
  }
  return Math.min(12 * 60, Math.max(5, Math.round(total / 5) * 5));
}

/* ----------------------------- Task matching ----------------------------- */

const STOP = new Set(
  "the and for with from into onto this that add adds added update updates updated fix fixes fixed make made use using new page task tasks implement implemented create created remove removed".split(
    " ",
  ),
);

export function keywords(text: string): string[] {
  return uniq(
    text
      .toLowerCase()
      .replace(/[^a-z0-9\s-]/g, " ")
      .split(/[\s-]+/)
      .filter((w) => w.length >= 3 && !STOP.has(w))
      .map((w) => w.replace(/(ing|ed|es|s)$/, "")),
  );
}

export interface TaskMatch {
  task: Task;
  score: number;
  evidence: string;
}

/**
 * Suggests open tasks your commits probably finished. Only a suggestion — the
 * hub never completes tasks on its own.
 */
export function matchTasks(subjects: string[], openTasks: Task[]): TaskMatch[] {
  const commitWords = subjects.map((s) => ({ s, words: new Set(keywords(s)) }));
  const out: TaskMatch[] = [];
  for (const task of openTasks) {
    const tw = keywords(task.title);
    if (!tw.length) continue;
    let best: TaskMatch | null = null;
    for (const c of commitWords) {
      const verbatim = c.s.toLowerCase().includes(task.title.toLowerCase());
      const hits = tw.filter((w) => c.words.has(w)).length;
      const score = verbatim ? 1 : hits / tw.length;
      const enough = verbatim || (hits >= 2 && score >= 0.6) || (tw.length === 1 && hits === 1 && c.words.size <= 4);
      if (enough && (!best || score > best.score)) best = { task, score, evidence: c.s };
    }
    if (best) out.push(best);
  }
  return out.sort((a, b) => b.score - a.score).slice(0, 5);
}

/* -------------------------------- Drafts --------------------------------- */

export interface Draft {
  /** `${date}|${projectKey}` — also the DraftDecision id. */
  key: string;
  date: ISODate;
  project: Project | null;
  /** Repos that contributed (for unlinked repos, exactly one). */
  repos: string[];
  events: TrackedEvent[];
  commits: TrackedEvent[];
  minutes: number;
  workedOn: string;
  completed: string;
  pending: string;
  taskMatches: TaskMatch[];
  decision: DraftDecision | null;
}

export function projectKey(project: Project | null, repo: string) {
  return project ? project.id : `repo:${repo}`;
}

export function buildDrafts(args: {
  events: TrackedEvent[];
  projects: Project[];
  tasks: Task[];
  decisions: DraftDecision[];
  settings: Pick<Settings, "timezone" | "repoLinks" | "sessionGapMinutes" | "sessionLeadMinutes">;
  from?: ISODate;
  to?: ISODate;
}): Draft[] {
  const { events, projects, tasks, decisions, settings } = args;
  const resolve = buildRepoResolver(projects, settings.repoLinks);
  const decided = new Map(decisions.map((d) => [d.id, d]));
  const groups = new Map<string, { date: ISODate; project: Project | null; repos: Set<string>; events: TrackedEvent[] }>();

  for (const e of events) {
    const date = dateInTz(e.occurredAt, settings.timezone);
    if ((args.from && date < args.from) || (args.to && date > args.to)) continue;
    const project = resolve(e.repo);
    if (project?.status === "archived") continue;
    const key = `${date}|${projectKey(project, e.repo)}`;
    let g = groups.get(key);
    if (!g) {
      g = { date, project, repos: new Set(), events: [] };
      groups.set(key, g);
    }
    g.repos.add(e.repo);
    g.events.push(e);
  }

  const drafts: Draft[] = [];
  for (const [key, g] of groups) {
    const evs = g.events.sort((a, b) => a.occurredAt.localeCompare(b.occurredAt));
    const commits = evs.filter((e) => e.kind === "commit");
    const meaningful = commits.filter((c) => !isNoiseCommit(c.title));
    const subjects = uniq((meaningful.length ? meaningful : commits).map((c) => cleanSubject(c.title)));
    const merged = evs.filter((e) => e.kind === "pr_merged");
    const opened = evs.filter((e) => e.kind === "pr_opened" && !merged.some((m) => m.number === e.number && m.repo === e.repo));
    const repoName = [...g.repos].map((r) => r.split("/")[1]).join(", ");

    let workedOn: string;
    if (subjects.length === 1) workedOn = subjects[0];
    else if (subjects.length > 1) workedOn = `${subjects.slice(0, 3).join("; ")}${subjects.length > 3 ? ` (+${subjects.length - 3} more)` : ""}`;
    else if (merged.length) workedOn = `Merged ${merged.map((m) => `PR #${m.number}`).join(", ")} in ${repoName}`;
    else workedOn = `Opened ${opened.map((m) => `PR #${m.number}`).join(", ")} in ${repoName}`;

    const completed = uniq([...subjects, ...merged.map((m) => `Merged PR #${m.number}: ${cleanSubject(m.title)}`)]).slice(0, 12).join("\n");
    const pending = opened.map((o) => `PR #${o.number} open for review: ${cleanSubject(o.title)}`).join("\n");

    // Time comes from commit timing; PR events count as activity points too.
    const minutes = estimateMinutes(
      evs.map((e) => e.occurredAt),
      settings.sessionGapMinutes,
      settings.sessionLeadMinutes,
    );

    const openTasks = g.project ? tasks.filter((t) => t.projectId === g.project!.id && t.status !== "done") : [];
    drafts.push({
      key,
      date: g.date,
      project: g.project,
      repos: [...g.repos],
      events: evs,
      commits,
      minutes,
      workedOn,
      completed,
      pending,
      taskMatches: matchTasks([...subjects, ...merged.map((m) => m.title)], openTasks),
      decision: decided.get(key) ?? null,
    });
  }
  return drafts.sort((a, b) => b.date.localeCompare(a.date) || b.minutes - a.minutes);
}

/** Repos with activity that aren't linked to any project yet. */
export function unlinkedRepos(events: TrackedEvent[], projects: Project[], links: Record<string, string>) {
  const resolve = buildRepoResolver(projects, links);
  const counts = new Map<string, { repo: string; events: number; last: string }>();
  for (const e of events) {
    if (resolve(e.repo)) continue;
    const c = counts.get(e.repo) ?? { repo: e.repo, events: 0, last: e.occurredAt };
    c.events += 1;
    if (e.occurredAt > c.last) c.last = e.occurredAt;
    counts.set(e.repo, c);
  }
  return [...counts.values()].sort((a, b) => b.last.localeCompare(a.last));
}
