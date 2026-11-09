import { useEffect, useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { ConfirmDialog } from "@/components/ui/alert-dialog";
import { Dialog, DialogBody, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Field, Input, Textarea } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { ProjectSelect } from "@/components/common/project-select";
import { PRIORITIES, TASK_STATUSES } from "@/lib/constants";
import { createTask, deleteTask, updateTask } from "@/lib/repo";
import { fieldErrors, firstError } from "@/lib/schemas";
import type { Priority, Project, Task, TaskStatus } from "@/lib/types";
import { fmtMinutes, parseDuration } from "@/lib/utils";
import { Trash2 } from "lucide-react";

export interface TaskDefaults {
  projectId?: string | null;
  status?: TaskStatus;
  dueDate?: string | null;
  scheduledDate?: string | null;
  priority?: Priority;
}

interface FormState {
  title: string;
  description: string;
  projectId: string | null;
  priority: Priority;
  status: TaskStatus;
  dueDate: string;
  scheduledDate: string;
  estimate: string;
  actual: string;
}

const toForm = (t?: Task | null, d?: TaskDefaults): FormState => ({
  title: t?.title ?? "",
  description: t?.description ?? "",
  projectId: t?.projectId ?? d?.projectId ?? null,
  priority: t?.priority ?? d?.priority ?? "medium",
  status: t?.status ?? d?.status ?? "todo",
  dueDate: t?.dueDate ?? d?.dueDate ?? "",
  scheduledDate: t?.scheduledDate ?? d?.scheduledDate ?? "",
  estimate: t?.estimatedMinutes ? fmtMinutes(t.estimatedMinutes) : "",
  actual: t?.actualMinutes ? fmtMinutes(t.actualMinutes) : "",
});

export function TaskFormDialog({
  open,
  onOpenChange,
  task,
  defaults,
  projects,
}: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  task?: Task | null;
  defaults?: TaskDefaults;
  projects: Project[];
}) {
  const [f, setF] = useState<FormState>(toForm(task, defaults));
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState(false);
  const [confirm, setConfirm] = useState(false);

  useEffect(() => {
    if (open) {
      setF(toForm(task, defaults));
      setErrors({});
    }
  }, [open, task, defaults]);

  const set = <K extends keyof FormState>(k: K, v: FormState[K]) => setF((s) => ({ ...s, [k]: v }));

  const submit = async (e?: React.FormEvent) => {
    e?.preventDefault();
    const est = f.estimate.trim() ? parseDuration(f.estimate) : null;
    const act = f.actual.trim() ? parseDuration(f.actual) : null;
    if (f.estimate.trim() && est === null) return setErrors({ estimate: "Try 45m, 1h30 or 2h" });
    if (f.actual.trim() && act === null) return setErrors({ actual: "Try 45m, 1h30 or 2h" });
    setSaving(true);
    try {
      const payload = {
        title: f.title,
        description: f.description,
        projectId: f.projectId,
        priority: f.priority,
        status: f.status,
        dueDate: f.dueDate || null,
        scheduledDate: f.scheduledDate || null,
        estimatedMinutes: est,
        actualMinutes: act,
      };
      if (task) {
        await updateTask(task.id, payload);
        toast.success("Task updated");
      } else {
        await createTask(payload);
        toast.success("Task added");
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
    <>
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent className="max-w-xl">
          <form
            onSubmit={submit}
            onKeyDown={(e) => {
              if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) submit();
            }}
            className="flex min-h-0 flex-1 flex-col"
            noValidate
          >
            <DialogHeader>
              <DialogTitle>{task ? "Edit task" : "New task"}</DialogTitle>
            </DialogHeader>
            <DialogBody className="grid gap-4 sm:grid-cols-2">
              <Field label="Title" error={errors.title} className="sm:col-span-2" htmlFor="t-title">
                <Input id="t-title" autoFocus value={f.title} onChange={(e) => set("title", e.target.value)} placeholder="Implement Stripe webhook handler" aria-invalid={!!errors.title} />
              </Field>
              <Field label="Description" className="sm:col-span-2" htmlFor="t-desc">
                <Textarea id="t-desc" rows={3} value={f.description} onChange={(e) => set("description", e.target.value)} placeholder="Details, acceptance criteria, links…" />
              </Field>
              <Field label="Project" className="sm:col-span-2">
                <ProjectSelect projects={projects} value={f.projectId} onChange={(v) => set("projectId", v)} />
              </Field>
              <Field label="Priority">
                <Select value={f.priority} onValueChange={(v) => set("priority", v as Priority)} options={PRIORITIES.map((p) => ({ value: p.value, label: p.label }))} />
              </Field>
              <Field label="Status">
                <Select
                  value={f.status}
                  onValueChange={(v) => set("status", v as TaskStatus)}
                  options={TASK_STATUSES.map((s) => ({ value: s.value, label: s.label, icon: <span className={`size-1.5 rounded-full ${s.dot}`} /> }))}
                />
              </Field>
              <Field label="Due date" hint="Hard deadline" htmlFor="t-due">
                <Input id="t-due" type="date" value={f.dueDate} onChange={(e) => set("dueDate", e.target.value)} />
              </Field>
              <Field label="Scheduled for" hint="Day you plan to work on it" htmlFor="t-sched">
                <Input id="t-sched" type="date" value={f.scheduledDate} onChange={(e) => set("scheduledDate", e.target.value)} />
              </Field>
              <Field label="Estimated time" error={errors.estimate} hint="e.g. 45m, 1h30, 2h" htmlFor="t-est">
                <Input id="t-est" value={f.estimate} onChange={(e) => set("estimate", e.target.value)} placeholder="1h30" aria-invalid={!!errors.estimate} />
              </Field>
              <Field label="Actual time spent" error={errors.actual} htmlFor="t-act">
                <Input id="t-act" value={f.actual} onChange={(e) => set("actual", e.target.value)} placeholder="—" aria-invalid={!!errors.actual} />
              </Field>
            </DialogBody>
            <DialogFooter className="justify-between">
              <div>
                {task && (
                  <Button type="button" variant="ghost" size="sm" className="text-destructive hover:bg-destructive/10 hover:text-destructive" onClick={() => setConfirm(true)}>
                    <Trash2 /> Delete
                  </Button>
                )}
              </div>
              <div className="flex items-center gap-2">
                <span className="hidden text-[11px] text-muted-foreground sm:inline">
                  <span className="kbd">Ctrl</span> <span className="kbd">↵</span> to save
                </span>
                <Button type="button" variant="ghost" size="sm" onClick={() => onOpenChange(false)}>
                  Cancel
                </Button>
                <Button type="submit" variant="brand" size="sm" loading={saving}>
                  {task ? "Save" : "Add task"}
                </Button>
              </div>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
      {task && (
        <ConfirmDialog
          open={confirm}
          onOpenChange={setConfirm}
          title="Delete this task?"
          description={`“${task.title}” will be permanently removed.`}
          onConfirm={async () => {
            await deleteTask(task.id);
            toast.success("Task deleted");
            onOpenChange(false);
          }}
        />
      )}
    </>
  );
}
