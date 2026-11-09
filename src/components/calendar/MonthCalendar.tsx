import { useMemo, useState } from "react";
import { DndContext, DragOverlay, PointerSensor, useDraggable, useDroppable, useSensor, useSensors, type DragEndEvent } from "@dnd-kit/core";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import { addDays, addMonths, endOfMonth, fmtMonth, rangeDays, startOfMonth, startOfWeek } from "@/lib/dates";
import type { ISODate } from "@/lib/types";
import { cn } from "@/lib/utils";

export type CalEventKind = "project" | "milestone" | "task" | "scheduled" | "log" | "done";

export interface CalEvent {
  id: string;
  date: ISODate;
  kind: CalEventKind;
  title: string;
  /** Present when the chip is draggable (tasks). */
  draggableId?: string;
  muted?: boolean;
  onClick?: () => void;
}

export const KIND_STYLE: Record<CalEventKind, { chip: string; dot: string; label: string }> = {
  project: { chip: "bg-rose-500/10 text-rose-700 dark:text-rose-200 ring-rose-500/25", dot: "bg-rose-400", label: "Project deadline" },
  milestone: { chip: "bg-violet-500/10 text-violet-700 dark:text-violet-200 ring-violet-500/25", dot: "bg-violet-400", label: "Milestone" },
  task: { chip: "bg-sky-500/10 text-sky-700 dark:text-sky-200 ring-sky-500/25", dot: "bg-sky-400", label: "Task due" },
  scheduled: { chip: "bg-amber-500/10 text-amber-700 dark:text-amber-200 ring-amber-500/25", dot: "bg-amber-400", label: "Scheduled task" },
  done: { chip: "bg-emerald-500/10 text-emerald-700 dark:text-emerald-300 ring-emerald-500/20", dot: "bg-emerald-400", label: "Completed" },
  log: { chip: "bg-zinc-500/10 text-muted-foreground ring-zinc-500/20", dot: "bg-zinc-400", label: "Work logged" },
};

function Chip({ ev }: { ev: CalEvent }) {
  const { attributes, listeners, setNodeRef, isDragging } = useDraggable({ id: ev.draggableId ?? ev.id, disabled: !ev.draggableId, data: { ev } });
  return (
    <button
      ref={setNodeRef}
      {...(ev.draggableId ? { ...attributes, ...listeners } : {})}
      onClick={(e) => {
        e.stopPropagation();
        ev.onClick?.();
      }}
      title={`${KIND_STYLE[ev.kind].label}: ${ev.title}`}
      className={cn(
        "block w-full touch-none truncate rounded px-1.5 py-[3px] text-left text-[11px] font-medium leading-tight ring-1 ring-inset transition hover:brightness-125",
        KIND_STYLE[ev.kind].chip,
        ev.muted && "line-through opacity-60",
        ev.draggableId && "cursor-grab active:cursor-grabbing",
        isDragging && "opacity-30",
      )}
    >
      {ev.title}
    </button>
  );
}

function DayCell({
  date,
  inMonth,
  isToday,
  selected,
  events,
  onSelect,
  maxChips,
}: {
  date: ISODate;
  inMonth: boolean;
  isToday: boolean;
  selected: boolean;
  events: CalEvent[];
  onSelect: (d: ISODate) => void;
  maxChips: number;
}) {
  const { setNodeRef, isOver } = useDroppable({ id: `day:${date}` });
  const shown = events.slice(0, maxChips);
  const more = events.length - shown.length;
  return (
    <div
      ref={setNodeRef}
      onClick={() => onSelect(date)}
      className={cn(
        "relative flex min-h-[64px] cursor-pointer flex-col gap-1 border-b border-r p-1 transition-colors sm:min-h-[112px] sm:p-1.5",
        !inMonth && "bg-surface/50",
        selected && "bg-brand/[0.07]",
        isOver && "bg-brand/[0.12] ring-1 ring-inset ring-brand/50",
        "hover:bg-accent/30",
      )}
    >
      <span
        className={cn(
          "grid size-6 place-items-center rounded-full text-xs tabular-nums",
          !inMonth && "text-muted-foreground/50",
          isToday && "bg-brand font-semibold text-white",
          selected && !isToday && "ring-1 ring-brand",
        )}
      >
        {Number(date.slice(8))}
      </span>
      {/* Desktop chips */}
      <div className="hidden flex-col gap-0.5 sm:flex">
        {shown.map((e) => (
          <Chip key={`${e.kind}-${e.id}`} ev={e} />
        ))}
        {more > 0 && <span className="px-1 text-[10px] font-medium text-muted-foreground">+{more} more</span>}
      </div>
      {/* Mobile dots */}
      <div className="flex flex-wrap gap-0.5 sm:hidden">
        {events.slice(0, 6).map((e) => (
          <span key={`${e.kind}-${e.id}`} className={cn("size-1.5 rounded-full", KIND_STYLE[e.kind].dot)} />
        ))}
      </div>
    </div>
  );
}

