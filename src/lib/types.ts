/** ISO calendar date, `YYYY-MM-DD`, interpreted in the user's configured timezone. */
export type ISODate = string;
/** Full ISO timestamp (UTC), e.g. `2026-11-09T16:12:00.000Z`. */
export type ISOTimestamp = string;

export type ProjectCategory = "client" | "personal" | "saas" | "ai_automation" | "content" | "learning";
export type ProjectStatus = "planning" | "in_progress" | "on_hold" | "completed" | "archived";
export type Priority = "low" | "medium" | "high" | "urgent";
export type TaskStatus = "todo" | "in_progress" | "review" | "done";
export type ProgressMode = "manual" | "tasks";

export interface Project {
  id: string;
  name: string;
  description: string;
  category: ProjectCategory;
  status: ProjectStatus;
  /** Status before archiving, so "Restore" can put it back where it was. */
  archivedFrom?: Exclude<ProjectStatus, "archived"> | null;
  priority: Priority;
  startDate: ISODate | null;
  deadline: ISODate | null;
  /** Manual progress (0–100). Only used when progressMode is "manual". */
  progress: number;
  /** "tasks" = progress is derived from completed / total tasks (a clearly defined rule). */
  progressMode: ProgressMode;
  projectUrl: string;
  repoUrl: string;
  technologies: string[];
  notes: string;
  createdAt: ISOTimestamp;
  updatedAt: ISOTimestamp;
}

export interface Milestone {
  id: string;
  projectId: string;
  title: string;
  dueDate: ISODate | null;
  completedAt: ISOTimestamp | null;
  createdAt: ISOTimestamp;
}

export interface Task {
  id: string;
  title: string;
  description: string;
  projectId: string | null;
  priority: Priority;
  status: TaskStatus;
  dueDate: ISODate | null;
  /** The day I plan to work on it (separate from the hard deadline). */
  scheduledDate: ISODate | null;
  estimatedMinutes: number | null;
  actualMinutes: number | null;
  /** Sort order inside a Kanban column. */
  order: number;
  completedAt: ISOTimestamp | null;
  createdAt: ISOTimestamp;
  updatedAt: ISOTimestamp;
}

export interface WorkLog {
  id: string;
  date: ISODate;
  projectId: string | null;
  workedOn: string;
  completed: string;
  challenges: string;
  minutes: number;
  pending: string;
  nextSteps: string;
  /** "github" when created from an auto-detected suggestion. */
  source?: "manual" | "github";
  createdAt: ISOTimestamp;
  updatedAt: ISOTimestamp;
}

export interface CheckIn {
  workedOn: string;
  completed: string;
  pending: string;
  challenges: string;
  tomorrow: string;
}

export interface ReportStats {
  minutes: number;
  logCount: number;
  tasksCompleted: number;
  projectsTouched: number;
  milestonesCompleted?: number;
  activeDays?: number;
}

export interface Report {
  id: string;
  type: "daily" | "weekly";
  periodStart: ISODate;
  periodEnd: ISODate;
  title: string;
  content: string; // markdown
  stats: ReportStats;
  checkIn?: CheckIn | null;
  createdAt: ISOTimestamp;
  updatedAt: ISOTimestamp;
}

export type ActivityType =
  | "project_created"
  | "project_updated"
  | "project_status"
  | "project_deleted"
  | "task_created"
  | "task_completed"
  | "task_reopened"
  | "task_moved"
  | "task_deleted"
  | "milestone_completed"
  | "log_created"
  | "report_saved";

export interface Activity {
  id: string;
  type: ActivityType;
  message: string;
  projectId: string | null;
  entityId: string | null;
  createdAt: ISOTimestamp;
}

export type NotificationKind = "deadline" | "overdue" | "stale" | "today" | "reminder" | "milestone";

export interface AppNotification {
  id: string;
  kind: NotificationKind;
  title: string;
  body: string;
  link: string;
  /** Deduplicates rule-generated notifications so each condition fires once. */
  dedupeKey: string;
  readAt: ISOTimestamp | null;
  hidden?: boolean;
  createdAt: ISOTimestamp;
}

/* ------------------------------ Auto-tracking ----------------------------- */

export type TrackedKind = "commit" | "pr_opened" | "pr_merged";

/** A piece of work detected automatically from an external source (GitHub). */
export interface TrackedEvent {
  /** Stable id, e.g. `gh:commit:<sha>` — re-syncing never duplicates. */
  id: string;
  source: "github";
  kind: TrackedKind;
  /** `owner/name`, lower-cased. Mapped to a project at read time. */
  repo: string;
  title: string;
  body: string;
  url: string;
  occurredAt: ISOTimestamp;
  number?: number;
}

/** What you decided about a suggested log for one project on one day. */
export interface DraftDecision {
  /** `${date}|${projectKey}` */
  id: string;
  status: "accepted" | "dismissed";
  logId: string | null;
  decidedAt: ISOTimestamp;
}

export interface SyncStatus {
  ok: boolean;
  at: ISOTimestamp;
  newEvents: number;
  reposScanned: number;
  rateRemaining: number | null;
  error?: string;
  /** Start of the sync window is derived from this, so failures never skip data. */
  lastSuccessAt: ISOTimestamp | null;
}

export type ThemePref = "dark" | "light" | "system";
export type SummaryStyle = "concise" | "detailed";

export interface Settings {
  id: "me";
  displayName: string;
  role: string;
  timezone: string;
  theme: ThemePref;
  reminderEnabled: boolean;
  reminderTime: string; // HH:mm in the configured timezone
  browserNotifications: boolean;
  notifyDeadlines: boolean;
  notifyOverdue: boolean;
  notifyStale: boolean;
  notifyToday: boolean;
  deadlineWindowDays: number;
  staleAfterDays: number;
  summaryStyle: SummaryStyle;
  summaryIncludeStats: boolean;
  weekStartsOn: 0 | 1;
  lastProjectId: string | null;
  /* Auto-tracking (GitHub) */
  githubUsername: string;
  /** Optional read-only token, stored only in this browser. Needed for private repos. */
  githubToken: string;
  /** Extra commit emails that count as you (for commits not linked to your account). */
  githubEmails: string[];
  autoTrackEnabled: boolean;
  /** Explicit `owner/repo` → projectId links (in addition to each project's repo URL). */
  repoLinks: Record<string, string>;
  /** Commits further apart than this start a new work session. */
  sessionGapMinutes: number;
  /** Time credited before the first commit of a session (setup, reading, thinking). */
  sessionLeadMinutes: number;
  lastSync: SyncStatus | null;
  updatedAt: ISOTimestamp;
}
