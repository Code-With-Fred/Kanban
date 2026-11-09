import { useMemo, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { toast } from "sonner";
import { CalendarDays, Clock, Flag, FolderKanban, ListPlus, Zap } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { PageHeader } from "@/components/common/layout";
import { PageLoader } from "@/components/common/PageLoader";
import { KIND_STYLE, MonthCalendar, type CalEvent, type CalEventKind } from "@/components/calendar/MonthCalendar";
import { TaskRow } from "@/components/tasks/TaskRow";
import { useDataset, useSettings, useToday } from "@/hooks/data";
import { dateInTz, fmtLong, startOfMonth } from "@/lib/dates";
import { completedOn } from "@/lib/insights";
import { rescheduleTask } from "@/lib/repo";
import { cn, fmtMinutes } from "@/lib/utils";
import { useUI } from "@/providers/ui";

const ALL_KINDS: CalEventKind[] = ["project", "milestone", "task", "scheduled", "done", "log"];

export default function CalendarPage() {
  const today = useToday();
  const settings = useSettings();
  const { ready, data } = useDataset();
  const { openTask, openLog } = useUI();
  const navigate = useNavigate();
  const [month, setMonth] = useState(startOfMonth(today));
  const [selected, setSelected] = useState<string>(today);
  const [kinds, setKinds] = useState<Set<CalEventKind>>(new Set(ALL_KINDS));

  const events = useMemo<CalEvent[]>(() => {
    if (!data) return [];
    const out: CalEvent[] = [];
    const live = new Set(data.projects.filter((p) => p.status !== "archived").map((p) => p.id));
    for (const p of data.projects) {
      if (p.deadline && p.status !== "archived")
        out.push({ id: p.id, date: p.deadline, kind: "project", title: p.name, muted: p.status === "completed", onClick: () => navigate(`/projects/${p.id}`) });
    }
    for (const m of data.milestones) {
      if (m.dueDate && live.has(m.projectId))
        out.push({ id: m.id, date: m.dueDate, kind: "milestone", title: m.title, muted: !!m.completedAt, onClick: () => navigate(`/projects/${m.projectId}`) });
    }
    for (const t of data.tasks) {
      if (t.projectId && !live.has(t.projectId)) continue;
      if (t.status === "done") {
        const d = completedOn(t, settings.timezone);
        if (d) out.push({ id: t.id, date: d, kind: "done", title: t.title, onClick: () => openTask(t) });
        continue;
      }
      if (t.dueDate) out.push({ id: t.id, date: t.dueDate, kind: "task", title: t.title, draggableId: t.id, onClick: () => openTask(t) });
      if (t.scheduledDate && t.scheduledDate !== t.dueDate) out.push({ id: `${t.id}-s`, date: t.scheduledDate, kind: "scheduled", title: t.title, onClick: () => openTask(t) });
    }
    const byDay = new Map<string, number>();
    for (const l of data.logs) byDay.set(l.date, (byDay.get(l.date) ?? 0) + l.minutes);
    for (const [d, m] of byDay) out.push({ id: `log-${d}`, date: d, kind: "log", title: `${fmtMinutes(m)} logged`, onClick: () => navigate(`/work-log?from=${d}&to=${d}`) });
    return out.filter((e) => kinds.has(e.kind));
  }, [data, kinds, settings.timezone, navigate, openTask]);

  if (!ready || !data) return <PageLoader />;

  const pmap = new Map(data.projects.map((p) => [p.id, p]));
  const dayProjects = data.projects.filter((p) => p.deadline === selected && p.status !== "archived");
  const dayMilestones = data.milestones.filter((m) => m.dueDate === selected);
  const dayTasks = data.tasks.filter((t) => t.status !== "done" && (t.dueDate === selected || t.scheduledDate === selected));
  const dayDone = data.tasks.filter((t) => t.status === "done" && t.completedAt && dateInTz(t.completedAt, settings.timezone) === selected);
  const dayLogs = data.logs.filter((l) => l.date === selected);
  const nothing = !dayProjects.length && !dayMilestones.length && !dayTasks.length && !dayDone.length && !dayLogs.length;

  const toggle = (k: CalEventKind) =>
    setKinds((s) => {
      const n = new Set(s);
      if (n.has(k)) n.delete(k);
      else n.add(k);
      return n;
    });

  return (
    <div className="page">
      <PageHeader icon={CalendarDays} title="Calendar" description="Deadlines, milestones, scheduled tasks and the work you actually did — on one timeline. Drag a task to change its due date." />

      <div className="mb-4 flex flex-wrap gap-1.5">
        {ALL_KINDS.map((k) => (
          <button
            key={k}
            onClick={() => toggle(k)}
            className={cn(
              "inline-flex h-7 items-center gap-1.5 rounded-full border px-2.5 text-xs transition-colors",
              kinds.has(k) ? "bg-accent text-foreground" : "text-muted-foreground opacity-60 hover:opacity-100",
            )}
            aria-pressed={kinds.has(k)}
          >
            <span className={cn("size-2 rounded-full", KIND_STYLE[k].dot)} /> {KIND_STYLE[k].label}
          </button>
        ))}
      </div>

      <div className="grid gap-4 xl:grid-cols-[1fr_340px]">
        <Card className="p-3 sm:p-4">
          <MonthCalendar
            month={month}
            onMonthChange={setMonth}
            today={today}
            events={events}
            selected={selected}
            onSelect={setSelected}
            weekStartsOn={settings.weekStartsOn}
            onDropTask={async (id, date) => {
              await rescheduleTask(id, "dueDate", date);
              toast.success(`Due date moved to ${fmtLong(date)}`);
            }}
          />
        </Card>

        <Card className="h-fit xl:sticky xl:top-20">
          <div className="border-b px-4 py-3">
            <p className="text-sm font-semibold">{fmtLong(selected)}</p>
            <div className="mt-2 flex gap-2">
              <Button size="xs" variant="outline" onClick={() => openTask(null, { dueDate: selected })}>
                <ListPlus /> Task due
              </Button>
              <Button size="xs" variant="outline" onClick={() => openTask(null, { scheduledDate: selected })}>
                <CalendarDays /> Plan task
              </Button>
              {selected <= today && (
                <Button size="xs" variant="outline" onClick={() => openLog(null, { date: selected })}>
                  <Zap /> Log
                </Button>
              )}
            </div>
          </div>
          <div className="max-h-[70vh] space-y-4 overflow-y-auto p-4">
            {nothing && <p className="py-8 text-center text-xs text-muted-foreground">Nothing on this day.</p>}
            {dayProjects.length > 0 && (
              <div>
                <p className="mb-1.5 text-[11px] font-medium uppercase tracking-wider text-rose-600 dark:text-rose-400">Project deadlines</p>
                {dayProjects.map((p) => (
                  <Link key={p.id} to={`/projects/${p.id}`} className="flex items-center gap-2 rounded-md px-1 py-1.5 text-sm hover:bg-accent/40">
                    <FolderKanban className="size-3.5 text-muted-foreground" /> {p.name}
                  </Link>
                ))}
              </div>
            )}
            {dayMilestones.length > 0 && (
              <div>
                <p className="mb-1.5 text-[11px] font-medium uppercase tracking-wider text-violet-600 dark:text-violet-400">Milestones</p>
                {dayMilestones.map((m) => (
                  <Link key={m.id} to={`/projects/${m.projectId}`} className="flex items-center gap-2 rounded-md px-1 py-1.5 text-sm hover:bg-accent/40">
                    <Flag className="size-3.5 text-muted-foreground" />
                    <span className={cn(m.completedAt && "text-muted-foreground line-through")}>{m.title}</span>
                    <span className="ml-auto truncate text-xs text-muted-foreground">{pmap.get(m.projectId)?.name}</span>
                  </Link>
                ))}
              </div>
            )}
            {dayTasks.length > 0 && (
              <div>
                <p className="mb-1 text-[11px] font-medium uppercase tracking-wider text-sky-600 dark:text-sky-400">Tasks</p>
                <div className="-mx-3 divide-y">
                  {dayTasks.map((t) => (
                    <TaskRow key={t.id} task={t} project={t.projectId ? pmap.get(t.projectId) : null} today={today} />
                  ))}
                </div>
              </div>
            )}
            {dayDone.length > 0 && (
              <div>
                <p className="mb-1 text-[11px] font-medium uppercase tracking-wider text-emerald-600 dark:text-emerald-400">Completed</p>
                <div className="-mx-3 divide-y">
                  {dayDone.map((t) => (
                    <TaskRow key={t.id} task={t} project={t.projectId ? pmap.get(t.projectId) : null} today={today} />
                  ))}
                </div>
              </div>
            )}
            {dayLogs.length > 0 && (
              <div>
                <p className="mb-1.5 text-[11px] font-medium uppercase tracking-wider text-muted-foreground">
                  Work logged · {fmtMinutes(dayLogs.reduce((s, l) => s + l.minutes, 0))}
                </p>
                <ul className="space-y-2">
                  {dayLogs.map((l) => (
                    <li key={l.id} className="rounded-lg border bg-surface p-2.5 text-sm">
                      <p className="mb-0.5 flex items-center gap-2 text-xs text-muted-foreground">
                        <Clock className="size-3" /> {fmtMinutes(l.minutes)} · {l.projectId ? pmap.get(l.projectId)?.name : "General"}
                      </p>
                      <p className="line-clamp-3">{l.workedOn}</p>
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </div>
        </Card>
      </div>
    </div>
  );
}
