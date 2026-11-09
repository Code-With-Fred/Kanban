import { useMemo, useState } from "react";
import {
  DndContext,
  DragOverlay,
  KeyboardSensor,
  PointerSensor,
  closestCorners,
  useDraggable,
  useDroppable,
  useSensor,
  useSensors,
  type DragEndEvent,
  type DragStartEvent,
} from "@dnd-kit/core";
import { Clock, Plus } from "lucide-react";
import { PriorityBadge } from "@/components/common/badges";
import { Button } from "@/components/ui/button";
import { CATEGORIES, TASK_STATUSES } from "@/lib/constants";
import { setTaskStatus } from "@/lib/repo";
import type { ISODate, Project, Task, TaskStatus } from "@/lib/types";
import { cn, fmtMinutes } from "@/lib/utils";
import { useUI } from "@/providers/ui";
import { DueLabel, TaskActions } from "./TaskRow";

function Card({ task, project, today, overlay }: { task: Task; project?: Project | null; today: ISODate; overlay?: boolean }) {
  const { openTask } = useUI();
  const dot = project ? CATEGORIES.find((c) => c.value === project.category)?.dot : undefined;
  return (
    <div
      onClick={() => !overlay && openTask(task)}
      className={cn(
        "group cursor-grab rounded-lg border bg-card p-3 text-left shadow-sm transition-[border-color,box-shadow] hover:border-foreground/15 active:cursor-grabbing",
        overlay && "rotate-[1.5deg] cursor-grabbing border-brand/40 shadow-2xl shadow-black/40",
      )}
    >
      <div className="flex items-start gap-2">
        <p className={cn("flex-1 text-[13px] font-medium leading-snug", task.status === "done" && "text-muted-foreground line-through")}>{task.title}</p>
        <div className="-mr-1 -mt-1 opacity-100 md:opacity-0 md:group-hover:opacity-100" onPointerDown={(e) => e.stopPropagation()}>
          <TaskActions task={task} today={today} />
        </div>
      </div>
      {task.description && <p className="mt-1 line-clamp-2 text-xs text-muted-foreground">{task.description}</p>}
      <div className="mt-2.5 flex flex-wrap items-center gap-2">
        <PriorityBadge priority={task.priority} />
        <DueLabel date={task.dueDate} today={today} done={task.status === "done"} />
        {task.estimatedMinutes ? (
          <span className="inline-flex items-center gap-1 text-[11px] text-muted-foreground">
            <Clock className="size-3" /> {fmtMinutes(task.estimatedMinutes)}
          </span>
        ) : null}
      </div>
      {project && (
        <p className="mt-2 flex items-center gap-1.5 truncate border-t pt-2 text-[11px] text-muted-foreground">
          <span className={cn("size-1.5 shrink-0 rounded-full", dot)} />
          <span className="truncate">{project.name}</span>
        </p>
      )}
    </div>
  );
}

function DraggableCard(props: { task: Task; project?: Project | null; today: ISODate }) {
  const { attributes, listeners, setNodeRef, isDragging } = useDraggable({ id: props.task.id, data: { task: props.task } });
  return (
    <div ref={setNodeRef} {...attributes} {...listeners} className={cn("touch-none outline-none", isDragging && "opacity-30")}>
      <Card {...props} />
    </div>
  );
}

function Column({
  status,
  label,
  dot,
  tasks,
  projects,
  today,
  defaultProjectId,
}: {
  status: TaskStatus;
  label: string;
  dot: string;
  tasks: Task[];
  projects: Map<string, Project>;
  today: ISODate;
  defaultProjectId?: string | null;
}) {
  const { setNodeRef, isOver } = useDroppable({ id: status });
  const { openTask } = useUI();
  const minutes = tasks.reduce((s, t) => s + (t.estimatedMinutes ?? 0), 0);
  return (
    <div className="flex w-[280px] shrink-0 flex-col md:w-auto md:min-w-0 md:flex-1">
      <div className="mb-2 flex items-center gap-2 px-1">
        <span className={cn("size-2 rounded-full", dot)} />
        <p className="text-xs font-semibold">{label}</p>
        <span className="text-xs tabular-nums text-muted-foreground">{tasks.length}</span>
        {minutes > 0 && <span className="text-[11px] text-muted-foreground">· {fmtMinutes(minutes)}</span>}
        <Button variant="ghost" size="icon-xs" className="ml-auto" aria-label={`Add task to ${label}`} onClick={() => openTask(null, { status, projectId: defaultProjectId ?? null })}>
          <Plus />
        </Button>
      </div>
      <div
        ref={setNodeRef}
        className={cn(
          "flex min-h-[200px] flex-1 flex-col gap-2 rounded-xl border border-transparent bg-surface/60 p-2 transition-colors",
          isOver && "border-brand/40 bg-brand/[0.06]",
        )}
      >
        {tasks.map((t) => (
          <DraggableCard key={t.id} task={t} project={t.projectId ? projects.get(t.projectId) : null} today={today} />
        ))}
        {tasks.length === 0 && <p className="grid flex-1 place-items-center py-6 text-xs text-muted-foreground/70">Drop tasks here</p>}
      </div>
    </div>
  );
}

export function KanbanBoard({ tasks, projects, today, defaultProjectId }: { tasks: Task[]; projects: Project[]; today: ISODate; defaultProjectId?: string | null }) {
  const pmap = useMemo(() => new Map(projects.map((p) => [p.id, p])), [projects]);
  const [active, setActive] = useState<Task | null>(null);
  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 6 } }), useSensor(KeyboardSensor));

  const columns = useMemo(() => {
    const byStatus: Record<TaskStatus, Task[]> = { todo: [], in_progress: [], review: [], done: [] };
    for (const t of tasks) byStatus[t.status].push(t);
    for (const k of Object.keys(byStatus) as TaskStatus[]) {
      byStatus[k].sort((a, b) =>
        k === "done" ? (b.completedAt ?? "").localeCompare(a.completedAt ?? "") : a.order - b.order || (a.dueDate ?? "9").localeCompare(b.dueDate ?? "9"),
      );
    }
    return byStatus;
  }, [tasks]);

  const onStart = (e: DragStartEvent) => setActive((e.active.data.current?.task as Task) ?? null);
  const onEnd = async (e: DragEndEvent) => {
    setActive(null);
    const task = e.active.data.current?.task as Task | undefined;
    const to = e.over?.id as TaskStatus | undefined;
    if (!task || !to || task.status === to) return;
    // Drop at the top of the target column.
    const first = columns[to][0];
    await setTaskStatus(task.id, to, first ? first.order - 1000 : 1000);
  };

  return (
    <DndContext sensors={sensors} collisionDetection={closestCorners} onDragStart={onStart} onDragEnd={onEnd} onDragCancel={() => setActive(null)}>
      <div className="-mx-4 flex gap-3 overflow-x-auto px-4 pb-2 md:mx-0 md:px-0">
        {TASK_STATUSES.map((s) => (
          <Column key={s.value} status={s.value} label={s.label} dot={s.dot} tasks={columns[s.value]} projects={pmap} today={today} defaultProjectId={defaultProjectId} />
        ))}
      </div>
      <DragOverlay dropAnimation={{ duration: 180, easing: "cubic-bezier(0.16,1,0.3,1)" }}>
        {active ? <Card task={active} project={active.projectId ? pmap.get(active.projectId) : null} today={today} overlay /> : null}
      </DragOverlay>
    </DndContext>
  );
}
