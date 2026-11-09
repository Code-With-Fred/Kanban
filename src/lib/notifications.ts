import { db } from "./db";
import { ACTIVE_PROJECT_STATUSES } from "./constants";
import { dateInTz, diffDays, timeInTz, todayIn } from "./dates";
import { isOverdue, isTaskOpen, lastProjectActivity } from "./insights";
import { pushNotification } from "./repo";
import type { AppNotification, Settings } from "./types";

/**
 * Rule engine for in-app reminders. Each rule produces a stable dedupe key, so
 * every condition alerts once (e.g. one "overdue" alert per task per due date).
 */
export async function syncNotifications(settings: Settings): Promise<AppNotification[]> {
  const tz = settings.timezone;
  const today = todayIn(tz);
  const [projects, tasks, logs, milestones] = await Promise.all([
    db.projects.toArray(),
    db.tasks.toArray(),
    db.workLogs.toArray(),
    db.milestones.toArray(),
  ]);
  const pmap = new Map(projects.map((p) => [p.id, p]));
  const liveProject = (id: string | null) => {
    const p = id ? pmap.get(id) : null;
    return !p || (p.status !== "archived" && p.status !== "completed");
  };
  const created: AppNotification[] = [];
  const push = async (n: Parameters<typeof pushNotification>[0]) => {
    const r = await pushNotification(n);
    if (r) created.push(r);
  };

  if (settings.notifyDeadlines) {
    for (const p of projects) {
      if (!p.deadline || !ACTIVE_PROJECT_STATUSES.concat("on_hold").includes(p.status)) continue;
      const d = diffDays(p.deadline, today);
      if (d >= 0 && d <= settings.deadlineWindowDays) {
        await push({
          kind: "deadline",
          title: d === 0 ? `${p.name} is due today` : `${p.name} is due in ${d} day${d === 1 ? "" : "s"}`,
          body: `Project deadline on ${p.deadline}.`,
          link: `/projects/${p.id}`,
          dedupeKey: `deadline:${p.id}:${p.deadline}`,
        });
      } else if (d < 0 && d >= -30) {
        await push({
          kind: "overdue",
          title: `${p.name} passed its deadline`,
          body: `Deadline was ${p.deadline}. Update the deadline or status.`,
          link: `/projects/${p.id}`,
          dedupeKey: `project-overdue:${p.id}:${p.deadline}`,
        });
      }
    }
    for (const m of milestones) {
      if (m.completedAt || !m.dueDate || !liveProject(m.projectId)) continue;
      const d = diffDays(m.dueDate, today);
      if (d >= 0 && d <= settings.deadlineWindowDays) {
        await push({
          kind: "milestone",
          title: `Milestone “${m.title}” ${d === 0 ? "is due today" : `due in ${d}d`}`,
          body: pmap.get(m.projectId)?.name ?? "",
          link: `/projects/${m.projectId}`,
          dedupeKey: `milestone:${m.id}:${m.dueDate}`,
        });
      }
    }
  }

  if (settings.notifyOverdue) {
    for (const t of tasks) {
      if (!isOverdue(t, today) || !liveProject(t.projectId)) continue;
      await push({
        kind: "overdue",
        title: `Overdue: ${t.title}`,
        body: `Was due ${t.dueDate}${t.projectId && pmap.get(t.projectId) ? ` · ${pmap.get(t.projectId)!.name}` : ""}.`,
        link: `/tasks?task=${t.id}`,
        dedupeKey: `overdue:${t.id}:${t.dueDate}`,
      });
    }
  }

  if (settings.notifyToday) {
    const todays = tasks.filter(
      (t) => isTaskOpen(t) && liveProject(t.projectId) && (t.scheduledDate === today || t.dueDate === today),
    );
    if (todays.length) {
      await push({
        kind: "today",
        title: `${todays.length} task${todays.length === 1 ? "" : "s"} on today's plan`,
        body: todays.slice(0, 3).map((t) => t.title).join(" · ") + (todays.length > 3 ? " …" : ""),
        link: "/tasks?view=list&due=today",
        dedupeKey: `today:${today}`,
      });
    }
  }

  if (settings.notifyStale) {
    for (const p of projects) {
      if (!ACTIVE_PROJECT_STATUSES.includes(p.status)) continue;
      const last = lastProjectActivity(p, tasks, logs);
      const lastDay = dateInTz(last, tz);
      const idle = diffDays(today, lastDay);
      if (idle >= settings.staleAfterDays) {
        await push({
          kind: "stale",
          title: `No updates on ${p.name} for ${idle} days`,
          body: "Log progress, adjust the plan, or move it to On Hold.",
          link: `/projects/${p.id}`,
          dedupeKey: `stale:${p.id}:${lastDay}`,
        });
      }
    }
  }

  if (settings.reminderEnabled && timeInTz(tz) >= settings.reminderTime) {
    const loggedToday = logs.some((l) => l.date === today);
    await push({
      kind: "reminder",
      title: loggedToday ? "Wrap up your day" : "You haven't logged any work today",
      body: loggedToday ? "Run the daily check-in and generate today's report." : "Take 30 seconds to log what you worked on.",
      link: "/reports/daily",
      dedupeKey: `reminder:${today}`,
    });
  }

  if (settings.browserNotifications) for (const n of created) showBrowserNotification(n);
  return created;
}

export function browserNotificationsSupported() {
  return typeof window !== "undefined" && "Notification" in window;
}

export async function requestBrowserPermission(): Promise<NotificationPermission | "unsupported"> {
  if (!browserNotificationsSupported()) return "unsupported";
  if (Notification.permission === "granted" || Notification.permission === "denied") return Notification.permission;
  return Notification.requestPermission();
}

export function showBrowserNotification(n: Pick<AppNotification, "title" | "body" | "link" | "dedupeKey">) {
  if (!browserNotificationsSupported() || Notification.permission !== "granted") return;
  try {
    const notif = new Notification(n.title, { body: n.body, tag: n.dedupeKey, icon: "/favicon.svg" });
    notif.onclick = () => {
      window.focus();
      window.dispatchEvent(new CustomEvent("cwf:navigate", { detail: n.link }));
      notif.close();
    };
  } catch {
    /* Some browsers (e.g. mobile Chrome) require a service worker; ignore. */
  }
}
