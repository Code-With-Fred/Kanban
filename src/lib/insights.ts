import { ACTIVE_PROJECT_STATUSES, PRIORITIES, priorityMeta } from "./constants";
import { addDays, dateInTz, diffDays, rangeDays } from "./dates";
import type { ISODate, Milestone, Priority, Project, Task, WorkLog } from "./types";

/* ------------------------------- Progress -------------------------------- */

/**
 * Progress is never changed behind your back:
 *  - "manual": exactly what you set.
 *  - "tasks": done tasks / all tasks for the project (clearly defined rule, computed live).
 */
export function projectProgress(project: Project, tasks: Task[]): number {
  if (project.progressMode === "manual") return project.progress;
  const mine = tasks.filter((t) => t.projectId === project.id);
  if (!mine.length) return 0;
  return Math.round((mine.filter((t) => t.status === "done").length / mine.length) * 100);
}

export const isTaskOpen = (t: Task) => t.status !== "done";

export function isOverdue(t: Task, today: ISODate) {
  return isTaskOpen(t) && !!t.dueDate && t.dueDate < today;
}

export function completedOn(t: Task, tz: string): ISODate | null {
  return t.completedAt ? dateInTz(t.completedAt, tz) : null;
}

/* ---------------------------- Today's Focus ------------------------------ */

export interface FocusItem {
  task: Task;
  project: Project | null;
  score: number;
  reasons: string[];
}

const PRIORITY_WEIGHT: Record<Priority, number> = Object.fromEntries(PRIORITIES.map((p) => [p.value, p.weight])) as Record<
  Priority,
  number
>;

/**
 * Ranks open tasks by urgency + importance. Deterministic and explainable:
 * every point of score maps to a visible reason.
 */
export function rankFocus(tasks: Task[], projects: Project[], today: ISODate, limit = 3): FocusItem[] {
  const pmap = new Map(projects.map((p) => [p.id, p]));
  const items: FocusItem[] = [];
  for (const t of tasks) {
    if (!isTaskOpen(t)) continue;
    const project = t.projectId ? (pmap.get(t.projectId) ?? null) : null;
    if (project && (project.status === "archived" || project.status === "completed")) continue;

    let score = PRIORITY_WEIGHT[t.priority];
    const reasons: string[] = [];
    if (t.priority === "urgent" || t.priority === "high") reasons.push(`${priorityMeta(t.priority).label} priority`);

    if (t.dueDate) {
      const d = diffDays(t.dueDate, today);
      if (d < 0) {
        score += 55 + Math.min(30, -d * 4);
        reasons.unshift(`Overdue by ${-d} day${d === -1 ? "" : "s"}`);
      } else if (d === 0) {
        score += 50;
        reasons.unshift("Due today");
      } else if (d === 1) {
        score += 34;
        reasons.unshift("Due tomorrow");
      } else if (d <= 3) {
        score += 24;
        reasons.unshift(`Due in ${d} days`);
      } else if (d <= 7) {
        score += 12;
        reasons.push(`Due in ${d} days`);
      }
    }
    if (t.scheduledDate) {
      if (t.scheduledDate === today) {
        score += 26;
        reasons.push("Scheduled for today");
      } else if (t.scheduledDate < today) {
        score += 14;
        reasons.push("Carried over");
      }
    }
    if (t.status === "in_progress") {
      score += 14;
      reasons.push("Already in progress");
    } else if (t.status === "review") {
      score += 10;
      reasons.push("Waiting on review");
    }
    if (project) {
      score += PRIORITY_WEIGHT[project.priority] / 2;
      if (project.status === "on_hold") score -= 25;
      if (project.deadline) {
        const pd = diffDays(project.deadline, today);
        if (pd >= 0 && pd <= 7) {
          score += 10;
          reasons.push(`${project.name} deadline ${pd === 0 ? "today" : `in ${pd}d`}`);
        }
      }
    }
    items.push({ task: t, project, score, reasons: reasons.slice(0, 3) });
  }
  return items.sort((a, b) => b.score - a.score || (a.task.dueDate ?? "9").localeCompare(b.task.dueDate ?? "9")).slice(0, limit);
}

/* ------------------------------ Deadlines -------------------------------- */

