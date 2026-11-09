import { categoryLabel, priorityMeta } from "./constants";
import { addDays, dateInTz, fmtLong, fmtMedium, fmtShort, rangeDays, todayIn } from "./dates";
import { completedOn, dailySeries, isOverdue, isTaskOpen, projectProgress, rankFocus, timeByProject } from "./insights";
import type { CheckIn, ISODate, Milestone, Project, ReportStats, Settings, Task, WorkLog } from "./types";
import { fmtMinutes, pluralize, toBullets } from "./utils";

/**
 * Built-in report writer. Turns raw logs, tasks and check-in answers into a
 * professional Markdown report. Runs fully in the browser — no network, no keys.
 */

export interface Dataset {
  projects: Project[];
  tasks: Task[];
  logs: WorkLog[];
  milestones: Milestone[];
}

export interface GeneratedReport {
  title: string;
  content: string;
  stats: ReportStats;
}

const uniq = (xs: string[]) => {
  const seen = new Set<string>();
  return xs.filter((x) => {
    const k = x.toLowerCase().replace(/[^\w]+/g, " ").trim();
    if (!k || seen.has(k)) return false;
    seen.add(k);
    return true;
  });
};

const sentence = (s: string) => {
  const t = s.trim().replace(/\s+/g, " ");
  if (!t) return t;
  const cap = t[0].toUpperCase() + t.slice(1);
  return /[.!?]$/.test(cap) ? cap : cap + ".";
};

const bullet = (s: string) => `- ${sentence(s)}`;

function joinNames(names: string[]) {
  if (names.length <= 1) return names[0] ?? "";
  return `${names.slice(0, -1).join(", ")} and ${names[names.length - 1]}`;
}

function pct(part: number, total: number) {
  return total ? Math.round((part / total) * 100) : 0;
}

/* -------------------------------------------------------------------------- */
/*                                Daily report                                */
/* -------------------------------------------------------------------------- */

