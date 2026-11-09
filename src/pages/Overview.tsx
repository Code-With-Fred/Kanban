import { useMemo } from "react";
import { Link, useNavigate } from "react-router-dom";
import {
  Activity as ActivityIcon,
  AlarmClock,
  ArrowRight,
  CalendarClock,
  CheckCircle2,
  CircleCheckBig,
  Flag,
  FolderKanban,
  FolderPlus,
  ListPlus,
  PauseCircle,
  Rocket,
  Sparkles,
  Sunset,
  Target,
  Zap,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/misc";
import { EmptyState, StatCard } from "@/components/common/layout";
import { PriorityBadge } from "@/components/common/badges";
import { PageLoader } from "@/components/common/PageLoader";
import { ProductivityChart } from "@/components/charts/ProductivityChart";
import { TaskRow, toggleDone } from "@/components/tasks/TaskRow";
import { useActivities, useDataset, useDrafts, useSettings, useToday } from "@/hooks/data";
import { addDays, fmtLong, fmtShort, greeting, relativeDay, timeAgo } from "@/lib/dates";
import { completedOn, dailySeries, isOverdue, projectCounts, rankFocus, upcomingDeadlines } from "@/lib/insights";
import type { ActivityType } from "@/lib/types";
import { cn, fmtMinutes, pluralize } from "@/lib/utils";
import { useUI } from "@/providers/ui";

const ACTIVITY_ICON: Partial<Record<ActivityType, typeof Zap>> = {
  task_completed: CheckCircle2,
  log_created: Zap,
  project_created: FolderPlus,
  milestone_completed: Flag,
  report_saved: Sparkles,
};

export default function Overview() {
  const settings = useSettings();
  const today = useToday();
  const { ready, data } = useDataset();
  const activities = useActivities(10);
  const { openLog, openTask, openProject } = useUI();
  const navigate = useNavigate();
  const todayRange = useMemo(() => ({ from: today, to: today }), [today]);
  const drafts = useDrafts(todayRange);
  const detected = drafts && settings.githubUsername
    ? {
        minutes: drafts.reduce((s, d) => s + d.minutes, 0),
        commits: drafts.reduce((s, d) => s + d.commits.length, 0),
        pending: drafts.filter((d) => !d.decision).length,
      }
    : null;

  const view = useMemo(() => {
    if (!data) return null;
    const { projects, tasks, logs, milestones } = data;
    const counts = projectCounts(projects);
    const doneToday = tasks.filter((t) => t.status === "done" && completedOn(t, settings.timezone) === today);
    const overdue = tasks
      .filter((t) => isOverdue(t, today))
      .filter((t) => {
        const p = t.projectId ? projects.find((x) => x.id === t.projectId) : null;
        return !p || (p.status !== "archived" && p.status !== "completed");
      })
      .sort((a, b) => a.dueDate!.localeCompare(b.dueDate!));
    const deadlines = upcomingDeadlines(projects, tasks, milestones, today, 14);
    const series = dailySeries(addDays(today, -6), today, logs, tasks, settings.timezone);
    const weekMinutes = series.reduce((s, d) => s + d.minutes, 0);
    const weekDone = series.reduce((s, d) => s + d.tasksCompleted, 0);
    const focus = rankFocus(tasks, projects, today, 3);
    const todayLogs = logs.filter((l) => l.date === today);
    const todayMinutes = todayLogs.reduce((s, l) => s + l.minutes, 0);
    return { counts, doneToday, overdue, deadlines, series, weekMinutes, weekDone, focus, todayLogs, todayMinutes, pmap: new Map(projects.map((p) => [p.id, p])) };
  }, [data, today, settings.timezone]);

  if (!ready || !view || !data) return <PageLoader />;

  const firstRun = data.projects.length === 0 && data.tasks.length === 0 && data.logs.length === 0;
  const name = settings.displayName.split(" ")[0] || "Fred";

  return (
    <div className="page space-y-6">
      {/* Hero */}
      <section className="glow-card hairline-top relative overflow-hidden rounded-2xl border p-5 md:p-7">
        <div aria-hidden className="pointer-events-none absolute -right-20 -top-24 size-72 rounded-full bg-indigo-500/10 blur-3xl" />
        <div className="relative flex flex-col gap-5 md:flex-row md:items-end md:justify-between">
          <div className="animate-fade-up">
            <p className="text-xs font-medium uppercase tracking-[0.14em] text-muted-foreground">{fmtLong(today)}</p>
            <h1 className="mt-2 text-2xl font-semibold tracking-tight md:text-3xl">
              {greeting(settings.timezone)}, {name}.
            </h1>
            <p className="mt-1.5 max-w-xl text-sm text-muted-foreground">
              {firstRun
                ? "Welcome to your command center. Add your first project and the dashboard will start working for you."
                : view.focus.length
                  ? `${view.focus.length === 1 ? "One task deserves" : `${view.focus.length} tasks deserve`} your attention first today${view.overdue.length ? `, and ${view.overdue.length} ${view.overdue.length === 1 ? "is" : "are"} overdue` : ""}.`
                  : "No open tasks are pressing. A good day to plan ahead or ship something new."}
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            <Button variant="brand" onClick={() => openLog()}>
              <Zap /> Log work
            </Button>
            <Button variant="outline" onClick={() => openTask(null, { scheduledDate: today })}>
              <ListPlus /> Task for today
            </Button>
            <Button variant="outline" onClick={() => navigate("/reports/daily?checkin=1")}>
              <Sunset /> End my day
            </Button>
          </div>
        </div>
        {!firstRun && (
          <div className="relative mt-5 flex flex-wrap gap-x-6 gap-y-2 border-t pt-4 text-sm">
            <span className="text-muted-foreground">
              Today: <span className="font-medium text-foreground">{fmtMinutes(view.todayMinutes)}</span> logged
            </span>
            <span className="text-muted-foreground">
              <span className="font-medium text-foreground">{view.doneToday.length}</span> {view.doneToday.length === 1 ? "task" : "tasks"} done
            </span>
            <span className="text-muted-foreground">
              This week: <span className="font-medium text-foreground">{fmtMinutes(view.weekMinutes)}</span> · {pluralize(view.weekDone, "task")}
            </span>
            {detected && detected.commits > 0 && (
              <Link to="/work-log" className="inline-flex items-center gap-1.5 text-muted-foreground hover:text-foreground">
                <Sparkles className="size-3.5 text-brand" /> GitHub today: <span className="font-medium text-foreground">≈ {fmtMinutes(detected.minutes)}</span> ·{" "}
                {pluralize(detected.commits, "commit")}
                {detected.pending > 0 && <span className="rounded bg-brand/15 px-1.5 text-[11px] font-semibold text-brand">{detected.pending} to review</span>}
              </Link>
            )}
            {view.todayLogs.length === 0 && !detected?.pending && (
              <button onClick={() => openLog()} className="inline-flex items-center gap-1.5 text-amber-600 hover:underline dark:text-amber-300">
                <span className="size-1.5 rounded-full bg-amber-400" /> Nothing logged yet today
              </button>
            )}
          </div>
        )}
      </section>

      {firstRun && (
        <Card className="p-6">
          <div className="grid gap-4 md:grid-cols-3">
            {[
              { icon: FolderPlus, title: "1. Add a project", desc: "Client work, SaaS, content, learning — anything you're building.", action: () => openProject(null, { navigateOnCreate: true }), cta: "New project" },
              { icon: ListPlus, title: "2. Break it into tasks", desc: "Give them priorities and due dates. Today's Focus ranks them for you.", action: () => openTask(), cta: "New task" },
              { icon: Zap, title: "3. Log as you go", desc: "30 seconds per entry. Reports write themselves from your logs.", action: () => openLog(), cta: "Log work" },
            ].map((s) => (
              <div key={s.title} className="rounded-xl border bg-surface p-4">
                <s.icon className="size-5 text-brand" />
                <p className="mt-3 text-sm font-semibold">{s.title}</p>
                <p className="mt-1 text-xs text-muted-foreground">{s.desc}</p>
                <Button size="sm" variant="outline" className="mt-4" onClick={s.action}>
                  {s.cta}
                </Button>
              </div>
            ))}
          </div>
        </Card>
      )}

      {/* Stats */}
      <section className="grid grid-cols-2 gap-3 md:grid-cols-4 xl:grid-cols-7">
        <StatCard label="Total projects" value={view.counts.total} icon={FolderKanban} onClick={() => navigate("/projects")} delay={0} />
        <StatCard label="Active" value={view.counts.active} icon={Rocket} tone="violet" hint={`${view.counts.inProgress} in progress`} onClick={() => navigate("/projects?status=active")} delay={30} />
        <StatCard label="Completed" value={view.counts.completed} icon={CircleCheckBig} tone="emerald" onClick={() => navigate("/projects?status=completed")} delay={60} />
        <StatCard label="On hold" value={view.counts.onHold} icon={PauseCircle} tone="amber" onClick={() => navigate("/projects?status=on_hold")} delay={90} />
        <StatCard label="Done today" value={view.doneToday.length} icon={CheckCircle2} tone="emerald" hint="tasks completed" onClick={() => navigate("/tasks?view=list&status=done")} delay={120} />
        <StatCard label="Upcoming" value={view.deadlines.length} icon={CalendarClock} tone="sky" hint="deadlines · 14 days" onClick={() => navigate("/calendar")} delay={150} />
        <StatCard label="Overdue" value={view.overdue.length} icon={AlarmClock} tone={view.overdue.length ? "rose" : "default"} hint="open tasks" onClick={() => navigate("/tasks?view=list&due=overdue")} delay={180} />
      </section>

      <div className="grid gap-4 lg:grid-cols-3">
        {/* Today's Focus */}
        <Card className="lg:col-span-2">
          <CardHeader>
            <div>
              <CardTitle>
                <Target className="size-4 text-brand" /> Today's Focus
              </CardTitle>
              <CardDescription>Ranked by deadline, priority, schedule and momentum.</CardDescription>
            </div>
            <Button variant="ghost" size="xs" asChild>
              <Link to="/tasks">
                All tasks <ArrowRight />
              </Link>
            </Button>
          </CardHeader>
          <CardContent>
            {view.focus.length === 0 ? (
              <EmptyState
                compact
                icon={Target}
                title="Nothing to focus on yet"
                description="Add tasks with priorities or due dates and your top three will appear here every morning."
                action={
                  <Button size="sm" variant="outline" onClick={() => openTask()}>
                    <ListPlus /> Add a task
                  </Button>
                }
              />
            ) : (
              <ol className="space-y-2">
                {view.focus.map((f, i) => (
                  <li
                    key={f.task.id}
                    className="group flex animate-fade-up items-start gap-3 rounded-xl border bg-surface p-3.5 transition-colors hover:border-foreground/15"
                    style={{ animationDelay: `${i * 60}ms` }}
                  >
                    <span
                      className={cn(
                        "grid size-7 shrink-0 place-items-center rounded-lg text-xs font-bold tabular-nums",
                        i === 0 ? "bg-gradient-to-br from-violet-500 to-indigo-600 text-white" : "bg-accent text-muted-foreground",
                      )}
                    >
                      {i + 1}
                    </span>
                    <div className="min-w-0 flex-1">
                      <button className="text-left text-sm font-medium hover:underline" onClick={() => openTask(f.task)}>
                        {f.task.title}
                      </button>
                      <div className="mt-1 flex flex-wrap items-center gap-1.5">
                        <PriorityBadge priority={f.task.priority} />
                        {f.project && (
                          <Link to={`/projects/${f.project.id}`} className="text-xs text-muted-foreground hover:text-foreground">
                            {f.project.name}
                          </Link>
                        )}
                        {f.reasons.map((r) => (
                          <span key={r} className={cn("rounded-md px-1.5 py-0.5 text-[11px]", /overdue/i.test(r) ? "bg-rose-500/10 text-rose-600 dark:text-rose-300" : "bg-accent text-muted-foreground")}>
                            {r}
                          </span>
                        ))}
                      </div>
                    </div>
                    <div className="flex items-center gap-2 pt-1">
                      <Checkbox checked={false} onCheckedChange={() => toggleDone(f.task)} aria-label="Mark as done" />
                    </div>
                  </li>
                ))}
              </ol>
            )}
          </CardContent>
        </Card>

        {/* Upcoming deadlines */}
        <Card>
          <CardHeader>
            <CardTitle>
              <CalendarClock className="size-4 text-sky-500 dark:text-sky-300" /> Upcoming deadlines
            </CardTitle>
            <Button variant="ghost" size="xs" asChild>
              <Link to="/calendar">
                Calendar <ArrowRight />
              </Link>
            </Button>
          </CardHeader>
          <CardContent className="space-y-1">
            {view.deadlines.length === 0 ? (
              <p className="py-6 text-center text-xs text-muted-foreground">No deadlines in the next 14 days.</p>
            ) : (
              view.deadlines.slice(0, 7).map((d) => {
                const soon = d.date <= addDays(today, 1);
                return (
                  <button
                    key={`${d.kind}-${d.id}`}
                    onClick={() => (d.kind === "task" ? navigate(`/tasks?task=${d.id}`) : navigate(`/projects/${d.projectId}`))}
                    className="flex w-full items-center gap-3 rounded-lg px-2 py-2 text-left transition-colors hover:bg-accent/50"
                  >
                    <div className={cn("w-12 shrink-0 rounded-md border py-1 text-center", soon && "border-amber-500/40 bg-amber-500/10")}>
                      <p className="text-[10px] uppercase text-muted-foreground">{fmtShort(d.date).split(",")[0]}</p>
                      <p className="text-sm font-semibold tabular-nums leading-none">{Number(d.date.slice(8))}</p>
                    </div>
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm">{d.title}</p>
                      <p className="truncate text-[11px] text-muted-foreground">
                        {d.kind === "project" ? "Project deadline" : d.kind === "milestone" ? `Milestone · ${d.projectName ?? ""}` : `Task${d.projectName ? ` · ${d.projectName}` : ""}`} · {relativeDay(d.date, today)}
                      </p>
                    </div>
                  </button>
                );
              })
            )}
          </CardContent>
        </Card>
      </div>

      <div className="grid gap-4 lg:grid-cols-3">
        {/* Weekly chart */}
        <Card className="lg:col-span-2">
          <CardHeader>
            <div>
              <CardTitle>Weekly productivity</CardTitle>
              <CardDescription>
                Last 7 days · {fmtMinutes(view.weekMinutes)} logged · {pluralize(view.weekDone, "task")} completed
              </CardDescription>
            </div>
            <div className="hidden items-center gap-3 text-[11px] text-muted-foreground sm:flex">
              <span className="flex items-center gap-1.5">
                <span className="size-2 rounded-sm bg-violet-500" /> Hours
              </span>
              <span className="flex items-center gap-1.5">
                <span className="size-2 rounded-full bg-emerald-400" /> Tasks done
              </span>
            </div>
          </CardHeader>
          <CardContent>
            <ProductivityChart data={view.series} today={today} />
          </CardContent>
        </Card>

        {/* Overdue */}
        <Card>
          <CardHeader>
            <CardTitle>
              <AlarmClock className={cn("size-4", view.overdue.length ? "text-rose-500 dark:text-rose-300" : "text-muted-foreground")} /> Overdue tasks
            </CardTitle>
            {view.overdue.length > 0 && (
              <Button variant="ghost" size="xs" asChild>
                <Link to="/tasks?view=list&due=overdue">
                  View all <ArrowRight />
                </Link>
              </Button>
            )}
          </CardHeader>
          <CardContent className="px-2">
            {view.overdue.length === 0 ? (
              <div className="py-8 text-center">
                <CheckCircle2 className="mx-auto size-5 text-emerald-400" />
                <p className="mt-2 text-xs text-muted-foreground">Nothing overdue. Nice.</p>
              </div>
            ) : (
              <div className="divide-y">
                {view.overdue.slice(0, 5).map((t) => (
                  <TaskRow key={t.id} task={t} project={t.projectId ? view.pmap.get(t.projectId) : null} today={today} className="rounded-md" />
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Activity */}
      <Card>
        <CardHeader>
          <CardTitle>
            <ActivityIcon className="size-4 text-muted-foreground" /> Recent activity
          </CardTitle>
          <Button variant="ghost" size="xs" asChild>
            <Link to="/work-log">
              Work log <ArrowRight />
            </Link>
          </Button>
        </CardHeader>
        <CardContent>
          {!activities?.length ? (
            <p className="py-6 text-center text-xs text-muted-foreground">Your actions — projects, tasks, logs, reports — will be tracked here.</p>
          ) : (
            <ul className="grid gap-x-8 md:grid-cols-2">
              {activities.map((a) => {
                const Icon = ACTIVITY_ICON[a.type] ?? ActivityIcon;
                return (
                  <li key={a.id} className="flex items-start gap-3 border-b py-2.5 last:border-0 md:[&:nth-last-child(2)]:border-0">
                    <span className="mt-0.5 grid size-6 shrink-0 place-items-center rounded-md bg-accent">
                      <Icon className={cn("size-3", a.type === "task_completed" ? "text-emerald-500" : "text-muted-foreground")} />
                    </span>
                    <p className="min-w-0 flex-1 text-[13px] leading-snug text-foreground/90">{a.message}</p>
                    <span className="shrink-0 text-[11px] text-muted-foreground">{timeAgo(a.createdAt)}</span>
                  </li>
                );
              })}
            </ul>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
