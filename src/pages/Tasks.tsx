import { useEffect, useMemo, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { toast } from "sonner";
import { CalendarDays, CheckSquare, Columns3, List, ListPlus, Search, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/misc";
import { EmptyState, PageHeader } from "@/components/common/layout";
import { PageLoader } from "@/components/common/PageLoader";
import { ProjectSelect } from "@/components/common/project-select";
import { KanbanBoard } from "@/components/tasks/KanbanBoard";
import { TaskRow } from "@/components/tasks/TaskRow";
import { CalendarLegend, MonthCalendar, type CalEvent } from "@/components/calendar/MonthCalendar";
import { useDataset, useSettings, useToday } from "@/hooks/data";
import { PRIORITIES, TASK_STATUSES } from "@/lib/constants";
import { addDays, fmtLong, startOfMonth, startOfWeek } from "@/lib/dates";
import { rescheduleTask } from "@/lib/repo";
import type { Task } from "@/lib/types";
import { fmtMinutes } from "@/lib/utils";
import { useUI } from "@/providers/ui";

const DUE_FILTERS = [
  { value: "", label: "Any date" },
  { value: "overdue", label: "Overdue" },
  { value: "today", label: "Due / planned today" },
  { value: "week", label: "This week" },
  { value: "none", label: "No date" },
];

export default function Tasks() {
  const today = useToday();
  const settings = useSettings();
  const { ready, data } = useDataset();
  const { openTask } = useUI();
  const [params, setParams] = useSearchParams();
  const view = params.get("view") ?? "board";
  const q = params.get("q") ?? "";
  const project = params.get("project");
  const priority = params.get("priority") ?? "";
  const due = params.get("due") ?? "";
  const status = params.get("status") ?? "";
  const [month, setMonth] = useState(startOfMonth(today));
  const [selectedDay, setSelectedDay] = useState<string | null>(today);
  const [calField, setCalField] = useState<"dueDate" | "scheduledDate">("dueDate");

  const setParam = (k: string, v: string | null) => {
    const next = new URLSearchParams(params);
    if (v && !(k === "view" && v === "board")) next.set(k, v);
    else next.delete(k);
    setParams(next, { replace: true });
  };

  // Deep link: /tasks?task=<id> opens the editor.
  const deepTask = params.get("task");
  useEffect(() => {
    if (!deepTask || !data) return;
    const t = data.tasks.find((x) => x.id === deepTask);
    if (t) openTask(t);
    else toast.error("That task no longer exists");
    const next = new URLSearchParams(params);
    next.delete("task");
    setParams(next, { replace: true });
  }, [deepTask, data, openTask, params, setParams]);

  const filtered = useMemo(() => {
    if (!data) return [];
    const term = q.trim().toLowerCase();
    const weekEnd = addDays(startOfWeek(today, settings.weekStartsOn), 6);
    const archived = new Set(data.projects.filter((p) => p.status === "archived").map((p) => p.id));
    return data.tasks.filter((t) => {
      if (t.projectId && archived.has(t.projectId) && project !== t.projectId) return false;
      if (project && (project === "none" ? t.projectId : t.projectId !== project)) return false;
      if (priority && t.priority !== priority) return false;
      if (status && t.status !== status) return false;
      if (term && !`${t.title} ${t.description}`.toLowerCase().includes(term)) return false;
      if (due === "overdue") return t.status !== "done" && !!t.dueDate && t.dueDate < today;
      if (due === "today") return t.dueDate === today || t.scheduledDate === today;
      if (due === "week") return (!!t.dueDate && t.dueDate >= today && t.dueDate <= weekEnd) || (!!t.scheduledDate && t.scheduledDate >= today && t.scheduledDate <= weekEnd);
      if (due === "none") return !t.dueDate && !t.scheduledDate;
      return true;
    });
  }, [data, q, project, priority, due, status, today, settings.weekStartsOn]);

  const pmap = useMemo(() => new Map((data?.projects ?? []).map((p) => [p.id, p])), [data]);

  const listGroups = useMemo(() => {
    const open = filtered.filter((t) => t.status !== "done");
    const byDue = (a: Task, b: Task) => (a.dueDate ?? "9").localeCompare(b.dueDate ?? "9") || PRIORITIES.findIndex((p) => p.value === a.priority) - PRIORITIES.findIndex((p) => p.value === b.priority);
    const groups: { key: string; label: string; tasks: Task[]; tone?: string }[] = [
      { key: "overdue", label: "Overdue", tone: "text-rose-500 dark:text-rose-400", tasks: open.filter((t) => t.dueDate && t.dueDate < today).sort(byDue) },
      { key: "today", label: "Today", tone: "text-amber-600 dark:text-amber-300", tasks: open.filter((t) => !(t.dueDate && t.dueDate < today) && (t.dueDate === today || t.scheduledDate === today)).sort(byDue) },
      { key: "upcoming", label: "Upcoming", tasks: open.filter((t) => t.dueDate && t.dueDate > today && t.scheduledDate !== today).sort(byDue) },
      { key: "nodate", label: "No due date", tasks: open.filter((t) => !t.dueDate && t.scheduledDate !== today).sort(byDue) },
      { key: "done", label: "Completed", tasks: filtered.filter((t) => t.status === "done").sort((a, b) => (b.completedAt ?? "").localeCompare(a.completedAt ?? "")) },
    ];
    return groups.filter((g) => g.tasks.length);
  }, [filtered, today]);

  const calEvents = useMemo<CalEvent[]>(() => {
    const out: CalEvent[] = [];
    for (const t of filtered) {
      const d = calField === "dueDate" ? t.dueDate : t.scheduledDate;
      if (!d) continue;
      out.push({
        id: t.id,
        date: d,
        kind: t.status === "done" ? "done" : calField === "dueDate" ? "task" : "scheduled",
        title: t.title,
        draggableId: t.status === "done" ? undefined : t.id,
        muted: t.status === "done",
        onClick: () => openTask(t),
      });
    }
    return out;
  }, [filtered, calField, openTask]);

  if (!ready || !data) return <PageLoader />;

  const filtersActive = !!(q || project || priority || due || status);
  const openCount = data.tasks.filter((t) => t.status !== "done").length;
  const selectedTasks = selectedDay ? filtered.filter((t) => (calField === "dueDate" ? t.dueDate : t.scheduledDate) === selectedDay) : [];

  return (
    <div className="page">
      <PageHeader
        icon={CheckSquare}
        title="Tasks"
        description={`${openCount} open across all projects · drag cards between columns or onto calendar days.`}
        actions={
          <Button variant="brand" onClick={() => openTask(null, { projectId: project && project !== "none" ? project : null })}>
            <ListPlus /> New task
          </Button>
        }
      />

      <div className="mb-5 flex flex-col gap-2 xl:flex-row xl:items-center">
        <Tabs value={view} onValueChange={(v) => setParam("view", v)}>
          <TabsList>
            <TabsTrigger value="board">
              <Columns3 /> Kanban
            </TabsTrigger>
            <TabsTrigger value="list">
              <List /> List
            </TabsTrigger>
            <TabsTrigger value="calendar">
              <CalendarDays /> Calendar
            </TabsTrigger>
          </TabsList>
        </Tabs>
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 size-3.5 -translate-y-1/2 text-muted-foreground" />
          <Input value={q} onChange={(e) => setParam("q", e.target.value || null)} placeholder="Search tasks…" className="pl-8" aria-label="Search tasks" />
        </div>
        <div className="grid grid-cols-2 gap-2 sm:flex">
          <ProjectSelect className="sm:w-48" projects={data.projects} value={project} onChange={(v) => setParam("project", v)} noneLabel="All projects" />
          <Select className="sm:w-36" value={priority} onValueChange={(v) => setParam("priority", v || null)} options={[{ value: "", label: "Any priority" }, ...PRIORITIES.map((p) => ({ value: p.value, label: p.label }))]} aria-label="Priority" />
          <Select className="sm:w-44" value={due} onValueChange={(v) => setParam("due", v || null)} options={DUE_FILTERS} aria-label="Due date" />
          {view === "list" && (
            <Select className="sm:w-36" value={status} onValueChange={(v) => setParam("status", v || null)} options={[{ value: "", label: "Any status" }, ...TASK_STATUSES.map((s) => ({ value: s.value, label: s.label }))]} aria-label="Status" />
          )}
          {filtersActive && (
            <Button variant="ghost" size="sm" className="h-9" onClick={() => setParams(view === "board" ? new URLSearchParams() : new URLSearchParams({ view }), { replace: true })}>
              <X /> Clear
            </Button>
          )}
        </div>
      </div>

      {data.tasks.length === 0 ? (
        <EmptyState
          icon={CheckSquare}
          title="No tasks yet"
          description="Add tasks with priorities, due dates and time estimates. Today's Focus on the Overview ranks them for you."
          action={
            <Button variant="brand" onClick={() => openTask()}>
              <ListPlus /> Add your first task
            </Button>
          }
        />
      ) : view === "board" ? (
        <KanbanBoard tasks={filtered} projects={data.projects} today={today} defaultProjectId={project && project !== "none" ? project : null} />
      ) : view === "list" ? (
        listGroups.length === 0 ? (
          <EmptyState icon={Search} title="No tasks match your filters" />
        ) : (
          <div className="space-y-4">
            {listGroups.map((g) => (
              <Card key={g.key} className="overflow-hidden">
                <div className="flex items-center gap-2 border-b bg-surface px-4 py-2">
                  <p className={`text-xs font-semibold ${g.tone ?? ""}`}>{g.label}</p>
                  <span className="text-xs tabular-nums text-muted-foreground">{g.tasks.length}</span>
                  {g.key !== "done" && (
                    <span className="ml-auto text-[11px] text-muted-foreground">
                      {fmtMinutes(g.tasks.reduce((s, t) => s + (t.estimatedMinutes ?? 0), 0))} estimated
                    </span>
                  )}
                </div>
                <div className="divide-y">
                  {g.tasks.map((t) => (
                    <TaskRow key={t.id} task={t} project={t.projectId ? pmap.get(t.projectId) : null} today={today} showStatus />
                  ))}
                </div>
              </Card>
            ))}
          </div>
        )
      ) : (
        <div className="grid gap-4 xl:grid-cols-[1fr_320px]">
          <Card className="p-4">
            <MonthCalendar
              month={month}
              onMonthChange={setMonth}
              today={today}
              events={calEvents}
              selected={selectedDay}
              onSelect={setSelectedDay}
              weekStartsOn={settings.weekStartsOn}
              onDropTask={async (id, date) => {
                await rescheduleTask(id, calField, date);
                toast.success(`${calField === "dueDate" ? "Due date" : "Schedule"} moved to ${fmtLong(date)}`);
              }}
              toolbar={
                <Tabs value={calField} onValueChange={(v) => setCalField(v as "dueDate" | "scheduledDate")}>
                  <TabsList className="h-8">
                    <TabsTrigger value="dueDate">Due dates</TabsTrigger>
                    <TabsTrigger value="scheduledDate">Scheduled</TabsTrigger>
                  </TabsList>
                </Tabs>
              }
            />
            <div className="mt-3">
              <CalendarLegend kinds={[calField === "dueDate" ? "task" : "scheduled", "done"]} />
            </div>
          </Card>
          <Card className="h-fit">
            <div className="flex items-center justify-between border-b px-4 py-3">
              <div>
                <p className="text-sm font-semibold">{selectedDay ? fmtLong(selectedDay) : "Select a day"}</p>
                <p className="text-[11px] text-muted-foreground">{selectedTasks.length} task{selectedTasks.length === 1 ? "" : "s"}</p>
              </div>
              {selectedDay && (
                <Button size="xs" variant="outline" onClick={() => openTask(null, { [calField]: selectedDay, projectId: project && project !== "none" ? project : null })}>
                  <ListPlus /> Add
                </Button>
              )}
            </div>
            <div className="divide-y px-1">
              {selectedTasks.length === 0 ? (
                <p className="px-3 py-8 text-center text-xs text-muted-foreground">Nothing {calField === "dueDate" ? "due" : "scheduled"} this day.</p>
              ) : (
                selectedTasks.map((t) => <TaskRow key={t.id} task={t} project={t.projectId ? pmap.get(t.projectId) : null} today={today} />)
              )}
            </div>
          </Card>
        </div>
      )}
    </div>
  );
}