export function generateDailyReport(date: ISODate, data: Dataset, settings: Settings, checkIn?: CheckIn | null): GeneratedReport {
  const tz = settings.timezone;
  const detailed = settings.summaryStyle === "detailed";
  const pmap = new Map(data.projects.map((p) => [p.id, p]));
  const pname = (id: string | null) => (id ? (pmap.get(id)?.name ?? "Deleted project") : "General");

  const logs = data.logs.filter((l) => l.date === date).sort((a, b) => a.createdAt.localeCompare(b.createdAt));
  const doneTasks = data.tasks.filter((t) => t.status === "done" && completedOn(t, tz) === date);
  const milestonesDone = data.milestones.filter((m) => m.completedAt && dateInTz(m.completedAt, tz) === date);
  const minutes = logs.reduce((s, l) => s + l.minutes, 0);
  const byProject = timeByProject(logs, data.projects);
  const touchedIds = new Set<string>([
    ...logs.map((l) => l.projectId ?? "__none"),
    ...doneTasks.map((t) => t.projectId ?? "__none"),
  ]);
  const projectsTouched = [...touchedIds].filter((id) => id !== "__none").length;

  const inProgress = data.tasks.filter((t) => t.status === "in_progress" || t.status === "review");
  const overdue = data.tasks.filter((t) => isOverdue(t, date));
  const dueTodayOpen = data.tasks.filter((t) => isTaskOpen(t) && t.dueDate === date);

  const accomplishments = uniq([
    ...logs.flatMap((l) => toBullets(l.completed)),
    ...(checkIn ? toBullets(checkIn.completed) : []),
  ]);
  const challenges = uniq([...logs.flatMap((l) => toBullets(l.challenges)), ...(checkIn ? toBullets(checkIn.challenges) : [])]);
  const pendingText = uniq([...logs.flatMap((l) => toBullets(l.pending)), ...(checkIn ? toBullets(checkIn.pending) : [])]);
  const nextText = uniq([...logs.flatMap((l) => toBullets(l.nextSteps)), ...(checkIn ? toBullets(checkIn.tomorrow) : [])]);
  const workedText = uniq([...logs.map((l) => l.workedOn), ...(checkIn ? toBullets(checkIn.workedOn) : [])]);

  const stats: ReportStats = { minutes, logCount: logs.length, tasksCompleted: doneTasks.length, projectsTouched, milestonesCompleted: milestonesDone.length };
  const title = `Daily Report — ${fmtShort(date)}`;
  const L: string[] = [];

  L.push(`# ${title}`);
  L.push(`*${settings.displayName} · ${settings.role} · ${fmtLong(date)}*`);
  L.push("");

  // Executive summary
  L.push("## Summary");
  const nothing = !logs.length && !doneTasks.length && !workedText.length && !accomplishments.length;
  if (nothing) {
    L.push("No work was logged and no tasks were completed on this day. Add a work log entry or complete the daily check-in to build a full report.");
  } else {
    const parts: string[] = [];
    if (minutes) parts.push(`logged **${fmtMinutes(minutes)}** of focused work`);
    const named = byProject.filter((p) => p.projectId);
    if (named.length) parts.push(`across ${pluralize(named.length, "project")} (${joinNames(named.map((p) => p.name))})${named.length < byProject.length ? " plus general work" : ""}`);
    else if (byProject.length) parts.push("on general work not tied to a project");
    let first = parts.length ? `Today I ${parts.join(" ")}` : "Today I made progress on my work";
    if (doneTasks.length) first += `, closing out ${pluralize(doneTasks.length, "task")}`;
    if (milestonesDone.length) first += ` and reaching ${pluralize(milestonesDone.length, "milestone")}`;
    L.push(sentence(first));
    if (byProject[0] && byProject.length > 1 && minutes) {
      L.push(
        `The main focus was **${byProject[0].name}**, which took ${fmtMinutes(byProject[0].minutes)} (${pct(byProject[0].minutes, minutes)}% of logged time).`,
      );
    }
    if (challenges.length) L.push(`${pluralize(challenges.length, "challenge")} came up and ${challenges.length === 1 ? "is" : "are"} noted below.`);
  }
  L.push("");

  if (settings.summaryIncludeStats && !nothing) {
    L.push("## At a glance");
    L.push(`- **Time logged:** ${fmtMinutes(minutes)} in ${pluralize(logs.length, "entry", "entries")}`);
    L.push(`- **Tasks completed:** ${doneTasks.length}`);
    L.push(`- **Projects touched:** ${projectsTouched}`);
    if (milestonesDone.length) L.push(`- **Milestones reached:** ${milestonesDone.length}`);
    L.push("");
  }

  if (accomplishments.length || doneTasks.length || milestonesDone.length) {
    L.push("## What I accomplished");
    for (const m of milestonesDone) L.push(`- Reached milestone **${m.title}** (${pname(m.projectId)}).`);
    for (const t of doneTasks) L.push(`- Completed **${t.title}**${t.projectId ? ` — ${pname(t.projectId)}` : ""}${t.actualMinutes ? ` (${fmtMinutes(t.actualMinutes)})` : ""}.`);
    for (const a of accomplishments) L.push(bullet(a));
    L.push("");
  }

  if (byProject.length || workedText.length) {
    L.push("## Projects worked on");
    if (byProject.length) {
      for (const p of byProject) {
        const entries = logs.filter((l) => (l.projectId ?? null) === p.projectId);
        const what = entries.map((e) => e.workedOn.trim()).filter(Boolean);
        const proj = p.projectId ? pmap.get(p.projectId) : undefined;
        const prog = proj ? ` · ${projectProgress(proj, data.tasks)}% complete` : "";
        L.push(`### ${p.name} — ${fmtMinutes(p.minutes)}${prog}`);
        if (detailed) for (const w of what) L.push(bullet(w));
        else if (what.length) L.push(sentence(what.join("; ")));
      }
    } else {
      for (const w of workedText) L.push(bullet(w));
    }
    L.push("");
  }

  if (challenges.length) {
    L.push("## Challenges");
    for (const c of challenges) L.push(bullet(c));
    L.push("");
  }

  const openCarry = uniq([
    ...pendingText,
    ...(detailed ? inProgress.map((t) => `${t.title} (${t.status === "review" ? "in review" : "in progress"}${t.projectId ? `, ${pname(t.projectId)}` : ""})`) : []),
    ...dueTodayOpen.map((t) => `${t.title} — was due today`),
  ]);
  if (openCarry.length || overdue.length) {
    L.push("## Unfinished work");
    for (const p of openCarry) L.push(bullet(p));
    if (overdue.length) L.push(`- **${pluralize(overdue.length, "task")} overdue:** ${overdue.slice(0, 5).map((t) => t.title).join(", ")}${overdue.length > 5 ? "…" : ""}.`);
    L.push("");
  }

  // Tomorrow: user-stated plans first, then algorithmic picks for tomorrow.
  const tomorrow = addDays(date, 1);
  const focus = rankFocus(data.tasks, data.projects, tomorrow, 5);
  const recs = uniq([...nextText, ...focus.map((f) => `${f.task.title}${f.project ? ` (${f.project.name})` : ""} — ${f.reasons[0] ?? priorityMeta(f.task.priority).label + " priority"}`)]).slice(0, 6);
  L.push("## Priorities for tomorrow");
  if (recs.length) recs.forEach((r, i) => L.push(`${i + 1}. ${sentence(r)}`));
  else L.push("No open tasks are scheduled. Plan tomorrow by adding tasks with due dates or priorities.");

  return { title, content: L.join("\n").trim() + "\n", stats };
}

