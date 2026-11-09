import { useEffect, useRef, useState } from "react";
import { Outlet, useLocation, useNavigate } from "react-router-dom";
import * as DialogPrimitive from "@radix-ui/react-dialog";
import { Menu, Plus, Search, Sunset, Zap } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Tooltip } from "@/components/ui/misc";
import { useSettings } from "@/hooks/data";
import { useUI } from "@/providers/ui";
import { ensureSettings } from "@/lib/repo";
import { syncNotifications } from "@/lib/notifications";
import { requestPersistentStorage } from "@/lib/backup";
import { isMac } from "@/lib/utils";
import { Sidebar } from "./Sidebar";
import { NotificationCenter } from "./NotificationCenter";
import { CommandPalette } from "./CommandPalette";
import { db } from "@/lib/db";
import { syncDue, syncGitHub } from "@/lib/tracking/github";

/** Pulls GitHub activity on open and every 30 minutes while a tab is open. Silent on failure (shown in Settings). */
function useAutoTracking() {
  const settings = useSettings();
  const ref = useRef(settings);
  ref.current = settings;
  useEffect(() => {
    const tick = () => {
      if (syncDue(ref.current, 30) && navigator.onLine) syncGitHub().catch(() => undefined);
    };
    const first = setTimeout(tick, 1500);
    const interval = setInterval(tick, 5 * 60_000);
    const onFocus = () => tick();
    window.addEventListener("focus", onFocus);
    return () => {
      clearTimeout(first);
      clearInterval(interval);
      window.removeEventListener("focus", onFocus);
    };
  }, [settings.githubUsername, settings.autoTrackEnabled]);
}

/** Keeps <html class="dark"> in sync with the theme preference. */
function useThemeSync(theme: string) {
  useEffect(() => {
    const apply = () => {
      const dark = theme === "dark" || (theme === "system" && window.matchMedia("(prefers-color-scheme: dark)").matches);
      document.documentElement.classList.toggle("dark", dark);
      document.querySelector('meta[name="theme-color"]')?.setAttribute("content", dark ? "#09090b" : "#ffffff");
    };
    apply();
    try {
      localStorage.setItem("cwf-theme", theme);
    } catch {
      /* storage blocked */
    }
    if (theme !== "system") return;
    const mq = window.matchMedia("(prefers-color-scheme: dark)");
    mq.addEventListener("change", apply);
    return () => mq.removeEventListener("change", apply);
  }, [theme]);
}

/** Runs the reminder rules on load, every minute, and shortly after data changes. */
function useReminderEngine() {
  const settings = useSettings();
  const ref = useRef(settings);
  ref.current = settings;
  useEffect(() => {
    let timer: ReturnType<typeof setTimeout> | undefined;
    let stopped = false;
    const run = () => {
      ensureSettings()
        .then((s) => syncNotifications({ ...s }))
        .catch(() => undefined);
    };
    const debounced = () => {
      clearTimeout(timer);
      timer = setTimeout(() => !stopped && run(), 1500);
    };
    run();
    const interval = setInterval(run, 60_000);
    const tables = [db.tasks, db.projects, db.milestones, db.workLogs];
    tables.forEach((t) => {
      t.hook("creating", debounced);
      t.hook("updating", debounced);
    });
    return () => {
      stopped = true;
      clearInterval(interval);
      clearTimeout(timer);
      tables.forEach((t) => {
        t.hook("creating").unsubscribe(debounced);
        t.hook("updating").unsubscribe(debounced);
      });
    };
  }, [settings.timezone, settings.reminderTime, settings.reminderEnabled]);
}

