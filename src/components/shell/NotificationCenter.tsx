import { useNavigate } from "react-router-dom";
import { AlarmClock, Bell, BellRing, CalendarClock, CheckCheck, Flag, Hourglass, Sunrise, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/misc";
import { useNotifications } from "@/hooks/data";
import { clearReadNotifications, deleteNotification, markAllNotificationsRead, markNotificationRead } from "@/lib/repo";
import { timeAgo } from "@/lib/dates";
import type { NotificationKind } from "@/lib/types";
import { cn } from "@/lib/utils";
import { useState } from "react";

const KIND: Record<NotificationKind, { icon: typeof Bell; cls: string }> = {
  deadline: { icon: CalendarClock, cls: "text-sky-500 dark:text-sky-300 bg-sky-500/10" },
  milestone: { icon: Flag, cls: "text-violet-500 dark:text-violet-300 bg-violet-500/10" },
  overdue: { icon: AlarmClock, cls: "text-rose-500 dark:text-rose-300 bg-rose-500/10" },
  stale: { icon: Hourglass, cls: "text-amber-500 dark:text-amber-300 bg-amber-500/10" },
  today: { icon: Sunrise, cls: "text-emerald-500 dark:text-emerald-300 bg-emerald-500/10" },
  reminder: { icon: BellRing, cls: "text-brand bg-brand/10" },
};

export function NotificationCenter() {
  const items = useNotifications() ?? [];
  const unread = items.filter((n) => !n.readAt).length;
  const navigate = useNavigate();
  const [open, setOpen] = useState(false);

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button variant="ghost" size="icon-sm" aria-label={`Notifications${unread ? `, ${unread} unread` : ""}`} className="relative">
          <Bell />
          {unread > 0 && (
            <span className="absolute right-1 top-1 grid h-3.5 min-w-3.5 place-items-center rounded-full bg-rose-500 px-0.5 text-[9px] font-bold text-white">
              {unread > 9 ? "9+" : unread}
            </span>
          )}
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-[min(380px,calc(100vw-1.5rem))] p-0">
        <div className="flex items-center justify-between border-b px-4 py-3">
          <div>
            <p className="text-sm font-semibold">Notifications</p>
            <p className="text-[11px] text-muted-foreground">{unread ? `${unread} unread` : "You're all caught up"}</p>
          </div>
          <div className="flex gap-1">
            <Button variant="ghost" size="xs" disabled={!unread} onClick={() => markAllNotificationsRead()}>
              <CheckCheck /> Read all
            </Button>
            <Button variant="ghost" size="xs" disabled={!items.some((n) => n.readAt)} onClick={() => clearReadNotifications()}>
              Clear read
            </Button>
          </div>
        </div>
        <div className="max-h-[60vh] overflow-y-auto">
          {items.length === 0 ? (
            <div className="px-6 py-10 text-center">
              <Bell className="mx-auto mb-2 size-5 text-muted-foreground" />
              <p className="text-sm font-medium">No notifications</p>
              <p className="mt-1 text-xs text-muted-foreground">Deadlines, overdue tasks, idle projects and your daily reminder show up here.</p>
            </div>
          ) : (
            items.map((n) => {
              const k = KIND[n.kind] ?? KIND.reminder;
              return (
                <div
                  key={n.id}
                  className={cn("group relative flex cursor-pointer gap-3 border-b px-4 py-3 transition-colors last:border-0 hover:bg-accent/50", !n.readAt && "bg-brand/[0.04]")}
                  onClick={() => {
                    markNotificationRead(n.id);
                    setOpen(false);
                    navigate(n.link);
                  }}
                >
                  <span className={cn("mt-0.5 grid size-7 shrink-0 place-items-center rounded-md", k.cls)}>
                    <k.icon className="size-3.5" />
                  </span>
                  <div className="min-w-0 flex-1">
                    <p className={cn("text-[13px] leading-snug", !n.readAt ? "font-medium" : "text-muted-foreground")}>{n.title}</p>
                    {n.body && <p className="mt-0.5 line-clamp-2 text-xs text-muted-foreground">{n.body}</p>}
                    <p className="mt-1 text-[10px] text-muted-foreground/80">{timeAgo(n.createdAt)}</p>
                  </div>
                  {!n.readAt && <span className="mt-2 size-1.5 shrink-0 rounded-full bg-brand" />}
                  <button
                    aria-label="Dismiss"
                    onClick={(e) => {
                      e.stopPropagation();
                      deleteNotification(n.id);
                    }}
                    className="absolute right-2 top-2 hidden rounded p-0.5 text-muted-foreground hover:bg-accent hover:text-foreground group-hover:block"
                  >
                    <X className="size-3.5" />
                  </button>
                </div>
              );
            })
          )}
        </div>
      </PopoverContent>
    </Popover>
  );
}
