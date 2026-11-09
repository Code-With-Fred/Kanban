import { useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { toast } from "sonner";
import { Check, CheckCheck, ChevronDown, Clock, FolderGit2, GitCommitHorizontal, GitMerge, GitPullRequest, Link2, Pencil, RefreshCw, Sparkles, Undo2, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { ProjectSelect } from "@/components/common/project-select";
import { useDrafts, useProjects, useSettings, useToday } from "@/hooks/data";
import { CATEGORIES } from "@/lib/constants";
import { addDays, fmtTime, relativeDay, timeAgo } from "@/lib/dates";
import { acceptDraft, dismissDraft, linkRepo, markDraftAccepted, setTaskStatus, undoDraftDecision } from "@/lib/repo";
import { firstError } from "@/lib/schemas";
import type { Draft } from "@/lib/tracking/drafts";
import { syncGitHub } from "@/lib/tracking/github";
import type { TrackedEvent } from "@/lib/types";
import { cn, fmtMinutes, parseDuration } from "@/lib/utils";
import { useUI } from "@/providers/ui";

const EVENT_ICON: Record<TrackedEvent["kind"], typeof GitCommitHorizontal> = {
  commit: GitCommitHorizontal,
  pr_opened: GitPullRequest,
  pr_merged: GitMerge,
};

export function SyncButton({ size = "sm" }: { size?: "sm" | "xs" }) {
  const [busy, setBusy] = useState(false);
  return (
    <Button
      variant="outline"
      size={size}
      loading={busy}
      onClick={async () => {
        setBusy(true);
        try {
          const r = await syncGitHub();
          toast.success(r.newEvents ? `Found ${r.newEvents} new GitHub event${r.newEvents === 1 ? "" : "s"}` : "Up to date", {
            description: `${r.reposScanned} repo${r.reposScanned === 1 ? "" : "s"} checked`,
          });
        } catch (e) {
          toast.error(firstError(e));
        } finally {
          setBusy(false);
        }
      }}
    >
      {!busy && <RefreshCw />} Sync now
    </Button>
  );
}

function DraftCard({ draft, today, tz }: { draft: Draft; today: string; tz: string }) {
  const { openLog } = useUI();
  const projects = useProjects() ?? [];
  const [showEvents, setShowEvents] = useState(false);
  const [time, setTime] = useState("");
  const [busy, setBusy] = useState(false);
  const minutes = time.trim() ? parseDuration(time) : draft.minutes;
  const decided = draft.decision;
  const dot = draft.project ? CATEGORIES.find((c) => c.value === draft.project!.category)?.dot : "bg-zinc-500";
  const unlinkedRepo = !draft.project ? draft.repos[0] : null;

  const accept = async () => {
    if (minutes === null) return toast.error("Time: try 45m, 2h or 1h30");
    setBusy(true);
    try {
      await acceptDraft(draft, { minutes });
      toast.success(`Logged ${fmtMinutes(minutes)}${draft.project ? ` on ${draft.project.name}` : ""}`, {
        action: { label: "Undo", onClick: () => undoDraftDecision(draft.key) },
      });
    } catch (e) {
      toast.error(firstError(e));
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className={cn("rounded-xl border bg-surface/60 p-4 transition-colors", decided && "opacity-70")}>
      <div className="flex flex-wrap items-start gap-x-3 gap-y-2">
        <div className="min-w-0 flex-1">
          <div className="mb-1 flex flex-wrap items-center gap-x-2.5 gap-y-1 text-xs text-muted-foreground">
            {draft.project ? (
              <Link to={`/projects/${draft.project.id}`} className="inline-flex items-center gap-1.5 font-medium text-foreground/90 hover:underline">
                <span className={cn("size-1.5 rounded-full", dot)} /> {draft.project.name}
              </Link>
            ) : (
              <span className="inline-flex items-center gap-1.5 font-medium text-amber-600 dark:text-amber-300">
                <FolderGit2 className="size-3" /> {unlinkedRepo} · not linked to a project
              </span>
            )}
            <span>{relativeDay(draft.date, today)}</span>
            <span className="inline-flex items-center gap-1">
              <GitCommitHorizontal className="size-3" /> {draft.commits.length} commit{draft.commits.length === 1 ? "" : "s"}
              {draft.events.length > draft.commits.length && ` · ${draft.events.length - draft.commits.length} PR event${draft.events.length - draft.commits.length === 1 ? "" : "s"}`}
            </span>
          </div>
          <p className="text-sm leading-relaxed">{draft.workedOn}</p>
        </div>
        {!decided && (
          <div className="flex items-center gap-1.5" title="Estimated from the timing of your commits">
            <Clock className="size-3.5 text-muted-foreground" />
            <Input
              value={time}
              onChange={(e) => setTime(e.target.value)}
              placeholder={`≈ ${fmtMinutes(draft.minutes)}`}
              aria-label="Time spent"
              className={cn("h-7 w-24 text-xs", minutes === null && "border-destructive/70")}
            />
          </div>
        )}
      </div>

      {unlinkedRepo && !decided && (
        <div className="mt-3 flex flex-wrap items-center gap-2 rounded-lg border border-dashed px-3 py-2">
          <Link2 className="size-3.5 text-muted-foreground" />
          <span className="text-xs text-muted-foreground">Link this repo once — future activity goes to the right project automatically:</span>
          <ProjectSelect
            size="sm"
            className="w-52"
            projects={projects}
            value={null}
            noneLabel="Choose project…"
            onChange={async (id) => {
              if (!id) return;
              await linkRepo(unlinkedRepo, id);
              toast.success(`${unlinkedRepo} linked`);
            }}
          />
        </div>
      )}

      {draft.taskMatches.length > 0 && !decided && (
        <div className="mt-3 space-y-1.5">
          {draft.taskMatches.map((m) => (
            <div key={m.task.id} className="flex flex-wrap items-center gap-2 rounded-lg bg-emerald-500/[0.07] px-3 py-1.5 text-xs">
              <Sparkles className="size-3.5 text-emerald-500" />
              <span className="text-muted-foreground">Looks finished:</span>
              <span className="font-medium">{m.task.title}</span>
              <span className="hidden truncate text-muted-foreground/80 sm:inline">— from “{m.evidence}”</span>
              <Button
                size="xs"
                variant="outline"
                className="ml-auto h-6"
                onClick={async () => {
                  await setTaskStatus(m.task.id, "done");
                  toast.success(`Completed “${m.task.title}”`, { action: { label: "Undo", onClick: () => setTaskStatus(m.task.id, m.task.status) } });
                }}
              >
                <Check /> Mark done
              </Button>
            </div>
          ))}
        </div>
      )}

      <button onClick={() => setShowEvents(!showEvents)} className="mt-3 flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground">
        <ChevronDown className={cn("size-3.5 transition-transform", showEvents && "rotate-180")} />
        {showEvents ? "Hide" : "Show"} activity
      </button>
      {showEvents && (
        <ul className="mt-2 space-y-1 border-l pl-3">
          {draft.events.map((e) => {
            const Icon = EVENT_ICON[e.kind];
            return (
              <li key={e.id} className="flex items-start gap-2 text-xs">
                <Icon className="mt-0.5 size-3 shrink-0 text-muted-foreground" />
                <span className="w-10 shrink-0 tabular-nums text-muted-foreground">{fmtTime(e.occurredAt, tz)}</span>
                <a href={e.url} target="_blank" rel="noreferrer noopener" className="min-w-0 flex-1 truncate hover:underline">
                  {e.kind === "commit" ? e.title : `${e.kind === "pr_merged" ? "Merged" : "Opened"} PR #${e.number}: ${e.title}`}
                </a>
                {draft.repos.length > 1 && <span className="shrink-0 text-muted-foreground/70">{e.repo.split("/")[1]}</span>}
              </li>
            );
          })}
        </ul>
      )}

      <div className="mt-3 flex flex-wrap items-center gap-2 border-t pt-3">
        {decided ? (
          <>
            <span className={cn("inline-flex items-center gap-1.5 text-xs font-medium", decided.status === "accepted" ? "text-emerald-600 dark:text-emerald-400" : "text-muted-foreground")}>
              {decided.status === "accepted" ? <CheckCheck className="size-3.5" /> : <X className="size-3.5" />}
              {decided.status === "accepted" ? "Logged" : "Dismissed"} {timeAgo(decided.decidedAt)}
            </span>
            <Button size="xs" variant="ghost" className="ml-auto" onClick={() => undoDraftDecision(draft.key)}>
              <Undo2 /> {decided.status === "accepted" ? "Undo (delete log)" : "Restore"}
            </Button>
          </>
        ) : (
          <>
            <Button size="sm" variant="brand" onClick={accept} loading={busy}>
              <Check /> Accept · {minutes === null ? "?" : fmtMinutes(minutes)}
            </Button>
            <Button
              size="sm"
              variant="outline"
              onClick={() =>
                openLog(
                  null,
                  {
                    date: draft.date,
                    projectId: draft.project?.id ?? null,
                    workedOn: draft.workedOn,
                    completed: draft.completed,
                    pending: draft.pending,
                    minutes: minutes ?? draft.minutes,
                  },
                  { title: "Review detected work", onCreated: (log) => markDraftAccepted(draft.key, log.id) },
                )
              }
            >
              <Pencil /> Edit & save
            </Button>
            <Button size="sm" variant="ghost" className="ml-auto text-muted-foreground" onClick={() => dismissDraft(draft.key)}>
              <X /> Dismiss
            </Button>
          </>
        )}
      </div>
    </div>
  );
}

/**
 * Suggested work logs built from GitHub activity. Covers the last `days` days so
 * nothing is lost if you didn't open the hub that day.
 */
export function DetectedWork({ date, days = 7, compact }: { date?: string; days?: number; compact?: boolean }) {
  const settings = useSettings();
  const today = useToday();
  const range = useMemo(() => (date ? { from: date, to: date } : { from: addDays(today, -(days - 1)), to: today }), [date, today, days]);
  const drafts = useDrafts(range);
  const [showHandled, setShowHandled] = useState(false);
  const [bulkBusy, setBulkBusy] = useState(false);

  const configured = !!settings.githubUsername.trim();
  if (!configured) {
    if (compact) return null;
    return (
      <Card className="glow-card">
        <CardContent className="flex flex-col gap-3 pt-5 sm:flex-row sm:items-center">
          <span className="grid size-9 shrink-0 place-items-center rounded-lg border bg-surface">
            <FolderGit2 className="size-4 text-brand" />
          </span>
          <div className="flex-1">
            <p className="text-sm font-medium">Let the hub log your work for you</p>
            <p className="text-xs text-muted-foreground">Connect GitHub and your commits and PRs become ready-to-accept log entries, with time estimated from commit timing.</p>
          </div>
          <Button variant="brand" size="sm" asChild>
            <Link to="/settings#tracking">Set up automatic tracking</Link>
          </Button>
        </CardContent>
      </Card>
    );
  }
  if (!drafts) return null;

  const pending = drafts.filter((d) => !d.decision);
  const handled = drafts.filter((d) => d.decision);
  const visible = showHandled ? drafts : pending;
  if (compact && !pending.length) return null;

  const acceptAll = async () => {
    setBulkBusy(true);
    try {
      for (const d of pending) await acceptDraft(d);
      toast.success(`Logged ${pending.length} detected session${pending.length === 1 ? "" : "s"} (${fmtMinutes(pending.reduce((s, d) => s + d.minutes, 0))})`);
    } catch (e) {
      toast.error(firstError(e));
    } finally {
      setBulkBusy(false);
    }
  };

  const sync = settings.lastSync;
  return (
    <Card>
      <CardHeader>
        <div>
          <CardTitle>
            <Sparkles className="size-4 text-brand" /> Detected work
            {pending.length > 0 && <span className="rounded bg-brand/15 px-1.5 text-[11px] font-semibold tabular-nums text-brand">{pending.length} to review</span>}
          </CardTitle>
          <CardDescription>
            From your GitHub activity{date ? "" : ` · last ${days} days`}.{" "}
            {sync ? (
              sync.ok ? (
                <>Synced {timeAgo(sync.at)}.</>
              ) : (
                <span className="text-rose-600 dark:text-rose-400">Last sync failed: {sync.error}</span>
              )
            ) : (
              "Not synced yet."
            )}
          </CardDescription>
        </div>
        <div className="flex items-center gap-2">
          {!compact && <SyncButton size="xs" />}
          {pending.length > 1 && (
            <Button size="xs" variant="outline" onClick={acceptAll} loading={bulkBusy}>
              <CheckCheck /> Accept all
            </Button>
          )}
        </div>
      </CardHeader>
      <CardContent className="space-y-3">
        {visible.length === 0 ? (
          <p className="py-6 text-center text-xs text-muted-foreground">
            {drafts.length === 0
              ? `No GitHub activity found ${date ? "for this day" : "in this period"}. Commits you push appear here automatically.`
              : "All caught up — every detected session has been logged or dismissed."}
          </p>
        ) : (
          visible.map((d) => <DraftCard key={d.key} draft={d} today={today} tz={settings.timezone} />)
        )}
        {handled.length > 0 && !compact && (
          <button onClick={() => setShowHandled(!showHandled)} className="text-xs text-muted-foreground hover:text-foreground">
            {showHandled ? "Hide" : "Show"} {handled.length} handled
          </button>
        )}
      </CardContent>
    </Card>
  );
}
