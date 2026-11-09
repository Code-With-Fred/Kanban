import { AlertTriangle, ArrowDown, ArrowUp, ChevronsUp, Minus } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { CATEGORIES, priorityMeta, projectStatusMeta, taskStatusMeta } from "@/lib/constants";
import type { Priority, ProjectCategory, ProjectStatus, TaskStatus } from "@/lib/types";
import { cn } from "@/lib/utils";

const PRIORITY_ICON = { urgent: AlertTriangle, high: ChevronsUp, medium: ArrowUp, low: ArrowDown } as const;

export function PriorityBadge({ priority, compact, className }: { priority: Priority; compact?: boolean; className?: string }) {
  const m = priorityMeta(priority);
  const Icon = PRIORITY_ICON[priority] ?? Minus;
  return (
    <Badge className={cn(m.cls, className)} title={`${m.label} priority`}>
      <Icon className="size-3" />
      {!compact && m.label}
    </Badge>
  );
}

export function ProjectStatusBadge({ status, className }: { status: ProjectStatus; className?: string }) {
  const m = projectStatusMeta(status);
  return <Badge className={cn(m.cls, className)}>{m.label}</Badge>;
}

export function TaskStatusPill({ status }: { status: TaskStatus }) {
  const m = taskStatusMeta(status);
  return (
    <span className="inline-flex items-center gap-1.5 text-xs text-muted-foreground">
      <span className={cn("size-1.5 rounded-full", m.dot)} />
      {m.label}
    </span>
  );
}

export function CategoryTag({ category, className }: { category: ProjectCategory; className?: string }) {
  const c = CATEGORIES.find((x) => x.value === category);
  return (
    <span className={cn("inline-flex items-center gap-1.5 text-xs text-muted-foreground", className)}>
      <span className={cn("size-1.5 rounded-full", c?.dot)} />
      {c?.label}
    </span>
  );
}
