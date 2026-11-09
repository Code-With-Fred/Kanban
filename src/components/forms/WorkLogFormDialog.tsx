import { useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import { ChevronDown, Clock, Zap } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogBody, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Field, Input, Textarea } from "@/components/ui/input";
import { ProjectSelect } from "@/components/common/project-select";
import { TIME_PRESETS } from "@/lib/constants";
import { createWorkLog, updateWorkLog } from "@/lib/repo";
import { fieldErrors, firstError } from "@/lib/schemas";
import type { Project, WorkLog } from "@/lib/types";
import { cn, fmtMinutes, parseDuration } from "@/lib/utils";

export interface WorkLogDraft {
  date: string;
  projectId: string | null;
  workedOn: string;
  completed: string;
  challenges: string;
  minutes: number;
  pending: string;
  nextSteps: string;
}

export function emptyDraft(today: string, projectId: string | null): WorkLogDraft {
  return { date: today, projectId, workedOn: "", completed: "", challenges: "", minutes: 60, pending: "", nextSteps: "" };
}

/** The fields + time chips, shared by the dialog and the inline quick-entry card. */
export function WorkLogFields({
  draft,
  setDraft,
  projects,
  errors,
  expanded,
  setExpanded,
  autoFocus,
  showDate = true,
}: {
  draft: WorkLogDraft;
  setDraft: (fn: (d: WorkLogDraft) => WorkLogDraft) => void;
  projects: Project[];
  errors: Record<string, string>;
  expanded: boolean;
  setExpanded: (v: boolean) => void;
  autoFocus?: boolean;
  showDate?: boolean;
}) {
  const [custom, setCustom] = useState("");
  const set = <K extends keyof WorkLogDraft>(k: K, v: WorkLogDraft[K]) => setDraft((d) => ({ ...d, [k]: v }));
  const isPreset = TIME_PRESETS.includes(draft.minutes);

  return (
    <div className="grid gap-4">
      <div className={cn("grid gap-3", showDate ? "sm:grid-cols-[1fr_160px]" : "")}>
        <Field label="Project">
          <ProjectSelect projects={projects} value={draft.projectId} onChange={(v) => set("projectId", v)} noneLabel="General / no project" />
        </Field>
        {showDate && (
          <Field label="Date" error={errors.date}>
            <Input type="date" value={draft.date} onChange={(e) => set("date", e.target.value)} />
          </Field>
        )}
      </div>
      <Field label="What did you work on?" error={errors.workedOn}>
        <Textarea
          autoFocus={autoFocus}
          rows={2}
          value={draft.workedOn}
          onChange={(e) => set("workedOn", e.target.value)}
          placeholder="Built the onboarding flow and wired up email verification"
          aria-invalid={!!errors.workedOn}
        />
      </Field>
      <Field label={<span className="inline-flex items-center gap-1"><Clock className="size-3" /> Time spent · {fmtMinutes(draft.minutes)}</span>} error={errors.minutes}>
        <div className="flex flex-wrap gap-1.5">
          {TIME_PRESETS.map((m) => (
            <button
              type="button"
              key={m}
              onClick={() => {
                set("minutes", m);
                setCustom("");
              }}
              className={cn(
                "h-7 rounded-md border px-2.5 text-xs font-medium tabular-nums transition-colors",
                draft.minutes === m ? "border-brand/50 bg-brand/15 text-foreground" : "text-muted-foreground hover:bg-accent hover:text-foreground",
              )}
            >
              {fmtMinutes(m)}
            </button>
          ))}
          <Input
            value={custom || (!isPreset ? fmtMinutes(draft.minutes) : "")}
            onChange={(e) => {
              setCustom(e.target.value);
              const p = parseDuration(e.target.value);
              if (p !== null) set("minutes", p);
            }}
            placeholder="Custom"
            aria-label="Custom duration"
            className={cn("h-7 w-24 text-xs", !isPreset && "border-brand/50")}
          />
        </div>
      </Field>
      <button
        type="button"
        onClick={() => setExpanded(!expanded)}
        className="flex w-fit items-center gap-1 text-xs font-medium text-muted-foreground hover:text-foreground"
      >
        <ChevronDown className={cn("size-3.5 transition-transform", expanded && "rotate-180")} />
        {expanded ? "Hide details" : "Add completed, challenges, pending & next steps"}
      </button>
      {expanded && (
        <div className="grid animate-fade-up gap-3 sm:grid-cols-2">
          <Field label="What did you complete?">
            <Textarea rows={2} value={draft.completed} onChange={(e) => set("completed", e.target.value)} placeholder="One per line" />
          </Field>
          <Field label="Challenges">
            <Textarea rows={2} value={draft.challenges} onChange={(e) => set("challenges", e.target.value)} placeholder="Blockers, bugs, decisions" />
          </Field>
          <Field label="Pending work">
            <Textarea rows={2} value={draft.pending} onChange={(e) => set("pending", e.target.value)} placeholder="What's left unfinished" />
          </Field>
          <Field label="Plan for next">
            <Textarea rows={2} value={draft.nextSteps} onChange={(e) => set("nextSteps", e.target.value)} placeholder="What you'll do next" />
          </Field>
        </div>
      )}
    </div>
  );
}

