import { CalendarClock, CalendarDays, Clock, MoreHorizontal, Pencil, Trash2 } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";
import { Checkbox } from "@/components/ui/misc";
import { Button } from "@/components/ui/button";
import { ConfirmDialog } from "@/components/ui/alert-dialog";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuLabel, DropdownMenuSeparator, DropdownMenuTrigger } from "@/components/ui/dropdown";
import { PriorityBadge, TaskStatusPill } from "@/components/common/badges";
import { TASK_STATUSES, CATEGORIES } from "@/lib/constants";
import { addDays, diffDays, relativeDay } from "@/lib/dates";
import { deleteTask, rescheduleTask, setTaskStatus } from "@/lib/repo";
import type { ISODate, Project, Task } from "@/lib/types";
import { cn, fmtMinutes } from "@/lib/utils";
import { useUI } from "@/providers/ui";

export function DueLabel({ date, today, done, scheduled }: { date: ISODate | null; today: ISODate; done?: boolean; scheduled?: boolean }) {
  if (!date) return null;
  const d = diffDays(date, today);
  const tone = done ? "text-muted-foreground" : d < 0 ? "text-rose-500 dark:text-rose-400" : d === 0 ? "text-amber-600 dark:text-amber-300" : d <= 2 ? "text-sky-600 dark:text-sky-300" : "text-muted-foreground";
  const Icon = scheduled ? CalendarDays : CalendarClock;
  return (
    <span className={cn("inline-flex items-center gap-1 whitespace-nowrap text-xs", tone)} title={scheduled ? `Scheduled ${date}` : `Due ${date}`}>
      <Icon className="size-3" />
      {!done && d < 0 && !scheduled ? `Overdue · ${relativeDay(date, today)}` : relativeDay(date, today)}
    </span>
  );
}

export async function toggleDone(task: Task) {
  const next = task.status === "done" ? "todo" : "done";
  await setTaskStatus(task.id, next);
  if (next === "done")
    toast.success("Task completed", {
      description: task.title,
      action: { label: "Undo", onClick: () => setTaskStatus(task.id, task.status) },
    });
}

export function TaskActions({ task, today }: { task: Task; today: ISODate }) {
  const { openTask } = useUI();
  const [confirm, setConfirm] = useState(false);
  return (
    <>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button variant="ghost" size="icon-xs" aria-label="Task actions" onClick={(e) => e.stopPropagation()}>
            <MoreHorizontal />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent onClick={(e) => e.stopPropagation()}>
          <DropdownMenuItem onSelect={() => openTask(task)}>
            <Pencil /> Edit
          </DropdownMenuItem>
          <DropdownMenuSeparator />
          <DropdownMenuLabel>Status</DropdownMenuLabel>
          {TASK_STATUSES.filter((s) => s.value !== task.status).map((s) => (
            <DropdownMenuItem key={s.value} onSelect={() => setTaskStatus(task.id, s.value)}>
              <span className={cn("ml-0.5 mr-0.5 size-1.5 rounded-full", s.dot)} /> {s.label}
            </DropdownMenuItem>
          ))}
          <DropdownMenuSeparator />
          <DropdownMenuLabel>Schedule</DropdownMenuLabel>
          <DropdownMenuItem onSelect={() => rescheduleTask(task.id, "scheduledDate", today)}>
            <CalendarDays /> Work on it today
          </DropdownMenuItem>
          <DropdownMenuItem onSelect={() => rescheduleTask(task.id, "scheduledDate", addDays(today, 1))}>
            <CalendarDays /> Tomorrow
          </DropdownMenuItem>
          {task.scheduledDate && (
            <DropdownMenuItem onSelect={() => rescheduleTask(task.id, "scheduledDate", null)}>
              <CalendarDays /> Unschedule
            </DropdownMenuItem>
          )}
          <DropdownMenuSeparator />
          <DropdownMenuItem destructive onSelect={() => setConfirm(true)}>
            <Trash2 /> Delete
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
      <ConfirmDialog
        open={confirm}
        onOpenChange={setConfirm}
        title="Delete this task?"
        description={`“${task.title}” will be permanently removed.`}
        onConfirm={async () => {
          await deleteTask(task.id);
          toast.success("Task deleted");
        }}
      />
    </>
  );
}

export function TaskRow({
  task,
  project,
  today,
  showProject = true,
  showStatus = false,
  className,
}: {
  task: Task;
  project?: Project | null;
  today: ISODate;
  showProject?: boolean;
  showStatus?: boolean;
  className?: string;
}) {
  const { openTask } = useUI();
  const done = task.status === "done";
  const dot = project ? CATEGORIES.find((c) => c.value === project.category)?.dot : undefined;
  return (
    <div
      className={cn("group flex cursor-pointer items-center gap-3 px-3 py-2.5 transition-colors hover:bg-accent/40", className)}
      onClick={() => openTask(task)}
      role="button"
      tabIndex={0}
      onKeyDown={(e) => e.key === "Enter" && openTask(task)}
    >
      <Checkbox
        checked={done}
        onClick={(e) => e.stopPropagation()}
        onCheckedChange={() => toggleDone(task)}
        aria-label={done ? "Mark as not done" : "Mark as done"}
      />
      <div className="min-w-0 flex-1">
        <p className={cn("truncate text-sm", done && "text-muted-foreground line-through decoration-muted-foreground/50")}>{task.title}</p>
        <div className="mt-0.5 flex flex-wrap items-center gap-x-3 gap-y-0.5">
          {showProject && project && (
            <span className="inline-flex max-w-[180px] items-center gap-1.5 truncate text-xs text-muted-foreground">
              <span className={cn("size-1.5 shrink-0 rounded-full", dot)} />
              <span className="truncate">{project.name}</span>
            </span>
          )}
          {showStatus && <TaskStatusPill status={task.status} />}
          <DueLabel date={task.dueDate} today={today} done={done} />
          {task.scheduledDate && task.scheduledDate !== task.dueDate && !done && <DueLabel date={task.scheduledDate} today={today} scheduled />}
          {(task.estimatedMinutes || task.actualMinutes) && (
            <span className="inline-flex items-center gap-1 text-xs text-muted-foreground">
              <Clock className="size-3" />
              {task.actualMinutes ? fmtMinutes(task.actualMinutes) : "—"}
              {task.estimatedMinutes ? ` / ${fmtMinutes(task.estimatedMinutes)}` : ""}
            </span>
          )}
        </div>
      </div>
      <PriorityBadge priority={task.priority} compact className="hidden sm:inline-flex" />
      <div className="opacity-100 transition-opacity md:opacity-0 md:group-hover:opacity-100 md:group-focus-within:opacity-100">
        <TaskActions task={task} today={today} />
      </div>
    </div>
  );
}