/* -------------------------------------------------------------------------- */
/*                                Weekly report                               */
/* -------------------------------------------------------------------------- */

/** Reference date for "overdue"/priority ranking: today for the current week, else the day after the week. */
export function refDate(weekEnd: ISODate, tz: string): ISODate {
  const nextStart = addDays(weekEnd, 1);
  const today = todayIn(tz);
  return today < nextStart ? today : nextStart;
}

export interface WeeklyData {
  start: ISODate;
  end: ISODate;
  logs: WorkLog[];
  tasksCompleted: Task[];
  milestonesDone: Milestone[];
  series: ReturnType<typeof dailySeries>;
  byProject: ReturnType<typeof timeByProject>;
  minutes: number;
  activeDays: number;
  pending: Task[];
  nextWeek: Task[];
  overdue: Task[];
  projectsWorked: Project[];
  challenges: string[];
  achievements: string[];
  nextSteps: string[];
}

export function buildWeeklyData(start: ISODate, data: Dataset, settings: Settings): WeeklyData {
  const tz = settings.timezone;
  const end = addDays(start, 6);
  const logs = data.logs.filter((l) => l.date >= start && l.date <= end);
  const tasksCompleted = data.tasks.filter((t) => {
    const d = completedOn(t, tz);
    return t.status === "done" && !!d && d >= start && d <= end;
  });
  const milestonesDone = data.milestones.filter((m) => {
    if (!m.completedAt) return false;
    const d = dateInTz(m.completedAt, tz);
    return d >= start && d <= end;
  });
  const series = dailySeries(start, end, logs, data.tasks, tz);
  const byProject = timeByProject(logs, data.projects);
  const minutes = logs.reduce((s, l) => s + l.minutes, 0);
  const activeDays = series.filter((d) => d.minutes > 0 || d.tasksCompleted > 0).length;
  const workedIds = new Set([...logs.map((l) => l.projectId), ...tasksCompleted.map((t) => t.projectId)].filter(Boolean) as string[]);
  const projectsWorked = data.projects.filter((p) => workedIds.has(p.id));
  const liveProject = (id: string | null) => {
    const p = id ? data.projects.find((x) => x.id === id) : null;
    return !p || (p.status !== "archived" && p.status !== "completed");
  };
  const pending = data.tasks.filter((t) => isTaskOpen(t) && liveProject(t.projectId) && (t.status !== "todo" || (t.dueDate && t.dueDate <= end)));
  const nextStart = addDays(end, 1);
  const nextEnd = addDays(end, 7);
  const nextWeek = data.tasks.filter(
    (t) => isTaskOpen(t) && liveProject(t.projectId) && ((t.dueDate && t.dueDate >= nextStart && t.dueDate <= nextEnd) || (t.scheduledDate && t.scheduledDate >= nextStart && t.scheduledDate <= nextEnd)),
  );
  // For the current week, "overdue" and priorities are judged as of today, not next Monday.
  const ref = refDate(end, tz);
  const overdue = data.tasks.filter((t) => isOverdue(t, ref));
  const ordered = [...logs].sort((a, b) => b.date.localeCompare(a.date) || b.createdAt.localeCompare(a.createdAt));
  return {
    start,
    end,
    logs,
    tasksCompleted,
    milestonesDone,
    series,
    byProject,
    minutes,
    activeDays,
    pending,
    nextWeek,
    overdue,
    projectsWorked,
    challenges: uniq(logs.flatMap((l) => toBullets(l.challenges))),
    achievements: uniq(logs.flatMap((l) => toBullets(l.completed))),
    nextSteps: uniq(ordered.flatMap((l) => toBullets(l.nextSteps))),
  };
}