export function MonthCalendar({
  month,
  onMonthChange,
  today,
  events,
  selected,
  onSelect,
  weekStartsOn = 1,
  onDropTask,
  toolbar,
  maxChips = 3,
}: {
  month: ISODate;
  onMonthChange: (m: ISODate) => void;
  today: ISODate;
  events: CalEvent[];
  selected: ISODate | null;
  onSelect: (d: ISODate) => void;
  weekStartsOn?: 0 | 1;
  onDropTask?: (taskId: string, date: ISODate) => void;
  toolbar?: React.ReactNode;
  maxChips?: number;
}) {
  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 6 } }));
  const [dragging, setDragging] = useState<CalEvent | null>(null);
  const days = useMemo(() => {
    const first = startOfWeek(startOfMonth(month), weekStartsOn);
    const last = addDays(startOfWeek(endOfMonth(month), weekStartsOn), 6);
    return rangeDays(first, last);
  }, [month, weekStartsOn]);
  const byDate = useMemo(() => {
    const m = new Map<string, CalEvent[]>();
    const order: CalEventKind[] = ["project", "milestone", "task", "scheduled", "done", "log"];
    for (const e of events) {
      const arr = m.get(e.date) ?? [];
      arr.push(e);
      m.set(e.date, arr);
    }
    for (const arr of m.values()) arr.sort((a, b) => order.indexOf(a.kind) - order.indexOf(b.kind));
    return m;
  }, [events]);
  const weekdayNames = weekStartsOn === 1 ? ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"] : ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
  const monthKey = month.slice(0, 7);

  const onEnd = (e: DragEndEvent) => {
    setDragging(null);
    const ev = e.active.data.current?.ev as CalEvent | undefined;
    const over = e.over?.id;
    if (!ev?.draggableId || typeof over !== "string" || !over.startsWith("day:")) return;
    const date = over.slice(4);
    if (date !== ev.date) onDropTask?.(ev.draggableId, date);
  };

  return (
    <div>
      <div className="mb-3 flex flex-wrap items-center gap-2">
        <h2 className="mr-2 text-lg font-semibold tracking-tight">{fmtMonth(month)}</h2>
        <div className="flex items-center gap-1">
          <Button variant="outline" size="icon-sm" aria-label="Previous month" onClick={() => onMonthChange(addMonths(month, -1))}>
            <ChevronLeft />
          </Button>
          <Button variant="outline" size="sm" onClick={() => {
            onMonthChange(startOfMonth(today));
            onSelect(today);
          }}>
            Today
          </Button>
          <Button variant="outline" size="icon-sm" aria-label="Next month" onClick={() => onMonthChange(addMonths(month, 1))}>
            <ChevronRight />
          </Button>
        </div>
        <div className="ml-auto">{toolbar}</div>
      </div>
      <DndContext sensors={sensors} onDragStart={(e) => setDragging((e.active.data.current?.ev as CalEvent) ?? null)} onDragEnd={onEnd} onDragCancel={() => setDragging(null)}>
        <div className="overflow-hidden rounded-xl border-l border-t bg-card">
          <div className="grid grid-cols-7">
            {weekdayNames.map((d) => (
              <div key={d} className="border-b border-r px-2 py-2 text-[11px] font-medium uppercase tracking-wider text-muted-foreground">
                {d}
              </div>
            ))}
            {days.map((d) => (
              <DayCell
                key={d}
                date={d}
                inMonth={d.slice(0, 7) === monthKey}
                isToday={d === today}
                selected={d === selected}
                events={byDate.get(d) ?? []}
                onSelect={onSelect}
                maxChips={maxChips}
              />
            ))}
          </div>
        </div>
        <DragOverlay>{dragging ? <div className={cn("rounded px-2 py-1 text-[11px] font-medium shadow-xl ring-1", KIND_STYLE[dragging.kind].chip, "bg-popover")}>{dragging.title}</div> : null}</DragOverlay>
      </DndContext>
    </div>
  );
}

export function CalendarLegend({ kinds }: { kinds: CalEventKind[] }) {
  return (
    <div className="flex flex-wrap gap-x-4 gap-y-1.5">
      {kinds.map((k) => (
        <span key={k} className="inline-flex items-center gap-1.5 text-xs text-muted-foreground">
          <span className={cn("size-2 rounded-full", KIND_STYLE[k].dot)} />
          {KIND_STYLE[k].label}
        </span>
      ))}
    </div>
  );
}
