import { NavLink } from "react-router-dom";
import {
  BarChart3,
  CalendarDays,
  CheckSquare,
  Code2,
  FileText,
  FolderKanban,
  LayoutDashboard,
  NotebookPen,
  Settings as SettingsIcon,
} from "lucide-react";
import { useLiveQuery } from "dexie-react-hooks";
import { db } from "@/lib/db";
import { useSettings, useToday } from "@/hooks/data";
import { cn } from "@/lib/utils";

export const NAV = [
  { to: "/", label: "Overview", icon: LayoutDashboard, end: true },
  { to: "/projects", label: "My Projects", icon: FolderKanban },
  { to: "/tasks", label: "Tasks", icon: CheckSquare },
  { to: "/work-log", label: "Daily Work Log", icon: NotebookPen },
  { to: "/reports/daily", label: "Daily Reports", icon: FileText },
  { to: "/reports/weekly", label: "Weekly Reports", icon: BarChart3 },
  { to: "/calendar", label: "Calendar", icon: CalendarDays },
  { to: "/settings", label: "Settings", icon: SettingsIcon },
] as const;

export function Sidebar({ onNavigate }: { onNavigate?: () => void }) {
  const settings = useSettings();
  const today = useToday();
  const overdue = useLiveQuery(
    () => db.tasks.filter((t) => t.status !== "done" && !!t.dueDate && t.dueDate < today).count(),
    [today],
  );
  const loggedToday = useLiveQuery(() => db.workLogs.where("date").equals(today).count(), [today]);
  const initials = settings.displayName
    .split(/\s+|(?=[A-Z])/)
    .filter(Boolean)
    .slice(0, 2)
    .map((s) => s[0]?.toUpperCase())
    .join("");

  return (
    <div className="flex h-full flex-col">
      <div className="flex h-14 items-center gap-2.5 px-4">
        <div className="relative grid size-8 place-items-center rounded-lg bg-gradient-to-br from-violet-500 to-indigo-600 shadow-[0_0_24px_-4px_rgba(139,92,246,0.7)]">
          <Code2 className="size-4 text-white" strokeWidth={2.5} />
        </div>
        <div className="min-w-0 leading-tight">
          <p className="truncate text-sm font-semibold tracking-tight">Project Hub</p>
          <p className="truncate text-[11px] text-muted-foreground">by CodewithFred</p>
        </div>
      </div>

      <nav className="mt-2 flex-1 space-y-0.5 overflow-y-auto px-2" aria-label="Main">
        {NAV.map((item) => (
          <NavLink
            key={item.to}
            to={item.to}
            end={"end" in item ? item.end : false}
            onClick={onNavigate}
            className={({ isActive }) =>
              cn(
                "group relative flex h-8 items-center gap-2.5 rounded-md px-2.5 text-[13px] font-medium transition-colors",
                isActive ? "bg-accent text-foreground" : "text-muted-foreground hover:bg-accent/60 hover:text-foreground",
              )
            }
          >
            {({ isActive }) => (
              <>
                {isActive && <span className="absolute -left-2 top-1.5 h-5 w-0.5 rounded-r bg-brand" />}
                <item.icon className={cn("size-4 shrink-0", isActive ? "text-brand" : "")} />
                <span className="flex-1 truncate">{item.label}</span>
                {item.to === "/tasks" && !!overdue && (
                  <span className="rounded bg-rose-500/15 px-1.5 text-[10px] font-semibold tabular-nums text-rose-500 dark:text-rose-300" title="Overdue tasks">
                    {overdue}
                  </span>
                )}
                {item.to === "/work-log" && loggedToday === 0 && <span className="size-1.5 rounded-full bg-amber-400" title="Nothing logged today" />}
              </>
            )}
          </NavLink>
        ))}
      </nav>

      <div className="m-2 rounded-lg border bg-surface p-2.5">
        <div className="flex items-center gap-2.5">
          <div className="grid size-8 shrink-0 place-items-center rounded-full bg-gradient-to-br from-zinc-700 to-zinc-900 text-[11px] font-semibold text-white ring-1 ring-white/10">
            {initials || "CF"}
          </div>
          <div className="min-w-0 leading-tight">
            <p className="truncate text-[13px] font-semibold">{settings.displayName}</p>
            <p className="truncate text-[11px] text-muted-foreground">{settings.role || "Software Developer"}</p>
          </div>
        </div>
      </div>
    </div>
  );
}
