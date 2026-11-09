import { db } from "./db";
import { DEFAULT_SETTINGS, taskStatusMeta } from "./constants";
import { milestoneInput, projectInput, settingsInput, taskInput, workLogInput } from "./schemas";
import type { ProjectInput, TaskInput, WorkLogInput } from "./schemas";
import type {
  Activity,
  ActivityType,
  AppNotification,
  CheckIn,
  Milestone,
  Project,
  ProjectStatus,
  Report,
  ReportStats,
  Settings,
  Task,
  TaskStatus,
  WorkLog,
} from "./types";
import { nowISO, uid } from "./utils";

/* -------------------------------------------------------------------------- */
/*                                  Activity                                  */
/* -------------------------------------------------------------------------- */

async function logActivity(type: ActivityType, message: string, projectId: string | null, entityId: string | null) {
  const a: Activity = { id: uid(), type, message, projectId, entityId, createdAt: nowISO() };
  await db.activities.add(a);
  // Keep the feed bounded.
  const count = await db.activities.count();
  if (count > 600) {
    const old = await db.activities.orderBy("createdAt").limit(count - 500).primaryKeys();
    await db.activities.bulkDelete(old);
  }
}

/* -------------------------------------------------------------------------- */
/*                                  Settings                                  */
/* -------------------------------------------------------------------------- */

export async function ensureSettings(): Promise<Settings> {
  const s = await db.settings.get("me");
  if (s) return { ...DEFAULT_SETTINGS, ...s };
  const fresh = { ...DEFAULT_SETTINGS, updatedAt: nowISO() };
  await db.settings.put(fresh);
  return fresh;
}

export async function updateSettings(patch: Partial<Omit<Settings, "id">>) {
  const current = await ensureSettings();
  const merged = { ...current, ...patch };
  // Validate user-editable fields; internal ones (lastProjectId) pass through.
  settingsInput.parse(merged);
  await db.settings.put({ ...merged, id: "me", updatedAt: nowISO() });
}

/* -------------------------------------------------------------------------- */
/*                                  Projects                                  */
/* -------------------------------------------------------------------------- */

export async function createProject(input: ProjectInput): Promise<Project> {
  const data = projectInput.parse(input);
  const now = nowISO();
  const p: Project = { id: uid(), archivedFrom: null, ...data, createdAt: now, updatedAt: now };
  await db.projects.add(p);
  await logActivity("project_created", `Created project “${p.name}”`, p.id, p.id);
  return p;
}

export async function updateProject(id: string, input: ProjectInput): Promise<void> {
  const data = projectInput.parse(input);
  const prev = await db.projects.get(id);
  if (!prev) throw new Error("Project not found");
  await db.projects.update(id, { ...data, updatedAt: nowISO() });
  if (prev.status !== data.status) {
    await logActivity("project_status", `Moved “${data.name}” to ${statusWord(data.status)}`, id, id);
  } else {
    await logActivity("project_updated", `Updated project “${data.name}”`, id, id);
  }
}

const statusWord = (s: ProjectStatus) =>
  ({ planning: "Planning", in_progress: "In Progress", on_hold: "On Hold", completed: "Completed", archived: "Archived" })[s];

export async function setProjectStatus(id: string, status: ProjectStatus) {
  const p = await db.projects.get(id);
  if (!p) throw new Error("Project not found");
  if (p.status === status) return;
  const patch: Partial<Project> = { status, updatedAt: nowISO() };
  if (status === "archived") patch.archivedFrom = p.status === "archived" ? p.archivedFrom : p.status;
  if (status === "completed" && p.progressMode === "manual") patch.progress = 100;
  await db.projects.update(id, patch);
  await logActivity("project_status", `Moved “${p.name}” to ${statusWord(status)}`, id, id);
}

export async function archiveProject(id: string) {
  await setProjectStatus(id, "archived");
}

export async function restoreProject(id: string) {
  const p = await db.projects.get(id);
  if (!p) throw new Error("Project not found");
  await setProjectStatus(id, p.archivedFrom ?? "planning");
}

