import type { Priority, ProjectCategory, ProjectStatus, Settings, TaskStatus } from "./types";

export const APP_NAME = "CodewithFred Project Hub";
export const TAGLINE = "Every project. Every milestone. Every day. Under control.";

export const CATEGORIES: { value: ProjectCategory; label: string; dot: string }[] = [
  { value: "client", label: "Client Projects", dot: "bg-sky-400" },
  { value: "personal", label: "Personal Projects", dot: "bg-violet-400" },
  { value: "saas", label: "SaaS Products", dot: "bg-emerald-400" },
  { value: "ai_automation", label: "AI Automation", dot: "bg-fuchsia-400" },
  { value: "content", label: "Content Creation", dot: "bg-amber-400" },
  { value: "learning", label: "Learning", dot: "bg-teal-400" },
];

export const PROJECT_STATUSES: { value: ProjectStatus; label: string; cls: string }[] = [
  { value: "planning", label: "Planning", cls: "text-sky-700 dark:text-sky-300 bg-sky-400/10 ring-sky-400/20" },
  { value: "in_progress", label: "In Progress", cls: "text-violet-700 dark:text-violet-300 bg-violet-400/10 ring-violet-400/20" },
  { value: "on_hold", label: "On Hold", cls: "text-amber-700 dark:text-amber-300 bg-amber-400/10 ring-amber-400/20" },
  { value: "completed", label: "Completed", cls: "text-emerald-700 dark:text-emerald-300 bg-emerald-400/10 ring-emerald-400/20" },
  { value: "archived", label: "Archived", cls: "text-zinc-400 bg-zinc-400/10 ring-zinc-400/20" },
];

export const PRIORITIES: { value: Priority; label: string; cls: string; weight: number }[] = [
  { value: "urgent", label: "Urgent", cls: "text-rose-700 dark:text-rose-300 bg-rose-500/10 ring-rose-500/25", weight: 40 },
  { value: "high", label: "High", cls: "text-orange-700 dark:text-orange-300 bg-orange-500/10 ring-orange-500/25", weight: 28 },
  { value: "medium", label: "Medium", cls: "text-sky-700 dark:text-sky-300 bg-sky-500/10 ring-sky-500/20", weight: 16 },
  { value: "low", label: "Low", cls: "text-zinc-400 bg-zinc-500/10 ring-zinc-500/20", weight: 6 },
];

export const TASK_STATUSES: { value: TaskStatus; label: string; dot: string }[] = [
  { value: "todo", label: "To Do", dot: "bg-zinc-400" },
  { value: "in_progress", label: "In Progress", dot: "bg-violet-400" },
  { value: "review", label: "In Review", dot: "bg-amber-400" },
  { value: "done", label: "Done", dot: "bg-emerald-400" },
];

export const categoryLabel = (v: ProjectCategory) => CATEGORIES.find((c) => c.value === v)?.label ?? v;
export const projectStatusMeta = (v: ProjectStatus) => PROJECT_STATUSES.find((s) => s.value === v) ?? PROJECT_STATUSES[0];
export const priorityMeta = (v: Priority) => PRIORITIES.find((p) => p.value === v) ?? PRIORITIES[2];
export const taskStatusMeta = (v: TaskStatus) => TASK_STATUSES.find((s) => s.value === v) ?? TASK_STATUSES[0];

/** Statuses that count as "active" work. */
export const ACTIVE_PROJECT_STATUSES: ProjectStatus[] = ["planning", "in_progress"];

export const DEFAULT_SETTINGS: Settings = {
  id: "me",
  displayName: "CodewithFred",
  role: "Software Developer",
  timezone: "Africa/Lagos",
  theme: "dark",
  reminderEnabled: true,
  reminderTime: "18:00",
  browserNotifications: false,
  notifyDeadlines: true,
  notifyOverdue: true,
  notifyStale: true,
  notifyToday: true,
  deadlineWindowDays: 3,
  staleAfterDays: 7,
  summaryStyle: "detailed",
  summaryIncludeStats: true,
  weekStartsOn: 1,
  lastProjectId: null,
  githubUsername: "",
  githubToken: "",
  githubEmails: [],
  autoTrackEnabled: true,
  repoLinks: {},
  sessionGapMinutes: 120,
  sessionLeadMinutes: 30,
  lastSync: null,
  updatedAt: new Date(0).toISOString(),
};

export const TIME_PRESETS = [15, 30, 45, 60, 90, 120, 180, 240];
