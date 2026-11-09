import { describe, expect, it } from "vitest";
import { buildDrafts, cleanSubject, estimateMinutes, isNoiseCommit, matchTasks, repoFromUrl, unlinkedRepos } from "./drafts";
import type { DraftDecision, Project, Task, TrackedEvent } from "../types";

const project = (over: Partial<Project> = {}): Project => ({
  id: "p1",
  name: "Invoicely",
  description: "",
  category: "saas",
  status: "in_progress",
  archivedFrom: null,
  priority: "high",
  startDate: null,
  deadline: null,
  progress: 0,
  progressMode: "tasks",
  projectUrl: "",
  repoUrl: "https://github.com/Code-With-Fred/Invoicely",
  technologies: [],
  notes: "",
  createdAt: "2026-11-01T00:00:00Z",
  updatedAt: "2026-11-01T00:00:00Z",
  ...over,
});

const task = (title: string, over: Partial<Task> = {}): Task => ({
  id: title,
  title,
  description: "",
  projectId: "p1",
  priority: "medium",
  status: "todo",
  dueDate: null,
  scheduledDate: null,
  estimatedMinutes: null,
  actualMinutes: null,
  order: 0,
  completedAt: null,
  createdAt: "2026-11-01T00:00:00Z",
  updatedAt: "2026-11-01T00:00:00Z",
  ...over,
});

const commit = (at: string, title: string, repo = "code-with-fred/invoicely"): TrackedEvent => ({
  id: `gh:commit:${at}${title}`,
  source: "github",
  kind: "commit",
  repo,
  title,
  body: "",
  url: "https://github.com/x",
  occurredAt: at,
});

const settings = { timezone: "Africa/Lagos", repoLinks: {}, sessionGapMinutes: 120, sessionLeadMinutes: 30 };

describe("repoFromUrl", () => {
  it("normalises GitHub URLs", () => {
    expect(repoFromUrl("https://github.com/Code-With-Fred/Kanban.git")).toBe("code-with-fred/kanban");
    expect(repoFromUrl("https://github.com/a/b/tree/main/src")).toBe("a/b");
    expect(repoFromUrl("git@github.com:a/b.git")).toBe("a/b");
    expect(repoFromUrl("https://gitlab.com/a/b")).toBeNull();
    expect(repoFromUrl("")).toBeNull();
  });
});

describe("cleanSubject / isNoiseCommit", () => {
  it("strips conventional-commit prefixes and capitalises", () => {
    expect(cleanSubject("feat(auth): add login rate limit\n\nbody")).toBe("Add login rate limit");
    expect(cleanSubject("fix!: crash on empty invoice")).toBe("Crash on empty invoice");
  });
  it("flags merge and throwaway commits", () => {
    expect(isNoiseCommit("Merge pull request #12 from a/b")).toBe(true);
    expect(isNoiseCommit("wip")).toBe(true);
    expect(isNoiseCommit("Add recurring invoices")).toBe(false);
  });
});

describe("estimateMinutes", () => {
  it("credits lead time for a single commit", () => {
    expect(estimateMinutes(["2026-11-09T10:00:00Z"], 120, 30)).toBe(30);
  });
  it("sums one continuous session", () => {
    // 10:00 → 11:30 span (90m) + 30m lead
    expect(estimateMinutes(["2026-11-09T10:00:00Z", "2026-11-09T10:45:00Z", "2026-11-09T11:30:00Z"], 120, 30)).toBe(120);
  });
  it("splits sessions on long gaps", () => {
    // Session A: 09:00–10:00 (60+30). Session B: 15:00 alone (30). Total 120.
    expect(estimateMinutes(["2026-11-09T09:00:00Z", "2026-11-09T10:00:00Z", "2026-11-09T15:00:00Z"], 120, 30)).toBe(120);
  });
  it("is order-independent and capped at 12h", () => {
    expect(estimateMinutes(["2026-11-09T11:30:00Z", "2026-11-09T10:00:00Z"], 120, 30)).toBe(120);
    const many = Array.from({ length: 30 }, (_, i) => new Date(Date.UTC(2026, 10, 9, 0, i * 60)).toISOString());
    expect(estimateMinutes(many, 120, 30)).toBe(720);
  });
  it("returns 0 for no activity", () => {
    expect(estimateMinutes([], 120, 30)).toBe(0);
  });
});