export async function deleteProject(id: string) {
  const p = await db.projects.get(id);
  if (!p) return;
  await db.transaction("rw", [db.projects, db.milestones, db.tasks, db.workLogs], async () => {
    await db.milestones.where("projectId").equals(id).delete();
    // Tasks and logs are kept but detached, so history isn't silently lost.
    await db.tasks.where("projectId").equals(id).modify({ projectId: null });
    await db.workLogs.where("projectId").equals(id).modify({ projectId: null });
    await db.projects.delete(id);
  });
  await logActivity("project_deleted", `Deleted project “${p.name}”`, null, id);
}

export async function touchProject(id: string | null) {
  if (id) await db.projects.update(id, { updatedAt: nowISO() });
}

/* -------------------------------------------------------------------------- */
/*                                 Milestones                                 */
/* -------------------------------------------------------------------------- */

export async function addMilestone(projectId: string, title: string, dueDate: string | null) {
  const data = milestoneInput.parse({ title, dueDate });
  const m: Milestone = { id: uid(), projectId, title: data.title, dueDate: data.dueDate, completedAt: null, createdAt: nowISO() };
  await db.milestones.add(m);
  await touchProject(projectId);
  return m;
}

export async function updateMilestone(id: string, patch: { title?: string; dueDate?: string | null }) {
  const m = await db.milestones.get(id);
  if (!m) throw new Error("Milestone not found");
  const data = milestoneInput.parse({ title: patch.title ?? m.title, dueDate: patch.dueDate === undefined ? m.dueDate : patch.dueDate });
  await db.milestones.update(id, data);
}

export async function toggleMilestone(id: string) {
  const m = await db.milestones.get(id);
  if (!m) return;
  const completedAt = m.completedAt ? null : nowISO();
  await db.milestones.update(id, { completedAt });
  await touchProject(m.projectId);
  if (completedAt) {
    const p = await db.projects.get(m.projectId);
    await logActivity("milestone_completed", `Reached milestone “${m.title}”${p ? ` in ${p.name}` : ""}`, m.projectId, id);
  }
}

export async function deleteMilestone(id: string) {
  await db.milestones.delete(id);
}

/* -------------------------------------------------------------------------- */
/*                                    Tasks                                   */
/* -------------------------------------------------------------------------- */

async function nextOrder(status: TaskStatus) {
  const last = await db.tasks.where("status").equals(status).toArray();
  return last.reduce((max, t) => Math.max(max, t.order), 0) + 1000;
}

export async function createTask(input: TaskInput): Promise<Task> {
  const data = taskInput.parse(input);
  const now = nowISO();
  const t: Task = {
    id: uid(),
    ...data,
    order: await nextOrder(data.status),
    completedAt: data.status === "done" ? now : null,
    createdAt: now,
    updatedAt: now,
  };
  await db.tasks.add(t);
  await touchProject(t.projectId);
  await logActivity("task_created", `Added task “${t.title}”`, t.projectId, t.id);
  return t;
}

export async function updateTask(id: string, input: TaskInput) {
  const data = taskInput.parse(input);
  const prev = await db.tasks.get(id);
  if (!prev) throw new Error("Task not found");
  const now = nowISO();
  const completedAt = data.status === "done" ? (prev.completedAt ?? now) : null;
  await db.tasks.update(id, { ...data, completedAt, updatedAt: now });
  await touchProject(data.projectId);
  await statusActivity(prev, data.status);
}

async function statusActivity(prev: Task, status: TaskStatus) {
  if (prev.status === status) return;
  if (status === "done") await logActivity("task_completed", `Completed “${prev.title}”`, prev.projectId, prev.id);
  else if (prev.status === "done") await logActivity("task_reopened", `Reopened “${prev.title}”`, prev.projectId, prev.id);
  else await logActivity("task_moved", `Moved “${prev.title}” to ${taskStatusMeta(status).label}`, prev.projectId, prev.id);
}

