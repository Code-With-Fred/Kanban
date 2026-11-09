import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { toast } from "sonner";
import { Archive, ArchiveRestore, MoreHorizontal, Pencil, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { ConfirmDialog } from "@/components/ui/alert-dialog";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuLabel, DropdownMenuSeparator, DropdownMenuTrigger } from "@/components/ui/dropdown";
import { PROJECT_STATUSES } from "@/lib/constants";
import { archiveProject, deleteProject, restoreProject, setProjectStatus } from "@/lib/repo";
import type { Project } from "@/lib/types";
import { cn } from "@/lib/utils";
import { useUI } from "@/providers/ui";

export function ProjectMenu({ project, afterDelete, trigger }: { project: Project; afterDelete?: string; trigger?: React.ReactNode }) {
  const { openProject } = useUI();
  const [confirm, setConfirm] = useState(false);
  const navigate = useNavigate();
  return (
    <>
      <DropdownMenu>
        <DropdownMenuTrigger
          asChild
          onClick={(e) => {
            // Menus live inside card <Link>s: block both the router and the native anchor navigation.
            e.preventDefault();
            e.stopPropagation();
          }}
        >
          {trigger ?? (
            <Button variant="ghost" size="icon-xs" aria-label="Project actions">
              <MoreHorizontal />
            </Button>
          )}
        </DropdownMenuTrigger>
        <DropdownMenuContent onClick={(e) => e.stopPropagation()} className="w-48">
          <DropdownMenuItem onSelect={() => openProject(project)}>
            <Pencil /> Edit project
          </DropdownMenuItem>
          <DropdownMenuSeparator />
          <DropdownMenuLabel>Set status</DropdownMenuLabel>
          {PROJECT_STATUSES.filter((s) => s.value !== "archived" && s.value !== project.status).map((s) => (
            <DropdownMenuItem
              key={s.value}
              onSelect={async () => {
                await setProjectStatus(project.id, s.value);
                toast.success(`${project.name} → ${s.label}`);
              }}
            >
              <span className={cn("ml-0.5 mr-0.5 size-1.5 rounded-full", s.cls.split(" ").find((c) => c.startsWith("bg-"))?.replace("/10", ""))} />
              {s.label}
            </DropdownMenuItem>
          ))}
          <DropdownMenuSeparator />
          {project.status === "archived" ? (
            <DropdownMenuItem
              onSelect={async () => {
                await restoreProject(project.id);
                toast.success("Project restored");
              }}
            >
              <ArchiveRestore /> Restore
            </DropdownMenuItem>
          ) : (
            <DropdownMenuItem
              onSelect={async () => {
                await archiveProject(project.id);
                toast.success("Project archived", { action: { label: "Undo", onClick: () => restoreProject(project.id) } });
              }}
            >
              <Archive /> Archive
            </DropdownMenuItem>
          )}
          <DropdownMenuItem destructive onSelect={() => setConfirm(true)}>
            <Trash2 /> Delete
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
      <ConfirmDialog
        open={confirm}
        onOpenChange={setConfirm}
        title={`Delete “${project.name}”?`}
        description="The project and its milestones are removed permanently. Its tasks and work logs are kept and moved to “No project”. Consider archiving instead."
        onConfirm={async () => {
          await deleteProject(project.id);
          toast.success("Project deleted");
          if (afterDelete) navigate(afterDelete);
        }}
      />
    </>
  );
}
