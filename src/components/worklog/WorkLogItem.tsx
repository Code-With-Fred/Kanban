import { useState } from "react";
import { Link } from "react-router-dom";
import { toast } from "sonner";
import { AlertTriangle, ArrowRight, CheckCircle2, CircleDashed, Clock, Copy, MoreHorizontal, Pencil, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { ConfirmDialog } from "@/components/ui/alert-dialog";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger } from "@/components/ui/dropdown";
import { CATEGORIES } from "@/lib/constants";
import { fmtTime, relativeDay } from "@/lib/dates";
import { deleteWorkLog } from "@/lib/repo";
import type { Project, WorkLog } from "@/lib/types";
import { cn, fmtMinutes, toBullets } from "@/lib/utils";
import { useUI } from "@/providers/ui";

function Detail({ icon: Icon, label, text, tone }: { icon: typeof Clock; label: string; text: string; tone: string }) {
  const items = toBullets(text);
  if (!items.length) return null;
  return (
    <div>
      <p className={cn("mb-1 flex items-center gap-1.5 text-[11px] font-medium uppercase tracking-wider", tone)}>
        <Icon className="size-3" /> {label}
      </p>
      <ul className="space-y-0.5">
        {items.map((t, i) => (
          <li key={i} className="text-[13px] leading-snug text-foreground/85">
            {t}
          </li>
        ))}
      </ul>
    </div>
  );
}

export function WorkLogItem({
  log,
  project,
  today,
  tz,
  showDate,
  hideProject,
}: {
  log: WorkLog;
  project?: Project | null;
  today: string;
  tz: string;
  showDate?: boolean;
  hideProject?: boolean;
}) {
  const { openLog } = useUI();
  const [confirm, setConfirm] = useState(false);
  const hasDetails = !!(log.completed || log.challenges || log.pending || log.nextSteps);
  const dot = project ? CATEGORIES.find((c) => c.value === project.category)?.dot : "bg-zinc-500";

  return (
    <div className="group rounded-xl border bg-surface/60 p-3.5 transition-colors hover:border-foreground/15">
      <div className="flex items-start gap-3">
        <div className="min-w-0 flex-1">
          <div className="mb-1 flex flex-wrap items-center gap-x-2.5 gap-y-1 text-xs text-muted-foreground">
            {!hideProject &&
              (project ? (
                <Link to={`/projects/${project.id}`} className="inline-flex items-center gap-1.5 font-medium text-foreground/90 hover:underline">
                  <span className={cn("size-1.5 rounded-full", dot)} /> {project.name}
                </Link>
              ) : (
                <span className="inline-flex items-center gap-1.5 font-medium">
                  <span className="size-1.5 rounded-full bg-zinc-500" /> General
                </span>
              ))}
            <span className="inline-flex items-center gap-1 rounded bg-brand/10 px-1.5 py-0.5 font-medium tabular-nums text-foreground/90">
              <Clock className="size-3" /> {fmtMinutes(log.minutes)}
            </span>
            {showDate && <span>{relativeDay(log.date, today)}</span>}
            <span className="text-muted-foreground/70">{fmtTime(log.createdAt, tz)}</span>
          </div>
          <p className="whitespace-pre-line text-sm leading-relaxed">{log.workedOn}</p>
        </div>
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="ghost" size="icon-xs" aria-label="Log actions" className="opacity-100 md:opacity-0 md:group-hover:opacity-100 data-[state=open]:opacity-100">
              <MoreHorizontal />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent>
            <DropdownMenuItem onSelect={() => openLog(log)}>
              <Pencil /> Edit
            </DropdownMenuItem>
            <DropdownMenuItem
              onSelect={() =>
                openLog(null, {
                  projectId: log.projectId,
                  workedOn: log.nextSteps ? toBullets(log.nextSteps).join("; ") : log.workedOn,
                  minutes: log.minutes,
                })
              }
            >
              <Copy /> Log again (today)
            </DropdownMenuItem>
            <DropdownMenuSeparator />
            <DropdownMenuItem destructive onSelect={() => setConfirm(true)}>
              <Trash2 /> Delete
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
      {hasDetails && (
        <div className="mt-3 grid gap-3 border-t pt-3 sm:grid-cols-2">
          <Detail icon={CheckCircle2} label="Completed" text={log.completed} tone="text-emerald-600 dark:text-emerald-400" />
          <Detail icon={AlertTriangle} label="Challenges" text={log.challenges} tone="text-rose-600 dark:text-rose-400" />
          <Detail icon={CircleDashed} label="Pending" text={log.pending} tone="text-amber-600 dark:text-amber-400" />
          <Detail icon={ArrowRight} label="Next" text={log.nextSteps} tone="text-sky-600 dark:text-sky-400" />
        </div>
      )}
      <ConfirmDialog
        open={confirm}
        onOpenChange={setConfirm}
        title="Delete this log entry?"
        description="It will be removed from your history and future reports."
        onConfirm={async () => {
          await deleteWorkLog(log.id);
          toast.success("Log entry deleted");
        }}
      />
    </div>
  );
}
