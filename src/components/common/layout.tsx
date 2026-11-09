import type { LucideIcon } from "lucide-react";
import * as React from "react";
import { Card } from "@/components/ui/card";
import { cn } from "@/lib/utils";

export function PageHeader({
  title,
  description,
  actions,
  icon: Icon,
}: {
  title: React.ReactNode;
  description?: React.ReactNode;
  actions?: React.ReactNode;
  icon?: LucideIcon;
}) {
  return (
    <div className="mb-6 flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
      <div className="min-w-0 animate-fade-up">
        <h1 className="flex items-center gap-2.5 text-2xl font-semibold tracking-tight">
          {Icon && (
            <span className="grid size-8 place-items-center rounded-lg border bg-surface">
              <Icon className="size-4 text-brand" />
            </span>
          )}
          {title}
        </h1>
        {description && <p className="mt-1.5 text-sm text-muted-foreground">{description}</p>}
      </div>
      {actions && <div className="flex flex-wrap items-center gap-2">{actions}</div>}
    </div>
  );
}

export function EmptyState({
  icon: Icon,
  title,
  description,
  action,
  className,
  compact,
}: {
  icon: LucideIcon;
  title: string;
  description?: React.ReactNode;
  action?: React.ReactNode;
  className?: string;
  compact?: boolean;
}) {
  return (
    <div
      className={cn(
        "flex flex-col items-center justify-center rounded-xl border border-dashed text-center",
        compact ? "px-4 py-8" : "px-6 py-14",
        className,
      )}
    >
      <div className="relative mb-3">
        <div className="absolute inset-0 rounded-full bg-brand/20 blur-xl" />
        <div className="relative grid size-10 place-items-center rounded-xl border bg-surface">
          <Icon className="size-4.5 size-[18px] text-muted-foreground" />
        </div>
      </div>
      <p className="text-sm font-medium">{title}</p>
      {description && <p className="mt-1 max-w-sm text-xs text-muted-foreground">{description}</p>}
      {action && <div className="mt-4">{action}</div>}
    </div>
  );
}

export function StatCard({
  label,
  value,
  icon: Icon,
  hint,
  tone = "default",
  onClick,
  delay = 0,
}: {
  label: string;
  value: React.ReactNode;
  icon: LucideIcon;
  hint?: React.ReactNode;
  tone?: "default" | "violet" | "emerald" | "amber" | "rose" | "sky";
  onClick?: () => void;
  delay?: number;
}) {
  const tones: Record<string, string> = {
    default: "text-muted-foreground bg-muted",
    violet: "text-violet-700 dark:text-violet-300 bg-violet-500/10",
    emerald: "text-emerald-700 dark:text-emerald-300 bg-emerald-500/10",
    amber: "text-amber-700 dark:text-amber-300 bg-amber-500/10",
    rose: "text-rose-700 dark:text-rose-300 bg-rose-500/10",
    sky: "text-sky-700 dark:text-sky-300 bg-sky-500/10",
  };
  return (
    <Card
      onClick={onClick}
      style={{ animationDelay: `${delay}ms` }}
      className={cn(
        "group animate-fade-up p-4 transition-colors",
        onClick && "cursor-pointer hover:border-foreground/15 hover:bg-elevated",
      )}
    >
      <div className="flex items-start justify-between">
        <p className="text-xs font-medium text-muted-foreground">{label}</p>
        <span className={cn("grid size-7 place-items-center rounded-md", tones[tone])}>
          <Icon className="size-3.5" />
        </span>
      </div>
      <p className="mt-2 text-2xl font-semibold tabular-nums tracking-tight">{value}</p>
      {hint && <p className="mt-0.5 truncate text-xs text-muted-foreground">{hint}</p>}
    </Card>
  );
}

export function SectionLabel({ children, className }: { children: React.ReactNode; className?: string }) {
  return <p className={cn("mb-2 text-[11px] font-medium uppercase tracking-wider text-muted-foreground", className)}>{children}</p>;
}