describe("matchTasks", () => {
  const open = [task("Recurring invoice scheduler"), task("Verify Paystack webhook signatures"), task("Write landing page copy")];
  it("matches by keyword overlap", () => {
    const m = matchTasks(["Add recurring invoice scheduler cron"], open);
    expect(m.map((x) => x.task.title)).toEqual(["Recurring invoice scheduler"]);
  });
  it("matches verbatim titles with full confidence", () => {
    const m = matchTasks(["Verify Paystack webhook signatures (closes #4)"], open);
    expect(m[0].score).toBe(1);
  });
  it("does not match on a single shared word", () => {
    expect(matchTasks(["Fix invoice total rounding"], open)).toEqual([]);
  });
});

describe("buildDrafts", () => {
  it("groups by project and day in the configured timezone", () => {
    // 23:30 UTC on the 8th is 00:30 on the 9th in Lagos (UTC+1).
    const events = [commit("2026-11-08T23:30:00Z", "feat: add PDF export"), commit("2026-11-09T09:00:00Z", "fix: totals"), commit("2026-11-08T10:00:00Z", "chore: deps")];
    const drafts = buildDrafts({ events, projects: [project()], tasks: [], decisions: [], settings });
    expect(drafts.map((d) => [d.date, d.commits.length])).toEqual([
      ["2026-11-09", 2],
      ["2026-11-08", 1],
    ]);
    expect(drafts[0].project?.id).toBe("p1");
    expect(drafts[0].workedOn).toBe("Add PDF export; Totals");
  });

  it("keeps unlinked repos separate and respects explicit links", () => {
    const events = [commit("2026-11-09T09:00:00Z", "init", "code-with-fred/new-thing")];
    const unlinked = buildDrafts({ events, projects: [project()], tasks: [], decisions: [], settings });
    expect(unlinked[0].project).toBeNull();
    expect(unlinked[0].key).toBe("2026-11-09|repo:code-with-fred/new-thing");
    expect(unlinkedRepos(events, [project()], {})).toHaveLength(1);

    const linked = buildDrafts({ events, projects: [project()], tasks: [], decisions: [], settings: { ...settings, repoLinks: { "code-with-fred/new-thing": "p1" } } });
    expect(linked[0].project?.id).toBe("p1");
  });

  it("attaches decisions, skips archived projects and suggests matching tasks", () => {
    const events = [commit("2026-11-09T09:00:00Z", "feat: recurring invoice scheduler")];
    const decisions: DraftDecision[] = [{ id: "2026-11-09|p1", status: "dismissed", logId: null, decidedAt: "2026-11-09T20:00:00Z" }];
    const [d] = buildDrafts({ events, projects: [project()], tasks: [task("Recurring invoice scheduler")], decisions, settings });
    expect(d.decision?.status).toBe("dismissed");
    expect(d.taskMatches[0].task.title).toBe("Recurring invoice scheduler");

    const archived = buildDrafts({ events, projects: [project({ status: "archived" })], tasks: [], decisions: [], settings });
    expect(archived).toEqual([]);
  });

  it("describes PR activity and lists open PRs as pending", () => {
    const pr = (kind: TrackedEvent["kind"], at: string): TrackedEvent => ({
      ...commit(at, "Add client portal"),
      id: `pr-${kind}`,
      kind,
      number: 7,
    });
    const [d] = buildDrafts({ events: [pr("pr_opened", "2026-11-09T09:00:00Z")], projects: [project()], tasks: [], decisions: [], settings });
    expect(d.workedOn).toBe("Opened PR #7 in invoicely");
    expect(d.pending).toContain("PR #7 open for review");
  });
});
