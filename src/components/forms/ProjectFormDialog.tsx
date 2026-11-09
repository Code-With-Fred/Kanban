import { useEffect, useState } from "react";
import { toast } from "sonner";
import { X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogBody, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Field, Input, Textarea } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/misc";
import { CATEGORIES, PRIORITIES, PROJECT_STATUSES } from "@/lib/constants";
import { createProject, updateProject } from "@/lib/repo";
import { fieldErrors, firstError, type ProjectInput } from "@/lib/schemas";
import type { Project } from "@/lib/types";
import { normalizeUrl } from "@/lib/utils";

type FormState = Omit<ProjectInput, "startDate" | "deadline" | "progress"> & {
  startDate: string;
  deadline: string;
  progress: number;
};

const empty = (today: string): FormState => ({
  name: "",
  description: "",
  category: "personal",
  status: "planning",
  priority: "medium",
  startDate: today,
  deadline: "",
  progress: 0,
  progressMode: "tasks",
  projectUrl: "",
  repoUrl: "",
  technologies: [],
  notes: "",
});

export function ProjectFormDialog({
  open,
  onOpenChange,
  project,
  today,
  onSaved,
}: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  project?: Project | null;
  today: string;
  onSaved?: (p: { id: string }) => void;
}) {
  const [f, setF] = useState<FormState>(empty(today));
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [tech, setTech] = useState("");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!open) return;
    setErrors({});
    setTech("");
    if (project) {
      setF({
        name: project.name,
        description: project.description,
        category: project.category,
        status: project.status,
        priority: project.priority,
        startDate: project.startDate ?? "",
        deadline: project.deadline ?? "",
        progress: project.progress,
        progressMode: project.progressMode,
        projectUrl: project.projectUrl,
        repoUrl: project.repoUrl,
        technologies: project.technologies,
        notes: project.notes,
      });
    } else setF(empty(today));
  }, [open, project, today]);

  const set = <K extends keyof FormState>(k: K, v: FormState[K]) => setF((s) => ({ ...s, [k]: v }));

  const addTech = (raw: string) => {
    const items = raw
      .split(",")
      .map((t) => t.trim())
      .filter(Boolean);
    if (!items.length) return;
    setF((s) => ({ ...s, technologies: [...new Set([...(s.technologies ?? []), ...items])] }));
    setTech("");
  };

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    try {
      const payload: ProjectInput = {
        ...f,
        technologies: [...(f.technologies ?? []), ...tech.split(",").map((t) => t.trim()).filter(Boolean)],
        projectUrl: normalizeUrl(f.projectUrl ?? ""),
        repoUrl: normalizeUrl(f.repoUrl ?? ""),
      };
      if (project) {
        await updateProject(project.id, payload);
        toast.success("Project updated");
        onSaved?.({ id: project.id });
      } else {
        const p = await createProject(payload);
        toast.success(`Created “${p.name}”`);
        onSaved?.({ id: p.id });
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
      <DialogContent className="max-w-2xl">
        <form onSubmit={submit} className="flex min-h-0 flex-1 flex-col" noValidate>
          <DialogHeader>
            <DialogTitle>{project ? "Edit project" : "New project"}</DialogTitle>
            <DialogDescription>Everything about the project in one place. Only the name is required.</DialogDescription>
          </DialogHeader>
          <DialogBody className="grid gap-4 sm:grid-cols-2">
            <Field label="Name" error={errors.name} className="sm:col-span-2" htmlFor="p-name">
              <Input id="p-name" autoFocus value={f.name} onChange={(e) => set("name", e.target.value)} placeholder="e.g. Invoicely — SaaS invoicing for freelancers" aria-invalid={!!errors.name} />
            </Field>
            <Field label="Description" className="sm:col-span-2" htmlFor="p-desc">
              <Textarea id="p-desc" rows={3} value={f.description} onChange={(e) => set("description", e.target.value)} placeholder="Goal, scope, who it's for…" />
            </Field>
            <Field label="Category">
              <Select value={f.category} onValueChange={(v) => set("category", v as FormState["category"])} options={CATEGORIES.map((c) => ({ value: c.value, label: c.label, icon: <span className={`size-1.5 rounded-full ${c.dot}`} /> }))} />
            </Field>
            <Field label="Status">
              <Select value={f.status} onValueChange={(v) => set("status", v as FormState["status"])} options={PROJECT_STATUSES.map((s) => ({ value: s.value, label: s.label }))} />
            </Field>
            <Field label="Priority">
              <Select value={f.priority} onValueChange={(v) => set("priority", v as FormState["priority"])} options={PRIORITIES.map((p) => ({ value: p.value, label: p.label }))} />
            </Field>
            <div className="grid grid-cols-2 gap-3">
              <Field label="Start date" htmlFor="p-start">
                <Input id="p-start" type="date" value={f.startDate} onChange={(e) => set("startDate", e.target.value)} />
              </Field>
              <Field label="Deadline" error={errors.deadline} htmlFor="p-deadline">
                <Input id="p-deadline" type="date" value={f.deadline} onChange={(e) => set("deadline", e.target.value)} aria-invalid={!!errors.deadline} />
              </Field>
            </div>
            <Field
              label="Progress tracking"
              className="sm:col-span-2"
              hint={f.progressMode === "tasks" ? "Progress = completed tasks ÷ total tasks. Updates only when you change tasks." : "You set progress yourself. Nothing changes it automatically."}
            >
              <div className="flex flex-wrap items-center gap-3">
                <Tabs value={f.progressMode} onValueChange={(v) => set("progressMode", v as FormState["progressMode"])}>
                  <TabsList>
                    <TabsTrigger value="tasks">From tasks</TabsTrigger>
                    <TabsTrigger value="manual">Manual</TabsTrigger>
                  </TabsList>
                </Tabs>
                {f.progressMode === "manual" && (
                  <div className="flex flex-1 items-center gap-3">
                    <input
                      type="range"
                      min={0}
                      max={100}
                      step={5}
                      value={f.progress}
                      onChange={(e) => set("progress", Number(e.target.value))}
                      className="h-1.5 flex-1 cursor-pointer accent-violet-500"
                      aria-label="Progress percentage"
                    />
                    <span className="w-10 text-right text-sm tabular-nums">{f.progress}%</span>
                  </div>
                )}
              </div>
            </Field>
            <Field label="Project URL" error={errors.projectUrl} htmlFor="p-url">
              <Input id="p-url" value={f.projectUrl} onChange={(e) => set("projectUrl", e.target.value)} placeholder="https://myapp.com" />
            </Field>
            <Field label="GitHub repository" error={errors.repoUrl} htmlFor="p-repo">
              <Input id="p-repo" value={f.repoUrl} onChange={(e) => set("repoUrl", e.target.value)} placeholder="https://github.com/codewithfred/repo" />
            </Field>
            <Field label="Technologies" className="sm:col-span-2" hint="Press Enter or comma to add." htmlFor="p-tech">
              <div className="flex min-h-9 flex-wrap items-center gap-1.5 rounded-md border border-input bg-surface px-2 py-1.5 focus-within:ring-2 focus-within:ring-ring/30">
                {(f.technologies ?? []).map((t) => (
                  <span key={t} className="inline-flex items-center gap-1 rounded bg-accent px-1.5 py-0.5 font-mono text-[11px]">
                    {t}
                    <button type="button" aria-label={`Remove ${t}`} onClick={() => set("technologies", (f.technologies ?? []).filter((x) => x !== t))} className="text-muted-foreground hover:text-foreground">
                      <X className="size-3" />
                    </button>
                  </span>
                ))}
                <input
                  id="p-tech"
                  value={tech}
                  onChange={(e) => (e.target.value.endsWith(",") ? addTech(e.target.value) : setTech(e.target.value))}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") {
                      e.preventDefault();
                      addTech(tech);
                    } else if (e.key === "Backspace" && !tech && f.technologies?.length) {
                      set("technologies", f.technologies.slice(0, -1));
                    }
                  }}
                  placeholder={f.technologies?.length ? "" : "React, TypeScript, Supabase…"}
                  className="min-w-[8rem] flex-1 bg-transparent text-sm outline-none placeholder:text-muted-foreground/70"
                />
              </div>
            </Field>
            <Field label="Notes" className="sm:col-span-2" htmlFor="p-notes">
              <Textarea id="p-notes" rows={3} value={f.notes} onChange={(e) => set("notes", e.target.value)} placeholder="Client contacts, credentials location, decisions…" />
            </Field>
          </DialogBody>
          <DialogFooter>
            <Button type="button" variant="ghost" size="sm" onClick={() => onOpenChange(false)}>
              Cancel
            </Button>
            <Button type="submit" variant="brand" size="sm" loading={saving}>
              {project ? "Save changes" : "Create project"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
