import { useLiveQuery } from "dexie-react-hooks";
import { useEffect, useMemo, useState } from "react";
import { buildDrafts } from "@/lib/tracking/drafts";
import { db } from "@/lib/db";
import { DEFAULT_SETTINGS } from "@/lib/constants";
import { todayIn } from "@/lib/dates";
import type { Settings } from "@/lib/types";

/** Live settings (falls back to defaults until the first read resolves). */
export function useSettings(): Settings {
  const s = useLiveQuery(() => db.settings.get("me"), []);
  return { ...DEFAULT_SETTINGS, ...(s ?? {}) };
}

/** Today's date in the configured timezone; re-evaluates every minute so midnight rolls over. */
export function useToday(): string {
  const { timezone } = useSettings();
  const [today, setToday] = useState(() => todayIn(timezone));
  useEffect(() => {
    setToday(todayIn(timezone));
    const t = setInterval(() => setToday(todayIn(timezone)), 60_000);
    return () => clearInterval(t);
  }, [timezone]);
  return today;
}

/* Live collections. `undefined` means "still loading". */
export const useProjects = () => useLiveQuery(() => db.projects.toArray(), []);
export const useTasks = () => useLiveQuery(() => db.tasks.toArray(), []);
export const useWorkLogs = () => useLiveQuery(() => db.workLogs.orderBy("date").reverse().toArray(), []);
export const useMilestones = () => useLiveQuery(() => db.milestones.toArray(), []);
export const useReports = () => useLiveQuery(() => db.reports.orderBy("periodStart").reverse().toArray(), []);
export const useActivities = (limit = 12) =>
  useLiveQuery(() => db.activities.orderBy("createdAt").reverse().limit(limit).toArray(), [limit]);
export const useNotifications = () =>
  useLiveQuery(() => db.notifications.orderBy("createdAt").reverse().filter((n) => !n.hidden).toArray(), []);

/** Everything the report generators need, in one live bundle. */
export function useDataset() {
  const projects = useProjects();
  const tasks = useTasks();
  const logs = useWorkLogs();
  const milestones = useMilestones();
  const ready = !!(projects && tasks && logs && milestones);
  return {
    ready,
    data: ready ? { projects: projects!, tasks: tasks!, logs: logs!, milestones: milestones! } : null,
  };
}

/* ------------------------------ Auto-tracking ----------------------------- */

export const useTrackedEvents = () => useLiveQuery(() => db.trackedEvents.orderBy("occurredAt").reverse().toArray(), []);
export const useDraftDecisions = () => useLiveQuery(() => db.draftDecisions.toArray(), []);

/** Suggested logs from detected activity, live. `undefined` while loading. */
export function useDrafts(range?: { from?: string; to?: string }) {
  const settings = useSettings();
  const events = useTrackedEvents();
  const decisions = useDraftDecisions();
  const projects = useProjects();
  const tasks = useTasks();
  return useMemo(() => {
    if (!events || !decisions || !projects || !tasks) return undefined;
    return buildDrafts({ events, projects, tasks, decisions, settings, from: range?.from, to: range?.to });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [events, decisions, projects, tasks, settings.timezone, settings.repoLinks, settings.sessionGapMinutes, settings.sessionLeadMinutes, range?.from, range?.to]);
}