export function generateWeeklyReport(start: ISODate, data: Dataset, settings: Settings): GeneratedReport {
  const w = buildWeeklyData(start, data, settings);
  const detailed = settings.summaryStyle === "detailed";
  const pmap = new Map(data.projects.map((p) => [p.id, p]));
  const pname = (id: string | null) => (id ? (pmap.get(id)?.name ?? "Deleted project") : "General");
  const title = `Weekly Report — ${fmtMedium(w.start)} to ${fmtMedium(w.end)}`;
  const stats: ReportStats = {
    minutes: w.minutes,
    logCount: w.logs.length,
    tasksCompleted: w.tasksCompleted.length,
    projectsTouched: w.projectsWorked.length,
    milestonesCompleted: w.milestonesDone.length,
    activeDays: w.activeDays,
  };
  const L: string[] = [];
  L.push(`# ${title}`);
  L.push(`*${settings.displayName} · ${settings.role}*`);
  L.push("");
  L.push("## Executive summary");
  if (!w.logs.length && !w.tasksCompleted.length) {
    L.push("No work logs or completed tasks were recorded this week.");
  } else {
    const best = [...w.series].sort((a, b) => b.minutes - a.minutes)[0];
    L.push(
      sentence(
        `This week I logged **${fmtMinutes(w.minutes)}** over ${pluralize(w.activeDays, "active day")}, completed **${pluralize(w.tasksCompleted.length, "task")}**` +
          (w.milestonesDone.length ? ` and reached ${pluralize(w.milestonesDone.length, "milestone")}` : "") +
          (w.byProject.some((p) => p.projectId) ? `, working across ${joinNames(w.byProject.filter((p) => p.projectId).map((p) => p.name))}` : ""),
      ),
    );
    if (w.byProject[0] && w.minutes) {
      L.push(`**${w.byProject[0].name}** received the most attention at ${fmtMinutes(w.byProject[0].minutes)} (${pct(w.byProject[0].minutes, w.minutes)}% of logged time).`);
    }
    if (best && best.minutes) L.push(`The most productive day was ${fmtShort(best.date)} with ${fmtMinutes(best.minutes)} logged.`);
    if (w.activeDays) L.push(`Average: ${fmtMinutes(Math.round(w.minutes / w.activeDays))} per active day.`);
  }
  L.push("");

  if (settings.summaryIncludeStats) {
    L.push("## Key numbers");
    L.push(`- **Hours logged:** ${fmtMinutes(w.minutes)}`);
    L.push(`- **Tasks completed:** ${w.tasksCompleted.length}`);
    L.push(`- **Projects worked on:** ${w.projectsWorked.length}`);
    L.push(`- **Work log entries:** ${w.logs.length}`);
    L.push(`- **Milestones reached:** ${w.milestonesDone.length}`);
    L.push("");
  }

  if (w.byProject.length) {
    L.push("## Projects worked on");
    for (const p of w.byProject) {
      const proj = p.projectId ? pmap.get(p.projectId) : undefined;
      const done = w.tasksCompleted.filter((t) => t.projectId === p.projectId).length;
      L.push(
        `- **${p.name}** — ${fmtMinutes(p.minutes)}, ${pluralize(p.logs, "session")}${done ? `, ${pluralize(done, "task")} done` : ""}${proj ? ` · ${projectProgress(proj, data.tasks)}% complete · ${categoryLabel(proj.category)}` : ""}`,
      );
    }
    L.push("");
  }

  L.push("## Daily activity");
  for (const d of w.series) {
    const dayLogs = w.logs.filter((l) => l.date === d.date);
    const topics = uniq(dayLogs.map((l) => l.workedOn)).slice(0, detailed ? 3 : 1);
    L.push(
      `- **${fmtShort(d.date)}:** ${d.minutes || d.tasksCompleted ? `${fmtMinutes(d.minutes)}, ${pluralize(d.tasksCompleted, "task")} done` : "No activity logged"}${topics.length ? ` — ${topics.join("; ")}` : ""}`,
    );
  }
  L.push("");

  if (w.tasksCompleted.length || w.milestonesDone.length || w.achievements.length) {
    L.push("## Achievements");
    for (const m of w.milestonesDone) L.push(`- Reached milestone **${m.title}** (${pname(m.projectId)}).`);
    for (const t of w.tasksCompleted.slice(0, detailed ? 30 : 12)) L.push(`- Completed **${t.title}**${t.projectId ? ` — ${pname(t.projectId)}` : ""}.`);
    for (const a of w.achievements.slice(0, detailed ? 15 : 6)) L.push(bullet(a));
    L.push("");
  }

  if (w.challenges.length) {
    L.push("## Challenges");
    for (const c of w.challenges.slice(0, 10)) L.push(bullet(c));
    L.push("");
  }

  if (w.pending.length || w.overdue.length) {
    L.push("## Pending work");
    for (const t of w.pending.slice(0, detailed ? 15 : 8))
      L.push(`- ${t.title}${t.projectId ? ` (${pname(t.projectId)})` : ""} — ${t.status === "todo" ? "to do" : t.status === "review" ? "in review" : "in progress"}${t.dueDate ? `, due ${fmtShort(t.dueDate)}` : ""}.`);
    if (w.overdue.length) L.push(`- **${pluralize(w.overdue.length, "task")} overdue** going into next week.`);
    L.push("");
  }

  L.push("## Priorities for next week");
  const nextStart = addDays(w.end, 1);
  const picks = uniq([
    ...w.overdue.slice(0, 3).map((t) => `Clear overdue: ${t.title}${t.projectId ? ` (${pname(t.projectId)})` : ""}`),
    ...rankFocus(data.tasks, data.projects, refDate(w.end, settings.timezone), 5).map((f) => `${f.task.title}${f.project ? ` (${f.project.name})` : ""}${f.task.dueDate ? ` — due ${fmtShort(f.task.dueDate)}` : ""}`),
    ...w.nextSteps.slice(0, 3),
  ]).slice(0, 7);
  const deadlines = data.projects.filter((p) => p.deadline && p.deadline >= nextStart && p.deadline <= addDays(nextStart, 6) && p.status !== "archived" && p.status !== "completed");
  if (picks.length) picks.forEach((p, i) => L.push(`${i + 1}. ${sentence(p)}`));
  else L.push("No open tasks are planned yet — add tasks with due dates to shape next week.");
  if (deadlines.length) L.push(`\n**Project deadlines next week:** ${deadlines.map((p) => `${p.name} (${fmtShort(p.deadline!)})`).join(", ")}.`);

  return { title, content: L.join("\n").trim() + "\n", stats };
}

/** Days of a week for display. */
export const weekDays = (start: ISODate) => rangeDays(start, addDays(start, 6));