export interface DeadlineItem {
  kind: "project" | "task" | "milestone";
  id: string;
  title: string;
  date: ISODate;
  projectId: string | null;
  projectName?: string;
  priority?: Priority;
}

export function upcomingDeadlines(
  projects: Project[],
  tasks: Task[],
  milestones: Milestone[],
  today: ISODate,
  days = 14,
): DeadlineItem[] {
  const end = addDays(today, days);
  const pmap = new Map(projects.map((p) => [p.id, p]));
  const live = (pid: string | null) => {
    const p = pid ? pmap.get(pid) : null;
    return !p || (p.status !== "archived" && p.status !== "completed");
  };
  const out: DeadlineItem[] = [];
  for (const p of projects) {
    if (p.deadline && p.deadline >= today && p.deadline <= end && live(p.id))
      out.push({ kind: "project", id: p.id, title: p.name, date: p.deadline, projectId: p.id, priority: p.priority });
  }
  for (const t of tasks) {
    if (isTaskOpen(t) && t.dueDate && t.dueDate >= today && t.dueDate <= end && live(t.projectId))
      out.push({
        kind: "task",
        id: t.id,
        title: t.title,
        date: t.dueDate,
        projectId: t.projectId,
        projectName: t.projectId ? pmap.get(t.projectId)?.name : undefined,
        priority: t.priority,
      });
  }
  for (const m of milestones) {
    if (!m.completedAt && m.dueDate && m.dueDate >= today && m.dueDate <= end && live(m.projectId))
      out.push({ kind: "milestone", id: m.id, title: m.title, date: m.dueDate, projectId: m.projectId, projectName: pmap.get(m.projectId)?.name });
  }
  return out.sort((a, b) => a.date.localeCompare(b.date));
}

/* ------------------------------ Aggregates ------------------------------- */

export interface DayStat {
  date: ISODate;
  minutes: number;
  tasksCompleted: number;
  logs: number;
}

export function dailySeries(start: ISODate, end: ISODate, logs: WorkLog[], tasks: Task[], tz: string): DayStat[] {
  const days = rangeDays(start, end);
  const map = new Map<string, DayStat>(days.map((d) => [d, { date: d, minutes: 0, tasksCompleted: 0, logs: 0 }]));
  for (const l of logs) {
    const s = map.get(l.date);
    if (s) {
      s.minutes += l.minutes;
      s.logs += 1;
    }
  }
  for (const t of tasks) {
    const d = completedOn(t, tz);
    if (t.status === "done" && d) {
      const s = map.get(d);
      if (s) s.tasksCompleted += 1;
    }
  }
  return days.map((d) => map.get(d)!);
}

export interface ProjectTime {
  projectId: string | null;
  name: string;
  minutes: number;
  logs: number;
}

export function timeByProject(logs: WorkLog[], projects: Project[]): ProjectTime[] {
  const pmap = new Map(projects.map((p) => [p.id, p]));
  const acc = new Map<string, ProjectTime>();
  for (const l of logs) {
    const key = l.projectId ?? "__none";
    const cur = acc.get(key) ?? {
      projectId: l.projectId,
      name: l.projectId ? (pmap.get(l.projectId)?.name ?? "Deleted project") : "General",
      minutes: 0,
      logs: 0,
    };
    cur.minutes += l.minutes;
    cur.logs += 1;
    acc.set(key, cur);
  }
  return [...acc.values()].sort((a, b) => b.minutes - a.minutes);
}

export function projectCounts(projects: Project[]) {
  return {
    total: projects.filter((p) => p.status !== "archived").length,
    active: projects.filter((p) => ACTIVE_PROJECT_STATUSES.includes(p.status)).length,
    inProgress: projects.filter((p) => p.status === "in_progress").length,
    completed: projects.filter((p) => p.status === "completed").length,
    onHold: projects.filter((p) => p.status === "on_hold").length,
    archived: projects.filter((p) => p.status === "archived").length,
  };
}

/** Most recent "touch" on a project: its own update, a task update, or a log. */
export function lastProjectActivity(project: Project, tasks: Task[], logs: WorkLog[]): string {
  let last = project.updatedAt;
  for (const t of tasks) if (t.projectId === project.id && t.updatedAt > last) last = t.updatedAt;
  for (const l of logs) if (l.projectId === project.id && l.createdAt > last) last = l.createdAt;
  return last;
}