export function WorkLogFormDialog({
  open,
  onOpenChange,
  log,
  initial,
  projects,
  onCreated,
  title,
}: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  log?: WorkLog | null;
  initial: WorkLogDraft;
  projects: Project[];
  /** Called with the new log after a successful create. */
  onCreated?: (log: WorkLog) => void | Promise<void>;
  title?: string;
}) {
  const [draft, setDraftState] = useState<WorkLogDraft>(initial);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [expanded, setExpanded] = useState(false);
  const [saving, setSaving] = useState(false);
  const formRef = useRef<HTMLFormElement>(null);

  useEffect(() => {
    if (!open) return;
    setErrors({});
    if (log) {
      setDraftState({ ...log });
      setExpanded(!!(log.completed || log.challenges || log.pending || log.nextSteps));
    } else {
      setDraftState(initial);
      setExpanded(!!(initial.completed || initial.pending || initial.challenges || initial.nextSteps));
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, log]);

  const submit = async (e?: React.FormEvent) => {
    e?.preventDefault();
    setSaving(true);
    try {
      if (log) {
        await updateWorkLog(log.id, draft);
        toast.success("Log updated");
      } else {
        const created = await createWorkLog(draft, onCreated ? "github" : "manual");
        await onCreated?.(created);
        toast.success(`Logged ${fmtMinutes(draft.minutes)}`, { description: draft.workedOn.slice(0, 80) });
      }
      onOpenChange(false);
    } catch (err) {
      setErrors(fieldErrors(err));
      toast.error(firstError(err));
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-xl">
        <form
          ref={formRef}
          onSubmit={submit}
          onKeyDown={(e) => {
            if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) submit();
          }}
          className="flex min-h-0 flex-1 flex-col"
          noValidate
        >
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Zap className="size-4 text-brand" /> {title ?? (log ? "Edit work log" : "Quick log")}
            </DialogTitle>
            <DialogDescription>{log ? "Update this entry." : "Project, one line, a time chip — done. Ctrl + Enter saves."}</DialogDescription>
          </DialogHeader>
          <DialogBody>
            <WorkLogFields draft={draft} setDraft={setDraftState} projects={projects} errors={errors} expanded={expanded} setExpanded={setExpanded} autoFocus />
          </DialogBody>
          <DialogFooter>
            <Button type="button" variant="ghost" size="sm" onClick={() => onOpenChange(false)}>
              Cancel
            </Button>
            <Button type="submit" variant="brand" size="sm" loading={saving}>
              {log ? "Save changes" : "Save log"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