/** Explicit user action: change status (e.g. checkbox or Kanban drop). */
export async function setTaskStatus(id: string, status: TaskStatus, order?: number) {
  const prev = await db.tasks.get(id);
  if (!prev) return;
  const now = nowISO();
  await db.tasks.update(id, {
    status,
    order: order ?? (prev.status === status ? prev.order : await nextOrder(status)),
    completedAt: status === "done" ? (prev.completedAt ?? now) : null,
    updatedAt: now,
  });
  await touchProject(prev.projectId);
  await statusActivity(prev, status);
}

export async function rescheduleTask(id: string, field: "dueDate" | "scheduledDate", date: string | null) {
  await db.tasks.update(id, { [field]: date, updatedAt: nowISO() });
}

export async function deleteTask(id: string) {
  const t = await db.tasks.get(id);
  if (!t) return;
  await db.tasks.delete(id);
  await logActivity("task_deleted", `Deleted task “${t.title}”`, t.projectId, id);
}

/* -------------------------------------------------------------------------- */
/*                                  Work logs                                 */
/* -------------------------------------------------------------------------- */

export async function createWorkLog(input: WorkLogInput, source: WorkLog["source"] = "manual"): Promise<WorkLog> {
  const data = workLogInput.parse(input);
  const now = nowISO();
  const log: WorkLog = { id: uid(), ...data, source, createdAt: now, updatedAt: now };
  await db.workLogs.add(log);
  await touchProject(log.projectId);
  if (log.projectId) await updateSettings({ lastProjectId: log.projectId }).catch(() => undefined);
  const p = log.projectId ? await db.projects.get(log.projectId) : null;
  await logActivity("log_created", `Logged ${fmtShortMin(log.minutes)}${p ? ` on ${p.name}` : ""}: ${truncate(log.workedOn, 70)}`, log.projectId, log.id);
  return log;
}

export async function updateWorkLog(id: string, input: WorkLogInput) {
  const data = workLogInput.parse(input);
  await db.workLogs.update(id, { ...data, updatedAt: nowISO() });
  await touchProject(data.projectId);
}

export async function deleteWorkLog(id: string) {
  await db.workLogs.delete(id);
}

const fmtShortMin = (m: number) => (m >= 60 ? `${Math.floor(m / 60)}h${m % 60 ? ` ${m % 60}m` : ""}` : `${m}m`);
const truncate = (s: string, n: number) => (s.length > n ? s.slice(0, n - 1).trimEnd() + "…" : s);

/* -------------------------------------------------------------------------- */
/*                                   Reports                                  */
/* -------------------------------------------------------------------------- */

/** Daily reports are unique per date; weekly per week start. Saving again updates. */
export async function saveReport(input: {
  type: Report["type"];
  periodStart: string;
  periodEnd: string;
  title: string;
  content: string;
  stats: ReportStats;
  checkIn?: CheckIn | null;
}): Promise<{ report: Report; updated: boolean }> {
  const existing = await db.reports
    .where("periodStart")
    .equals(input.periodStart)
    .filter((r) => r.type === input.type)
    .first();
  const now = nowISO();
  if (existing) {
    const report: Report = { ...existing, ...input, checkIn: input.checkIn ?? existing.checkIn ?? null, updatedAt: now };
    await db.reports.put(report);
    return { report, updated: true };
  }
  const report: Report = { id: uid(), ...input, checkIn: input.checkIn ?? null, createdAt: now, updatedAt: now };
  await db.reports.add(report);
  await logActivity("report_saved", `Saved ${input.type} report: ${input.title}`, null, report.id);
  return { report, updated: false };
}

export async function deleteReport(id: string) {
  await db.reports.delete(id);
}

/* -------------------------------------------------------------------------- */
/*                                Notifications                               */
/* -------------------------------------------------------------------------- */

/** Inserts a notification unless one with the same dedupe key exists. Returns it if new. */
export async function pushNotification(n: Omit<AppNotification, "id" | "readAt" | "createdAt">): Promise<AppNotification | null> {
  const exists = await db.notifications.where("dedupeKey").equals(n.dedupeKey).first();
  if (exists) return null;
  const full: AppNotification = { ...n, id: uid(), readAt: null, createdAt: nowISO() };
  try {
    await db.notifications.add(full);
  } catch {
    return null; // race on unique index
  }
  return full;
}

