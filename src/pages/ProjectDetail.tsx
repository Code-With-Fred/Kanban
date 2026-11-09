import { useEffect, useMemo, useRef, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { toast } from "sonner";
import {
  ArrowLeft,
  CalendarClock,
  CalendarRange,
  Check,
  CheckSquare,
  Clock,
  ExternalLink,
  Flag,
  FolderGit2,
  Globe,
  ListPlus,
  MoreHorizontal,
  NotebookPen,
  Pencil,
  Plus,
  StickyNote,
  Trash2,
  Zap,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input, Textarea } from "@/components/ui/input";
import { Checkbox, Progress, Tabs, TabsList, TabsTrigger } from "@/components/ui/misc";
import { CategoryTag, PriorityBadge, ProjectStatusBadge } from "@/components/common/badges";
import { EmptyState } from "@/components/common/layout";
import { PageLoader } from "@/components/common/PageLoader";
import { ProjectMenu } from "@/components/projects/ProjectMenu";
import { KanbanBoard } from "@/components/tasks/KanbanBoard";
import { TaskRow } from "@/components/tasks/TaskRow";
import { WorkLogItem } from "@/components/worklog/WorkLogItem";
import { useDataset, useSettings, useToday } from "@/hooks/data";
import { diffDays, fmtMedium, relativeDay, timeAgo } from "@/lib/dates";
import { lastProjectActivity, projectProgress } from "@/lib/insights";
import { addMilestone, deleteMilestone, patchProject, toggleMilestone, updateMilestone } from "@/lib/repo";
import { firstError } from "@/lib/schemas";
import type { Milestone } from "@/lib/types";
import { cn, fmtMinutes } from "@/lib/utils";
import { useUI } from "@/providers/ui";

function MilestoneRow({ m, today }: { m: Milestone; today: string }) {
  const [editing, setEditing] = useState(false);
  const [title, setTitle] = useState(m.title);
  const [due, setDue] = useState(m.dueDate ?? "");
  const overdue = !m.completedAt && m.dueDate && m.dueDate < today;
  const save = async () => {
    try {
      await updateMilestone(m.id, { title, dueDate: due || null });
      setEditing(false);
    } catch (e) {
      toast.error(firstError(e));
    }
  };
  if (editing)
    return (
      <form
        className="flex flex-wrap items-center gap-2 py-2"
        onSubmit={(e) => {
          e.preventDefault();
          save();
        }}
      >
        <Input autoFocus value={title} onChange={(e) => setTitle(e.target.value)} className="h-8 min-w-[10rem] flex-1" />
        <Input type="date" value={due} onChange={(e) => setDue(e.target.value)} className="h-8 w-40" />
        <Button size="xs" type="submit">
          Save
        </Button>
        <Button size="xs" variant="ghost" type="button" onClick={() => setEditing(false)}>
          Cancel
        </Button>
      </form>
    );
  return (
    <div className="group flex items-center gap-3 py-2">
      <Checkbox checked={!!m.completedAt} onCheckedChange={() => toggleMilestone(m.id)} aria-label="Toggle milestone" />
      <div className="min-w-0 flex-1">
        <p className={cn("truncate text-sm", m.completedAt && "text-muted-foreground line-through")}>{m.title}</p>
        {m.dueDate && (
          <p className={cn("text-[11px]", overdue ? "text-rose-500 dark:text-rose-400" : "text-muted-foreground")}>
            {m.completedAt ? `Reached ${timeAgo(m.completedAt)}` : `${overdue ? "Overdue · " : ""}${relativeDay(m.dueDate, today)} · ${fmtMedium(m.dueDate)}`}
          </p>
        )}
      </div>
      <div className="flex opacity-100 md:opacity-0 md:group-hover:opacity-100">
        <Button variant="ghost" size="icon-xs" aria-label="Edit milestone" onClick={() => setEditing(true)}>
          <Pencil />
        </Button>
        <Button variant="ghost" size="icon-xs" aria-label="Delete milestone" onClick={() => deleteMilestone(m.id).then(() => toast.success("Milestone removed"))}>
          <Trash2 />
        </Button>
      </div>
    </div>
  );
}

function NotesEditor({ id, initial }: { id: string; initial: string }) {
  const [value, setValue] = useState(initial);
  const [state, setState] = useState<"idle" | "saving" | "saved">("idle");
  const timer = useRef<ReturnType<typeof setTimeout>>(undefined);
  const latest = useRef(initial);
  useEffect(() => {
    // Sync if changed elsewhere (e.g. edit dialog) while not typing.
    if (initial !== latest.current) {
      setValue(initial);
      latest.current = initial;
    }
  }, [initial]);
  const save = (v: string) => {
    clearTimeout(timer.current);
    setState("saving");
    timer.current = setTimeout(async () => {
      try {
        await patchProject(id, { notes: v });
        latest.current = v;
        setState("saved");
      } catch (e) {
        toast.error(firstError(e));
        setState("idle");
      }
    }, 600);
  };
  useEffect(() => () => clearTimeout(timer.current), []);
  return (
    <div>
      <Textarea
        value={value}
        onChange={(e) => {
          setValue(e.target.value);
          save(e.target.value);
        }}
        rows={8}
        placeholder="Decisions, client contacts, env setup, ideas… Saved automatically."
        className="min-h-[180px] font-mono text-[13px] leading-relaxed"
      />
      <p className="mt-1.5 h-4 text-[11px] text-muted-foreground">
        {state === "saving" ? "Saving…" : state === "saved" ? (
          <span className="inline-flex items-center gap-1">
            <Check className="size-3 text-emerald-500" /> Saved
          </span>
        ) : null}
      </p>
    </div>
  );
}

export default function ProjectDetail() {
  const { id } = useParams<{ id: string }>();
  const today = useToday();
  const settings = useSettings();
  const { ready, data } = useDataset();
  const { openProject, openTask, openLog } = useUI();
  const [taskView, setTaskView] = useState<"list" | "board">("list");
  const [showDone, setShowDone] = useState(false);
  const [msTitle, setMsTitle] = useState("");
  const [msDue, setMsDue] = useState("");

  const v = useMemo(() => {
    if (!data || !id) return null;
    const project = data.projects.find((p) => p.id === id);
    if (!project) return null;
    const tasks = data.tasks.filter((t) => t.projectId === id);
    const logs = data.logs.filter((l) => l.projectId === id).sort((a, b) => b.date.localeCompare(a.date) || b.createdAt.localeCompare(a.createdAt));
    const milestones = data.milestones.filter((m) => m.projectId === id).sort((a, b) => (a.dueDate ?? "9").localeCompare(b.dueDate ?? "9"));
    const minutes = logs.reduce((s, l) => s + l.minutes, 0);
    const open = tasks.filter((t) => t.status !== "done");
    const done = tasks.filter((t) => t.status === "done");
    const est = open.reduce((s, t) => s + (t.estimatedMinutes ?? 0), 0);
    return { project, tasks, logs, milestones, minutes, open, done, est, progress: projectProgress(project, data.tasks), last: lastProjectActivity(project, data.tasks, data.logs) };
  }, [data, id]);

  if (!ready) return <PageLoader />;
  if (!v)
    return (
      <div className="page">
        <EmptyState
          icon={FolderGit2}
          title="Project not found"
          description="It may have been deleted."
          action={
            <Button variant="outline" size="sm" asChild>
              <Link to="/projects">
                <ArrowLeft /> Back to projects
              </Link>
            </Button>
          }
        />
      </div>
    );

  const { project: p } = v;
  const daysLeft = p.deadline ? diffDays(p.deadline, today) : null;
  const finished = p.status === "completed" || p.status === "archived";

  return (
    <div className="page space-y-5">
      <Link to="/projects" className="inline-flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground">
        <ArrowLeft className="size-3.5" /> My Projects
      </Link>

      {/* Header */}
      <div className="glow-card hairline-top rounded-2xl border p-5 md:p-6">
        <div className="flex flex-col gap-4 md:flex-row md:items-start md:justify-between">
          <div className="min-w-0 animate-fade-up">
            <div className="flex flex-wrap items-center gap-2">
              <CategoryTag category={p.category} />
              <ProjectStatusBadge status={p.status} />
              <PriorityBadge priority={p.priority} />
            </div>
            <h1 className="mt-2 text-2xl font-semibold tracking-tight md:text-3xl">{p.name}</h1>
            {p.description && <p className="mt-2 max-w-3xl whitespace-pre-line text-sm text-muted-foreground">{p.description}</p>}
            <div className="mt-3 flex flex-wrap gap-2">
              {p.projectUrl && (
                <Button variant="outline" size="xs" asChild>
                  <a href={p.projectUrl} target="_blank" rel="noreferrer noopener">
                    <Globe /> Live site <ExternalLink className="opacity-60" />
                  </a>
                </Button>
              )}
              {p.repoUrl && (
                <Button variant="outline" size="xs" asChild>
                  <a href={p.repoUrl} target="_blank" rel="noreferrer noopener">
                    <FolderGit2 /> Repository <ExternalLink className="opacity-60" />
                  </a>
                </Button>
              )}
              {p.technologies.map((t) => (
                <span key={t} className="inline-flex h-7 items-center rounded bg-accent px-2 font-mono text-[11px] text-muted-foreground">
                  {t}
                </span>
              ))}
            </div>
          </div>
          <div className="flex shrink-0 gap-2">
            <Button variant="brand" size="sm" onClick={() => openLog(null, { projectId: p.id })}>
              <Zap /> Log work
            </Button>
            <Button variant="outline" size="sm" onClick={() => openProject(p)}>
              <Pencil /> Edit
            </Button>
            <ProjectMenu
              project={p}
              afterDelete="/projects"
              trigger={
                <Button variant="outline" size="icon-sm" aria-label="More actions">
                  <MoreHorizontal />
                </Button>
              }
            />
          </div>
        </div>

        <div className="mt-5 grid gap-4 border-t pt-5 sm:grid-cols-2 lg:grid-cols-4">
          <div>
            <p className="text-xs text-muted-foreground">Progress {p.progressMode === "tasks" ? "· from tasks" : "· manual"}</p>
            <div className="mt-2 flex items-center gap-3">
              <Progress value={v.progress} className="h-2 flex-1" />
              <span className="text-sm font-semibold tabular-nums">{v.progress}%</span>
            </div>
            {p.progressMode === "manual" && (
              <input
                type="range"
                min={0}
                max={100}
                step={5}
                value={p.progress}
                onChange={(e) => patchProject(p.id, { progress: Number(e.target.value) })}
                className="mt-2 h-1 w-full cursor-pointer accent-violet-500"
                aria-label="Set progress"
              />
            )}
            {p.progressMode === "tasks" && <p className="mt-1.5 text-[11px] text-muted-foreground">{v.done.length} of {v.tasks.length} tasks done</p>}
          </div>
          <div>
            <p className="text-xs text-muted-foreground">Timeline</p>
            <p className="mt-1.5 flex items-center gap-1.5 text-sm">
              <CalendarRange className="size-3.5 text-muted-foreground" />
              {p.startDate ? fmtMedium(p.startDate) : "—"} → {p.deadline ? fmtMedium(p.deadline) : "—"}
            </p>
            {daysLeft !== null && !finished && (
              <p className={cn("mt-1 text-[11px]", daysLeft < 0 ? "text-rose-500 dark:text-rose-400" : daysLeft <= 3 ? "text-amber-600 dark:text-amber-300" : "text-muted-foreground")}>
                {daysLeft < 0 ? `${-daysLeft} days past deadline` : daysLeft === 0 ? "Due today" : `${daysLeft} days left`}
              </p>
            )}
          </div>
          <div>
            <p className="text-xs text-muted-foreground">Time invested</p>
            <p className="mt-1.5 flex items-center gap-1.5 text-sm font-medium">
              <Clock className="size-3.5 text-muted-foreground" /> {fmtMinutes(v.minutes)}
            </p>
            <p className="mt-1 text-[11px] text-muted-foreground">
              {v.logs.length} log entries{v.est ? ` · ~${fmtMinutes(v.est)} estimated remaining` : ""}
            </p>
          </div>
          <div>
            <p className="text-xs text-muted-foreground">Tasks</p>
            <p className="mt-1.5 flex items-center gap-1.5 text-sm font-medium">
              <CheckSquare className="size-3.5 text-muted-foreground" /> {v.open.length} open · {v.done.length} done
            </p>
            <p className="mt-1 text-[11px] text-muted-foreground">Last activity {timeAgo(v.last)}</p>
          </div>
        </div>
      </div>

      <div className="grid gap-4 xl:grid-cols-3">
        <div className="space-y-4 xl:col-span-2">
          {/* Tasks */}
          <Card>
            <CardHeader>
              <CardTitle>
                <CheckSquare className="size-4 text-brand" /> Tasks
              </CardTitle>
              <div className="flex items-center gap-2">
                <Tabs value={taskView} onValueChange={(x) => setTaskView(x as "list" | "board")}>
                  <TabsList className="h-8">
                    <TabsTrigger value="list">List</TabsTrigger>
                    <TabsTrigger value="board">Board</TabsTrigger>
                  </TabsList>
                </Tabs>
                <Button size="sm" variant="outline" onClick={() => openTask(null, { projectId: p.id })}>
                  <ListPlus /> Add
                </Button>
              </div>
            </CardHeader>
            <CardContent className={taskView === "list" ? "px-2" : ""}>
              {v.tasks.length === 0 ? (
                <EmptyState compact icon={CheckSquare} title="No tasks yet" description="Break the project into tasks to track progress and get daily focus suggestions." />
              ) : taskView === "board" ? (
                <KanbanBoard tasks={v.tasks} projects={data!.projects} today={today} defaultProjectId={p.id} />
              ) : (
                <>
                  <div className="divide-y">
                    {v.open
                      .sort((a, b) => (a.dueDate ?? "9").localeCompare(b.dueDate ?? "9"))
                      .map((t) => (
                        <TaskRow key={t.id} task={t} today={today} showProject={false} showStatus />
                      ))}
                    {v.open.length === 0 && <p className="py-4 text-center text-xs text-muted-foreground">All tasks are done. 🎉</p>}
                  </div>
                  {v.done.length > 0 && (
                    <div className="mt-2 border-t pt-2">
                      <button className="px-3 py-1 text-xs text-muted-foreground hover:text-foreground" onClick={() => setShowDone(!showDone)}>
                        {showDone ? "Hide" : "Show"} {v.done.length} completed
                      </button>
                      {showDone && (
                        <div className="divide-y">
                          {v.done.map((t) => (
                            <TaskRow key={t.id} task={t} today={today} showProject={false} />
                          ))}
                        </div>
                      )}
                    </div>
                  )}
                </>
              )}
            </CardContent>
          </Card>

          {/* Logs */}
          <Card>
            <CardHeader>
              <div>
                <CardTitle>
                  <NotebookPen className="size-4 text-muted-foreground" /> Daily progress logs
                </CardTitle>
                <CardDescription>{v.logs.length ? `${v.logs.length} entries · ${fmtMinutes(v.minutes)} total` : "Your work history on this project."}</CardDescription>
              </div>
              <Button size="sm" variant="outline" onClick={() => openLog(null, { projectId: p.id })}>
                <Plus /> Log
              </Button>
            </CardHeader>
            <CardContent>
              {v.logs.length === 0 ? (
                <EmptyState compact icon={NotebookPen} title="No progress logged yet" description="Each log becomes part of your daily and weekly reports." />
              ) : (
                <div className="space-y-2">
                  {v.logs.slice(0, 20).map((l) => (
                    <WorkLogItem key={l.id} log={l} project={p} today={today} showDate hideProject tz={settings.timezone} />
                  ))}
                  {v.logs.length > 20 && (
                    <Link to={`/work-log?project=${p.id}`} className="block pt-2 text-center text-xs text-muted-foreground hover:text-foreground">
                      View all {v.logs.length} entries →
                    </Link>
                  )}
                </div>
              )}
            </CardContent>
          </Card>
        </div>

        <div className="space-y-4">
          {/* Milestones */}
          <Card>
            <CardHeader>
              <CardTitle>
                <Flag className="size-4 text-violet-500 dark:text-violet-300" /> Milestones
              </CardTitle>
              <span className="text-xs text-muted-foreground">
                {v.milestones.filter((m) => m.completedAt).length}/{v.milestones.length}
              </span>
            </CardHeader>
            <CardContent>
              <div className="divide-y">
                {v.milestones.map((m) => (
                  <MilestoneRow key={m.id} m={m} today={today} />
                ))}
              </div>
              <form
                className="mt-2 flex gap-2"
                onSubmit={async (e) => {
                  e.preventDefault();
                  try {
                    await addMilestone(p.id, msTitle, msDue || null);
                    setMsTitle("");
                    setMsDue("");
                  } catch (err) {
                    toast.error(firstError(err));
                  }
                }}
              >
                <Input value={msTitle} onChange={(e) => setMsTitle(e.target.value)} placeholder="Add milestone…" className="h-8 flex-1" aria-label="Milestone title" />
                <Input type="date" value={msDue} onChange={(e) => setMsDue(e.target.value)} className="h-8 w-[8.5rem]" aria-label="Milestone due date" />
                <Button size="icon-sm" variant="outline" type="submit" aria-label="Add milestone" disabled={!msTitle.trim()}>
                  <Plus />
                </Button>
              </form>
            </CardContent>
          </Card>

          {/* Notes */}
          <Card>
            <CardHeader>
              <CardTitle>
                <StickyNote className="size-4 text-amber-500 dark:text-amber-300" /> Notes
              </CardTitle>
            </CardHeader>
            <CardContent>
              <NotesEditor id={p.id} initial={p.notes} />
            </CardContent>
          </Card>

          <Card className="p-4 text-xs text-muted-foreground">
            <p className="flex items-center gap-1.5">
              <CalendarClock className="size-3.5" /> Created {fmtMedium(p.createdAt.slice(0, 10))} · updated {timeAgo(p.updatedAt)}
            </p>
          </Card>
        </div>
      </div>
    </div>
  );
}
