import { useMemo } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { CalendarClock, CheckSquare, FolderKanban, FolderPlus, LayoutGrid, List, Search, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { Progress, Tabs, TabsList, TabsTrigger } from "@/components/ui/misc";
import { CategoryTag, PriorityBadge, ProjectStatusBadge } from "@/components/common/badges";
import { EmptyState, PageHeader } from "@/components/common/layout";
import { PageLoader } from "@/components/common/PageLoader";
import { ProjectMenu } from "@/components/projects/ProjectMenu";
import { useDataset, useToday } from "@/hooks/data";
import { CATEGORIES, PRIORITIES, PROJECT_STATUSES, ACTIVE_PROJECT_STATUSES } from "@/lib/constants";
import { diffDays, relativeDay, timeAgo } from "@/lib/dates";
import { lastProjectActivity, projectProgress } from "@/lib/insights";
import type { Project, Task } from "@/lib/types";
import { cn } from "@/lib/utils";
import { useUI } from "@/providers/ui";

const SORTS = [
  { value: "activity", label: "Recent activity" },
  { value: "deadline", label: "Deadline" },
  { value: "priority", label: "Priority" },
  { value: "progress", label: "Progress" },
  { value: "name", label: "Name" },
];

function DeadlineText({ date, today, done }: { date: string | null; today: string; done: boolean }) {
  if (!date) return <span className="text-muted-foreground/60">No deadline</span>;
  const d = diffDays(date, today);
  return (
    <span className={cn(!done && d < 0 ? "text-rose-500 dark:text-rose-400" : !done && d <= 3 ? "text-amber-600 dark:text-amber-300" : "text-muted-foreground")}>
      {!done && d < 0 ? `${-d}d overdue` : relativeDay(date, today)}
    </span>
  );
}

function ProjectCard({ p, tasks, today, last }: { p: Project; tasks: Task[]; today: string; last: string }) {
  const mine = tasks.filter((t) => t.projectId === p.id);
  const open = mine.filter((t) => t.status !== "done").length;
  const progress = projectProgress(p, tasks);
  const done = p.status === "completed" || p.status === "archived";
  return (
    <Link to={`/projects/${p.id}`} className="group block">
      <Card className="flex h-full flex-col p-4 transition-all duration-200 group-hover:-translate-y-0.5 group-hover:border-foreground/15 group-hover:bg-elevated group-hover:shadow-xl group-hover:shadow-black/20">
        <div className="flex items-start justify-between gap-2">
          <CategoryTag category={p.category} />
          <div className="-mr-1 -mt-1 flex items-center gap-1" onClick={(e) => e.preventDefault()}>
            <ProjectMenu project={p} />
          </div>
        </div>
        <h3 className="mt-2 line-clamp-1 text-[15px] font-semibold tracking-tight">{p.name}</h3>
        <p className="mt-1 line-clamp-2 min-h-[2.5rem] text-xs text-muted-foreground">{p.description || "No description yet."}</p>
        <div className="mt-3 flex flex-wrap items-center gap-1.5">
          <ProjectStatusBadge status={p.status} />
          <PriorityBadge priority={p.priority} />
        </div>
        {p.technologies.length > 0 && (
          <div className="mt-3 flex flex-wrap gap-1">
            {p.technologies.slice(0, 4).map((t) => (
              <span key={t} className="rounded bg-accent px-1.5 py-0.5 font-mono text-[10px] text-muted-foreground">
                {t}
              </span>
            ))}
            {p.technologies.length > 4 && <span className="px-1 text-[10px] text-muted-foreground">+{p.technologies.length - 4}</span>}
          </div>
        )}
        <div className="mt-auto pt-4">
          <div className="mb-1.5 flex items-center justify-between text-xs">
            <span className="text-muted-foreground">{p.progressMode === "tasks" ? "Progress (tasks)" : "Progress"}</span>
            <span className="font-medium tabular-nums">{progress}%</span>
          </div>
          <Progress value={progress} />
          <div className="mt-3 flex items-center justify-between border-t pt-3 text-xs">
            <span className="inline-flex items-center gap-1.5">
              <CalendarClock className="size-3 text-muted-foreground" />
              <DeadlineText date={p.deadline} today={today} done={done} />
            </span>
            <span className="inline-flex items-center gap-1.5 text-muted-foreground" title={`Last activity ${timeAgo(last)}`}>
              <CheckSquare className="size-3" /> {open} open · {timeAgo(last)}
            </span>
          </div>
        </div>
      </Card>
    </Link>
  );
}

export default function Projects() {
  const today = useToday();
  const { ready, data } = useDataset();
  const { openProject } = useUI();
  const [params, setParams] = useSearchParams();
  const q = params.get("q") ?? "";
  const status = params.get("status") ?? "all";
  const category = params.get("category") ?? "";
  const priority = params.get("priority") ?? "";
  const sort = params.get("sort") ?? "activity";
  const view = params.get("view") ?? "grid";

  const setParam = (k: string, v: string) => {
    const next = new URLSearchParams(params);
    if (!v || (k === "status" && v === "all") || (k === "sort" && v === "activity") || (k === "view" && v === "grid")) next.delete(k);
    else next.set(k, v);
    setParams(next, { replace: true });
  };

  const rows = useMemo(() => {
    if (!data) return [];
    const term = q.trim().toLowerCase();
    const prioRank = Object.fromEntries(PRIORITIES.map((p, i) => [p.value, i]));
    return data.projects
      .filter((p) => {
        if (status === "all") return p.status !== "archived";
        if (status === "active") return ACTIVE_PROJECT_STATUSES.includes(p.status);
        return p.status === status;
      })
      .filter((p) => !category || p.category === category)
      .filter((p) => !priority || p.priority === priority)
      .filter(
        (p) =>
          !term ||
          p.name.toLowerCase().includes(term) ||
          p.description.toLowerCase().includes(term) ||
          p.technologies.some((t) => t.toLowerCase().includes(term)) ||
          p.notes.toLowerCase().includes(term),
      )
      .map((p) => ({ p, last: lastProjectActivity(p, data.tasks, data.logs), progress: projectProgress(p, data.tasks) }))
      .sort((a, b) => {
        switch (sort) {
          case "deadline":
            return (a.p.deadline ?? "9999").localeCompare(b.p.deadline ?? "9999");
          case "priority":
            return prioRank[a.p.priority] - prioRank[b.p.priority];
          case "progress":
            return b.progress - a.progress;
          case "name":
            return a.p.name.localeCompare(b.p.name);
          default:
            return b.last.localeCompare(a.last);
        }
      });
  }, [data, q, status, category, priority, sort]);

  if (!ready || !data) return <PageLoader />;

  const counts = {
    all: data.projects.filter((p) => p.status !== "archived").length,
    active: data.projects.filter((p) => ACTIVE_PROJECT_STATUSES.includes(p.status)).length,
    ...Object.fromEntries(PROJECT_STATUSES.map((s) => [s.value, data.projects.filter((p) => p.status === s.value).length])),
  } as Record<string, number>;
  const filtersActive = !!(q || category || priority || status !== "all");

  return (
    <div className="page">
      <PageHeader
        icon={FolderKanban}
        title="My Projects"
        description="Client work, products, content and learning — every project with its tasks, milestones and history."
        actions={
          <Button variant="brand" onClick={() => openProject(null, { navigateOnCreate: true })}>
            <FolderPlus /> New project
          </Button>
        }
      />

      <div className="mb-4 flex gap-1 overflow-x-auto pb-1">
        {[{ value: "all", label: "All" }, { value: "active", label: "Active" }, ...PROJECT_STATUSES].map((s) => (
          <button
            key={s.value}
            onClick={() => setParam("status", s.value)}
            className={cn(
              "inline-flex h-8 shrink-0 items-center gap-1.5 rounded-md px-3 text-xs font-medium transition-colors",
              status === s.value ? "bg-accent text-foreground" : "text-muted-foreground hover:bg-accent/50 hover:text-foreground",
            )}
          >
            {s.label}
            <span className="tabular-nums text-muted-foreground">{counts[s.value] ?? 0}</span>
          </button>
        ))}
      </div>

      <div className="mb-5 flex flex-col gap-2 md:flex-row md:items-center">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 size-3.5 -translate-y-1/2 text-muted-foreground" />
          <Input value={q} onChange={(e) => setParam("q", e.target.value)} placeholder="Search name, description, technology, notes…" className="pl-8" aria-label="Search projects" />
        </div>
        <div className="grid grid-cols-2 gap-2 sm:flex">
          <Select className="sm:w-44" value={category} onValueChange={(v) => setParam("category", v)} options={[{ value: "", label: "All categories" }, ...CATEGORIES.map((c) => ({ value: c.value, label: c.label }))]} aria-label="Category" />
          <Select className="sm:w-36" value={priority} onValueChange={(v) => setParam("priority", v)} options={[{ value: "", label: "Any priority" }, ...PRIORITIES.map((p) => ({ value: p.value, label: p.label }))]} aria-label="Priority" />
          <Select className="sm:w-40" value={sort} onValueChange={(v) => setParam("sort", v)} options={SORTS} aria-label="Sort" />
          <Tabs value={view} onValueChange={(v) => setParam("view", v)}>
            <TabsList>
              <TabsTrigger value="grid" aria-label="Grid view">
                <LayoutGrid />
              </TabsTrigger>
              <TabsTrigger value="list" aria-label="List view">
                <List />
              </TabsTrigger>
            </TabsList>
          </Tabs>
        </div>
      </div>

      {rows.length === 0 ? (
        data.projects.length === 0 ? (
          <EmptyState
            icon={FolderKanban}
            title="No projects yet"
            description="Create your first project — a client build, a SaaS idea, a course you're taking, or your next YouTube series."
            action={
              <Button variant="brand" onClick={() => openProject(null, { navigateOnCreate: true })}>
                <FolderPlus /> Create a project
              </Button>
            }
          />
        ) : (
          <EmptyState
            icon={Search}
            title="No projects match"
            description="Try a different search or clear the filters."
            action={
              filtersActive && (
                <Button variant="outline" size="sm" onClick={() => setParams(new URLSearchParams(), { replace: true })}>
                  <X /> Clear filters
                </Button>
              )
            }
          />
        )
      ) : view === "grid" ? (
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
          {rows.map(({ p, last }) => (
            <ProjectCard key={p.id} p={p} tasks={data.tasks} today={today} last={last} />
          ))}
        </div>
      ) : (
        <Card className="overflow-hidden">
          <div className="hidden grid-cols-[minmax(0,2.4fr)_1fr_1fr_1.2fr_1fr_40px] gap-3 border-b bg-surface px-4 py-2 text-[11px] font-medium uppercase tracking-wider text-muted-foreground md:grid">
            <span>Project</span>
            <span>Status</span>
            <span>Priority</span>
            <span>Progress</span>
            <span>Deadline</span>
            <span />
          </div>
          {rows.map(({ p, progress }) => (
            <Link
              key={p.id}
              to={`/projects/${p.id}`}
              className="grid grid-cols-[1fr_auto] items-center gap-3 border-b px-4 py-3 transition-colors last:border-0 hover:bg-accent/40 md:grid-cols-[minmax(0,2.4fr)_1fr_1fr_1.2fr_1fr_40px]"
            >
              <div className="min-w-0">
                <p className="truncate text-sm font-medium">{p.name}</p>
                <CategoryTag category={p.category} />
              </div>
              <div className="hidden md:block">
                <ProjectStatusBadge status={p.status} />
              </div>
              <div className="hidden md:block">
                <PriorityBadge priority={p.priority} />
              </div>
              <div className="hidden items-center gap-2 md:flex">
                <Progress value={progress} className="flex-1" />
                <span className="w-9 text-right text-xs tabular-nums text-muted-foreground">{progress}%</span>
              </div>
              <span className="hidden text-xs md:block">
                <DeadlineText date={p.deadline} today={today} done={p.status === "completed" || p.status === "archived"} />
              </span>
              <div onClick={(e) => e.preventDefault()}>
                <ProjectMenu project={p} />
              </div>
            </Link>
          ))}
        </Card>
      )}
    </div>
  );
}