export async function markNotificationRead(id: string) {
  await db.notifications.update(id, { readAt: nowISO() });
}

export async function markAllNotificationsRead() {
  const now = nowISO();
  await db.notifications.filter((n) => !n.readAt).modify({ readAt: now });
}

/** Dismissing hides the item but keeps its dedupe key, so the same alert won't re-fire. */
export async function deleteNotification(id: string) {
  await db.notifications.update(id, { hidden: true, readAt: nowISO() });
}

export async function clearReadNotifications() {
  await db.notifications.filter((n) => !!n.readAt && !n.hidden).modify({ hidden: true });
  // Prune long-dismissed items so the table stays small.
  const cutoff = new Date(Date.now() - 60 * 86400_000).toISOString();
  await db.notifications.filter((n) => !!n.hidden && n.createdAt < cutoff).delete();
}

/** Lightweight inline edits from the project page (notes autosave, manual progress slider). */
export async function patchProject(id: string, patch: Partial<Pick<Project, "notes" | "progress">>) {
  if (patch.notes !== undefined && patch.notes.length > 20000) throw new Error("Notes are too long");
  if (patch.progress !== undefined) patch.progress = Math.max(0, Math.min(100, Math.round(patch.progress)));
  await db.projects.update(id, { ...patch, updatedAt: nowISO() });
}

/** Fresh snapshot of everything report generation needs (avoids stale UI closures). */
export async function loadDataset() {
  const [projects, tasks, logs, milestones] = await Promise.all([
    db.projects.toArray(),
    db.tasks.toArray(),
    db.workLogs.toArray(),
    db.milestones.toArray(),
  ]);
  return { projects, tasks, logs, milestones };
}

/* -------------------------------------------------------------------------- */
/*                         Auto-tracking: suggestions                         */
/* -------------------------------------------------------------------------- */

/** Accepting a suggestion is an explicit user action: it creates a normal, editable work log. */
export async function acceptDraft(
  draft: { key: string; date: string; project: { id: string } | null; workedOn: string; completed: string; pending: string; minutes: number },
  overrides: Partial<WorkLogInput> = {},
): Promise<WorkLog> {
  const log = await createWorkLog(
    {
      date: draft.date,
      projectId: draft.project?.id ?? null,
      workedOn: draft.workedOn,
      completed: draft.completed,
      challenges: "",
      pending: draft.pending,
      nextSteps: "",
      minutes: draft.minutes,
      ...overrides,
    },
    "github",
  );
  await db.draftDecisions.put({ id: draft.key, status: "accepted", logId: log.id, decidedAt: nowISO() });
  return log;
}

/** Marks a suggestion as handled (e.g. after "Edit & save" through the log dialog). */
export async function markDraftAccepted(key: string, logId: string) {
  await db.draftDecisions.put({ id: key, status: "accepted", logId, decidedAt: nowISO() });
}

export async function dismissDraft(key: string) {
  await db.draftDecisions.put({ id: key, status: "dismissed", logId: null, decidedAt: nowISO() });
}

/** Undo: brings a dismissed suggestion back, or removes the log an accepted one created. */
export async function undoDraftDecision(key: string) {
  const d = await db.draftDecisions.get(key);
  if (d?.logId) await db.workLogs.delete(d.logId);
  await db.draftDecisions.delete(key);
}

export async function linkRepo(repo: string, projectId: string | null) {
  const s = await ensureSettings();
  const links = { ...s.repoLinks };
  if (projectId) links[repo.toLowerCase()] = projectId;
  else delete links[repo.toLowerCase()];
  await updateSettings({ repoLinks: links });
}

export async function clearTrackedData() {
  await db.transaction("rw", [db.trackedEvents, db.draftDecisions, db.settings], async () => {
    await db.trackedEvents.clear();
    await db.draftDecisions.clear();
  });
  await updateSettings({ lastSync: null });
}
