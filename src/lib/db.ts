import Dexie, { type EntityTable } from "dexie";
import type { Activity, AppNotification, Milestone, Project, Report, Settings, Task, WorkLog } from "./types";

/**
 * Local-first persistence. Everything lives in this browser's IndexedDB, so data
 * survives refreshes and restarts. Use Settings → Data to export/import backups.
 */
export class HubDB extends Dexie {
  projects!: EntityTable<Project, "id">;
  milestones!: EntityTable<Milestone, "id">;
  tasks!: EntityTable<Task, "id">;
  workLogs!: EntityTable<WorkLog, "id">;
  reports!: EntityTable<Report, "id">;
  activities!: EntityTable<Activity, "id">;
  notifications!: EntityTable<AppNotification, "id">;
  settings!: EntityTable<Settings, "id">;

  constructor() {
    super("codewithfred-hub");
    this.version(1).stores({
      projects: "id, status, category, deadline, updatedAt",
      milestones: "id, projectId, dueDate",
      tasks: "id, projectId, status, dueDate, scheduledDate, completedAt, updatedAt",
      workLogs: "id, date, projectId, createdAt",
      reports: "id, type, periodStart, createdAt",
      activities: "id, createdAt, projectId",
      notifications: "id, &dedupeKey, createdAt, readAt",
      settings: "id",
    });
  }
}

export const db = new HubDB();

export const TABLES = [
  "projects",
  "milestones",
  "tasks",
  "workLogs",
  "reports",
  "activities",
  "notifications",
  "settings",
] as const;
export type TableName = (typeof TABLES)[number];
