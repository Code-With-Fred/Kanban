import { createContext, useCallback, useContext, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { ProjectFormDialog } from "@/components/forms/ProjectFormDialog";
import { TaskFormDialog, type TaskDefaults } from "@/components/forms/TaskFormDialog";
import { WorkLogFormDialog, emptyDraft, type WorkLogDraft } from "@/components/forms/WorkLogFormDialog";
import { useProjects, useSettings, useToday } from "@/hooks/data";
import type { Project, Task, WorkLog } from "@/lib/types";

interface UIContextValue {
  openProject: (project?: Project | null, opts?: { navigateOnCreate?: boolean }) => void;
  openTask: (task?: Task | null, defaults?: TaskDefaults) => void;
  openLog: (log?: WorkLog | null, prefill?: Partial<WorkLogDraft>, opts?: { onCreated?: (log: WorkLog) => void | Promise<void>; title?: string }) => void;
  commandOpen: boolean;
  setCommandOpen: (o: boolean) => void;
}

const UIContext = createContext<UIContextValue | null>(null);

export function useUI() {
  const ctx = useContext(UIContext);
  if (!ctx) throw new Error("useUI must be used inside UIProvider");
  return ctx;
}

export function UIProvider({ children }: { children: React.ReactNode }) {
  const projects = useProjects() ?? [];
  const settings = useSettings();
  const today = useToday();
  const navigate = useNavigate();

  const [project, setProject] = useState<{ open: boolean; project: Project | null; nav: boolean }>({ open: false, project: null, nav: false });
  const [task, setTask] = useState<{ open: boolean; task: Task | null; defaults?: TaskDefaults }>({ open: false, task: null });
  const [log, setLog] = useState<{
    open: boolean;
    log: WorkLog | null;
    initial: WorkLogDraft;
    onCreated?: (log: WorkLog) => void | Promise<void>;
    title?: string;
  }>({
    open: false,
    log: null,
    initial: emptyDraft(today, null),
  });
  const [commandOpen, setCommandOpen] = useState(false);

  const openProject = useCallback((p?: Project | null, opts?: { navigateOnCreate?: boolean }) => {
    setProject({ open: true, project: p ?? null, nav: !!opts?.navigateOnCreate });
  }, []);
  const openTask = useCallback((t?: Task | null, defaults?: TaskDefaults) => setTask({ open: true, task: t ?? null, defaults }), []);
  const openLog = useCallback(
    (l?: WorkLog | null, prefill?: Partial<WorkLogDraft>, opts?: { onCreated?: (log: WorkLog) => void | Promise<void>; title?: string }) => {
      // Default to the last project I logged against — one less click every time.
      const lastProject = settings.lastProjectId && projects.some((p) => p.id === settings.lastProjectId && p.status !== "archived") ? settings.lastProjectId : null;
      setLog({ open: true, log: l ?? null, initial: { ...emptyDraft(today, lastProject), ...prefill }, onCreated: opts?.onCreated, title: opts?.title });
    },
    [settings.lastProjectId, projects, today],
  );

  const value = useMemo(() => ({ openProject, openTask, openLog, commandOpen, setCommandOpen }), [openProject, openTask, openLog, commandOpen]);

  return (
    <UIContext.Provider value={value}>
      {children}
      <ProjectFormDialog
        open={project.open}
        onOpenChange={(o) => setProject((s) => ({ ...s, open: o }))}
        project={project.project}
        today={today}
        onSaved={({ id }) => {
          if (!project.project && project.nav) navigate(`/projects/${id}`);
        }}
      />
      <TaskFormDialog open={task.open} onOpenChange={(o) => setTask((s) => ({ ...s, open: o }))} task={task.task} defaults={task.defaults} projects={projects} />
      <WorkLogFormDialog
        open={log.open}
        onOpenChange={(o) => setLog((s) => ({ ...s, open: o }))}
        log={log.log}
        initial={log.initial}
        projects={projects}
        onCreated={log.onCreated}
        title={log.title}
      />
    </UIContext.Provider>
  );
}
