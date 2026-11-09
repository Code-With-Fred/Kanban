import { Command } from "cmdk";
import { useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { CheckSquare, FolderKanban, FolderPlus, ListPlus, Moon, NotebookPen, Search, Sunset } from "lucide-react";
import { Dialog, DialogContent, DialogTitle } from "@/components/ui/dialog";
import { useProjects, useSettings, useTasks } from "@/hooks/data";
import { useUI } from "@/providers/ui";
import { updateSettings } from "@/lib/repo";
import { NAV } from "./Sidebar";

export function CommandPalette() {
  const { commandOpen, setCommandOpen, openLog, openTask, openProject } = useUI();
  const navigate = useNavigate();
  const projects = useProjects() ?? [];
  const tasks = useTasks() ?? [];
  const settings = useSettings();

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        setCommandOpen(!commandOpen);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [commandOpen, setCommandOpen]);

  const run = (fn: () => void) => {
    setCommandOpen(false);
    // Let the palette close before opening another dialog.
    setTimeout(fn, 60);
  };

  const item = "flex cursor-pointer items-center gap-2.5 rounded-md px-2.5 py-2 text-sm text-foreground/90 aria-selected:bg-accent aria-selected:text-foreground [&_svg]:size-4 [&_svg]:text-muted-foreground";
  const group = "px-1 py-1.5 [&_[cmdk-group-heading]]:px-2.5 [&_[cmdk-group-heading]]:pb-1.5 [&_[cmdk-group-heading]]:text-[11px] [&_[cmdk-group-heading]]:font-medium [&_[cmdk-group-heading]]:uppercase [&_[cmdk-group-heading]]:tracking-wider [&_[cmdk-group-heading]]:text-muted-foreground";

  return (
    <Dialog open={commandOpen} onOpenChange={setCommandOpen}>
      <DialogContent hideClose className="max-w-xl p-0">
        <DialogTitle className="sr-only">Command palette</DialogTitle>
        <Command loop className="flex flex-col">
          <div className="flex items-center gap-2 border-b px-4">
            <Search className="size-4 text-muted-foreground" />
            <Command.Input autoFocus placeholder="Search projects, tasks, or run a command…" className="h-12 flex-1 bg-transparent text-sm outline-none placeholder:text-muted-foreground" />
            <span className="kbd">Esc</span>
          </div>
          <Command.List className="max-h-[60vh] overflow-y-auto p-1">
            <Command.Empty className="py-10 text-center text-sm text-muted-foreground">No results.</Command.Empty>
            <Command.Group heading="Quick actions" className={group}>
              <Command.Item className={item} onSelect={() => run(() => openLog())}>
                <NotebookPen /> Log work <span className="ml-auto text-xs text-muted-foreground">Ctrl+J</span>
              </Command.Item>
              <Command.Item className={item} onSelect={() => run(() => openTask())}>
                <ListPlus /> New task
              </Command.Item>
              <Command.Item className={item} onSelect={() => run(() => openProject(null, { navigateOnCreate: true }))}>
                <FolderPlus /> New project
              </Command.Item>
              <Command.Item className={item} onSelect={() => run(() => navigate("/reports/daily?checkin=1"))}>
                <Sunset /> End my day (daily check-in)
              </Command.Item>
              <Command.Item
                className={item}
                onSelect={() =>
                  run(() => {
                    const next = settings.theme === "light" ? "dark" : "light";
                    updateSettings({ theme: next });
                  })
                }
              >
                <Moon /> Toggle theme
              </Command.Item>
            </Command.Group>
            <Command.Group heading="Go to" className={group}>
              {NAV.map((n) => (
                <Command.Item key={n.to} className={item} value={`go ${n.label}`} onSelect={() => run(() => navigate(n.to))}>
                  <n.icon /> {n.label}
                </Command.Item>
              ))}
            </Command.Group>
            {projects.length > 0 && (
              <Command.Group heading="Projects" className={group}>
                {projects
                  .filter((p) => p.status !== "archived")
                  .map((p) => (
                    <Command.Item key={p.id} className={item} value={`project ${p.name} ${p.technologies.join(" ")}`} onSelect={() => run(() => navigate(`/projects/${p.id}`))}>
                      <FolderKanban /> {p.name}
                    </Command.Item>
                  ))}
              </Command.Group>
            )}
            {tasks.length > 0 && (
              <Command.Group heading="Open tasks" className={group}>
                {tasks
                  .filter((t) => t.status !== "done")
                  .slice(0, 200)
                  .map((t) => (
                    <Command.Item key={t.id} className={item} value={`task ${t.title}`} onSelect={() => run(() => openTask(t))}>
                      <CheckSquare /> <span className="truncate">{t.title}</span>
                    </Command.Item>
                  ))}
              </Command.Group>
            )}
          </Command.List>
        </Command>
      </DialogContent>
    </Dialog>
  );
}