export function AppShell() {
  const settings = useSettings();
  const { openLog, openTask, setCommandOpen } = useUI();
  const navigate = useNavigate();
  const location = useLocation();
  const [mobileOpen, setMobileOpen] = useState(false);

  useThemeSync(settings.theme);
  useReminderEngine();
  useAutoTracking();

  useEffect(() => {
    ensureSettings();
    requestPersistentStorage();
    const onNav = (e: Event) => navigate((e as CustomEvent<string>).detail);
    window.addEventListener("cwf:navigate", onNav);
    return () => window.removeEventListener("cwf:navigate", onNav);
  }, [navigate]);

  // Global shortcuts: Ctrl/Cmd+J = quick log. "n" = new task (when not typing).
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const typing = /INPUT|TEXTAREA|SELECT/.test((e.target as HTMLElement)?.tagName) || (e.target as HTMLElement)?.isContentEditable;
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "j") {
        e.preventDefault();
        openLog();
      } else if (!typing && !e.metaKey && !e.ctrlKey && !e.altKey && e.key === "n" && !document.querySelector('[role="dialog"]')) {
        e.preventDefault();
        openTask();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [openLog, openTask]);

  useEffect(() => {
    window.scrollTo({ top: 0 });
  }, [location.pathname]);

  const mod = isMac() ? "⌘" : "Ctrl";

  return (
    <div className="min-h-screen bg-background">
      {/* Ambient gradient */}
      <div aria-hidden className="pointer-events-none fixed inset-x-0 top-0 z-0 h-[420px] bg-[radial-gradient(60%_60%_at_50%_0%,hsl(var(--brand)/0.08),transparent_70%)]" />

      <aside className="fixed inset-y-0 left-0 z-30 hidden w-60 border-r bg-surface/80 backdrop-blur-xl lg:block">
        <Sidebar />
      </aside>

      <DialogPrimitive.Root open={mobileOpen} onOpenChange={setMobileOpen}>
        <DialogPrimitive.Portal>
          <DialogPrimitive.Overlay className="fixed inset-0 z-40 bg-black/60 data-[state=open]:animate-in data-[state=open]:fade-in-0 lg:hidden" />
          <DialogPrimitive.Content className="fixed inset-y-0 left-0 z-50 w-64 border-r bg-surface shadow-2xl data-[state=open]:animate-in data-[state=open]:slide-in-from-left lg:hidden">
            <DialogPrimitive.Title className="sr-only">Navigation</DialogPrimitive.Title>
            <Sidebar onNavigate={() => setMobileOpen(false)} />
          </DialogPrimitive.Content>
        </DialogPrimitive.Portal>
      </DialogPrimitive.Root>

      <div className="relative z-10 lg:pl-60">
        <header className="sticky top-0 z-20 flex h-14 items-center gap-2 border-b bg-background/75 px-3 backdrop-blur-xl md:px-6">
          <Button variant="ghost" size="icon-sm" className="lg:hidden" aria-label="Open navigation" onClick={() => setMobileOpen(true)}>
            <Menu />
          </Button>
          <button
            onClick={() => setCommandOpen(true)}
            className="flex h-8 w-full max-w-sm items-center gap-2 rounded-md border bg-surface px-2.5 text-left text-sm text-muted-foreground transition-colors hover:bg-accent/50"
          >
            <Search className="size-3.5" />
            <span className="flex-1 truncate">Search or jump to…</span>
            <span className="hidden items-center gap-0.5 sm:flex">
              <span className="kbd">{mod}</span>
              <span className="kbd">K</span>
            </span>
          </button>
          <div className="ml-auto flex items-center gap-1.5">
            <Tooltip content="New task (N)">
              <Button variant="ghost" size="icon-sm" aria-label="New task" onClick={() => openTask()}>
                <Plus />
              </Button>
            </Tooltip>
            <NotificationCenter />
            <Button variant="outline" size="sm" className="hidden md:inline-flex" onClick={() => navigate("/reports/daily?checkin=1")}>
              <Sunset /> End my day
            </Button>
            <Button variant="brand" size="sm" onClick={() => openLog()}>
              <Zap /> <span className="hidden sm:inline">Log work</span>
              <span className="ml-0.5 hidden items-center gap-0.5 opacity-70 xl:flex">
                <span className="text-[10px]">{mod}J</span>
              </span>
            </Button>
          </div>
        </header>
        <main>
          <Outlet />
        </main>
      </div>
      <CommandPalette />
    </div>
  );
}
