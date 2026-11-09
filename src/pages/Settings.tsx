import { useEffect, useMemo, useRef, useState } from "react";
import { toast } from "sonner";
import { Bell, BellRing, Database, Download, HardDrive, Monitor, Moon, Palette, Save, Settings as SettingsIcon, Sparkles, Sun, Trash2, Upload, User } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Field, Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { Switch } from "@/components/ui/misc";
import { ConfirmDialog } from "@/components/ui/alert-dialog";
import { PageHeader } from "@/components/common/layout";
import { useSettings } from "@/hooks/data";
import { allTimezones, timeInTz, todayIn, fmtLong } from "@/lib/dates";
import { updateSettings } from "@/lib/repo";
import { firstError } from "@/lib/schemas";
import { browserNotificationsSupported, requestBrowserPermission, showBrowserNotification } from "@/lib/notifications";
import { exportBackup, importBackup, requestPersistentStorage, storageEstimate, wipeAllData } from "@/lib/backup";
import type { Settings } from "@/lib/types";
import { cn } from "@/lib/utils";
import { TrackingSettings } from "@/components/tracking/TrackingSettings";
import { useLocation } from "react-router-dom";

function Row({ title, desc, children }: { title: string; desc?: string; children: React.ReactNode }) {
  return (
    <div className="flex items-center justify-between gap-4 py-3">
      <div className="min-w-0">
        <p className="text-sm font-medium">{title}</p>
        {desc && <p className="text-xs text-muted-foreground">{desc}</p>}
      </div>
      <div className="shrink-0">{children}</div>
    </div>
  );
}

export default function SettingsPage() {
  const settings = useSettings();
  const [f, setF] = useState<Settings>(settings);
  const [dirty, setDirty] = useState(false);
  const [saving, setSaving] = useState(false);
  const [perm, setPerm] = useState<string>(browserNotificationsSupported() ? Notification.permission : "unsupported");
  const [storage, setStorage] = useState<Awaited<ReturnType<typeof storageEstimate>>>(null);
  const [wipe, setWipe] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);
  const tzs = useMemo(() => allTimezones().map((z) => ({ value: z, label: z.replace(/_/g, " ") })), []);

  useEffect(() => {
    if (!dirty) setF(settings);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [settings.updatedAt]);

  useEffect(() => {
    storageEstimate().then(setStorage);
  }, []);

  const { hash } = useLocation();
  useEffect(() => {
    if (hash) setTimeout(() => document.querySelector(hash)?.scrollIntoView({ behavior: "smooth", block: "start" }), 250);
  }, [hash]);

  const set = <K extends keyof Settings>(k: K, v: Settings[K]) => {
    setF((s) => ({ ...s, [k]: v }));
    setDirty(true);
  };

  /** Instant-apply for toggles that people expect to take effect immediately. */
  const apply = async <K extends keyof Settings>(k: K, v: Settings[K]) => {
    setF((s) => ({ ...s, [k]: v }));
    try {
      await updateSettings({ [k]: v } as Partial<Settings>);
    } catch (e) {
      toast.error(firstError(e));
    }
  };

  const save = async () => {
    setSaving(true);
    try {
      // Only the fields this form owns — tracking settings are saved by their own card.
      const keys = [
        "displayName", "role", "timezone", "weekStartsOn", "theme", "reminderEnabled", "reminderTime",
        "browserNotifications", "notifyDeadlines", "notifyOverdue", "notifyStale", "notifyToday",
        "deadlineWindowDays", "staleAfterDays", "summaryStyle", "summaryIncludeStats",
      ] as const;
      await updateSettings(Object.fromEntries(keys.map((k) => [k, f[k]])) as Partial<Settings>);
      setDirty(false);
      toast.success("Settings saved");
    } catch (e) {
      toast.error(firstError(e));
    } finally {
      setSaving(false);
    }
  };

  const enableBrowser = async (on: boolean) => {
    if (!on) return apply("browserNotifications", false);
    const p = await requestBrowserPermission();
    setPerm(p);
    if (p === "granted") {
      await apply("browserNotifications", true);
      showBrowserNotification({ title: "Notifications enabled", body: "You'll get reminders for deadlines, overdue tasks and your daily wrap-up.", link: "/", dedupeKey: "test" });
    } else if (p === "denied") toast.error("Notifications are blocked for this site. Allow them in your browser's site settings.");
    else if (p === "unsupported") toast.error("This browser doesn't support notifications.");
  };

  const fmtBytes = (b: number) => (b > 1e6 ? `${(b / 1e6).toFixed(1)} MB` : `${Math.max(1, Math.round(b / 1e3))} KB`);

  return (
    <div className="page max-w-4xl">
      <PageHeader
        icon={SettingsIcon}
        title="Settings"
        description="Tune the hub to how you work."
        actions={
          <Button variant="brand" onClick={save} loading={saving} disabled={!dirty}>
            <Save /> Save changes
          </Button>
        }
      />

      <div className="space-y-4">
        <Card>
          <CardHeader>
            <CardTitle>
              <User className="size-4 text-brand" /> Profile & time
            </CardTitle>
          </CardHeader>
          <CardContent className="grid gap-4 sm:grid-cols-2">
            <Field label="Display name">
              <Input value={f.displayName} onChange={(e) => set("displayName", e.target.value)} maxLength={60} />
            </Field>
            <Field label="Role">
              <Input value={f.role} onChange={(e) => set("role", e.target.value)} maxLength={60} placeholder="Software Developer" />
            </Field>
            <Field label="Timezone" hint={`Now: ${timeInTz(f.timezone)} · ${fmtLong(todayIn(f.timezone))}`}>
              <Select value={f.timezone} onValueChange={(v) => set("timezone", v)} options={tzs} />
            </Field>
            <Field label="Week starts on">
              <Select value={String(f.weekStartsOn)} onValueChange={(v) => set("weekStartsOn", Number(v) as 0 | 1)} options={[{ value: "1", label: "Monday" }, { value: "0", label: "Sunday" }]} />
            </Field>
          </CardContent>
        </Card>

        <TrackingSettings />

        <Card>
          <CardHeader>
            <CardTitle>
              <Palette className="size-4 text-brand" /> Appearance
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-3 gap-2">
              {(
                [
                  { v: "dark", label: "Dark", icon: Moon },
                  { v: "light", label: "Light", icon: Sun },
                  { v: "system", label: "System", icon: Monitor },
                ] as const
              ).map((t) => (
                <button
                  key={t.v}
                  onClick={() => apply("theme", t.v)}
                  className={cn(
                    "flex flex-col items-center gap-2 rounded-xl border p-4 text-sm transition-colors",
                    f.theme === t.v ? "border-brand/60 bg-brand/10" : "hover:bg-accent/50",
                  )}
                  aria-pressed={f.theme === t.v}
                >
                  <t.icon className="size-5" />
                  {t.label}
                </button>
              ))}
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <div>
              <CardTitle>
                <Bell className="size-4 text-brand" /> Reminders & notifications
              </CardTitle>
              <CardDescription>Checked when the app loads, every minute while it's open, and whenever your data changes.</CardDescription>
            </div>
          </CardHeader>
          <CardContent className="divide-y">
            <Row title="Daily wrap-up reminder" desc="Nudges you to log work and end your day.">
              <div className="flex items-center gap-3">
                <Input type="time" value={f.reminderTime} onChange={(e) => set("reminderTime", e.target.value)} className="h-8 w-28" disabled={!f.reminderEnabled} aria-label="Reminder time" />
                <Switch checked={f.reminderEnabled} onCheckedChange={(v) => apply("reminderEnabled", v)} aria-label="Daily reminder" />
              </div>
            </Row>
            <Row
              title="Browser notifications"
              desc={
                perm === "unsupported"
                  ? "Not supported in this browser."
                  : perm === "denied"
                    ? "Blocked — allow notifications for this site in your browser settings."
                    : "Pop-up alerts while the hub is open in a tab."
              }
            >
              <div className="flex items-center gap-2">
                {f.browserNotifications && perm === "granted" && (
                  <Button
                    size="xs"
                    variant="ghost"
                    onClick={() => showBrowserNotification({ title: "Test notification", body: "Browser notifications are working.", link: "/settings", dedupeKey: `test-${Date.now()}` })}
                  >
                    <BellRing /> Test
                  </Button>
                )}
                <Switch checked={f.browserNotifications && perm === "granted"} onCheckedChange={enableBrowser} disabled={perm === "unsupported"} aria-label="Browser notifications" />
              </div>
            </Row>
            <Row title="Upcoming deadlines" desc="Projects and milestones due soon.">
              <div className="flex items-center gap-3">
                <Select
                  size="sm"
                  className="w-28"
                  value={String(f.deadlineWindowDays)}
                  onValueChange={(v) => set("deadlineWindowDays", Number(v))}
                  options={[1, 2, 3, 5, 7, 14].map((n) => ({ value: String(n), label: `${n} day${n === 1 ? "" : "s"}` }))}
                  aria-label="Deadline warning window"
                />
                <Switch checked={f.notifyDeadlines} onCheckedChange={(v) => apply("notifyDeadlines", v)} aria-label="Deadline notifications" />
              </div>
            </Row>
            <Row title="Overdue tasks" desc="One alert per task when it passes its due date.">
              <Switch checked={f.notifyOverdue} onCheckedChange={(v) => apply("notifyOverdue", v)} aria-label="Overdue notifications" />
            </Row>
            <Row title="Tasks for today" desc="Morning summary of tasks due or planned for today.">
              <Switch checked={f.notifyToday} onCheckedChange={(v) => apply("notifyToday", v)} aria-label="Today notifications" />
            </Row>
            <Row title="Projects without recent updates" desc="Active projects with no logs or task changes.">
              <div className="flex items-center gap-3">
                <Select
                  size="sm"
                  className="w-28"
                  value={String(f.staleAfterDays)}
                  onValueChange={(v) => set("staleAfterDays", Number(v))}
                  options={[3, 5, 7, 10, 14, 21, 30].map((n) => ({ value: String(n), label: `${n} days` }))}
                  aria-label="Idle threshold"
                />
                <Switch checked={f.notifyStale} onCheckedChange={(v) => apply("notifyStale", v)} aria-label="Idle project notifications" />
              </div>
            </Row>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <div>
              <CardTitle>
                <Sparkles className="size-4 text-brand" /> Report generator
              </CardTitle>
              <CardDescription>
                Summaries are written by the built-in report engine from your logs, tasks and check-ins. It runs entirely in this browser — no API keys, no data sent anywhere.
              </CardDescription>
            </div>
          </CardHeader>
          <CardContent className="divide-y">
            <Row title="Summary style" desc="Detailed lists every entry; concise keeps it to the highlights.">
              <Select size="sm" className="w-32" value={f.summaryStyle} onValueChange={(v) => set("summaryStyle", v as Settings["summaryStyle"])} options={[{ value: "detailed", label: "Detailed" }, { value: "concise", label: "Concise" }]} />
            </Row>
            <Row title="Include key numbers" desc="Adds an 'At a glance' stats section to reports.">
              <Switch checked={f.summaryIncludeStats} onCheckedChange={(v) => apply("summaryIncludeStats", v)} aria-label="Include stats" />
            </Row>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <div>
              <CardTitle>
                <Database className="size-4 text-brand" /> Data
              </CardTitle>
              <CardDescription>
                Everything is stored privately in this browser (IndexedDB) and survives refreshes. Export a backup regularly — clearing site data or switching browsers starts fresh.
              </CardDescription>
            </div>
          </CardHeader>
          <CardContent className="space-y-4">
            {storage && (
              <div className="flex flex-wrap items-center gap-x-4 gap-y-1 rounded-lg border bg-surface px-3 py-2 text-xs text-muted-foreground">
                <span className="inline-flex items-center gap-1.5">
                  <HardDrive className="size-3.5" /> Using {fmtBytes(storage.usage)}
                </span>
                <span className={storage.persisted ? "text-emerald-600 dark:text-emerald-400" : ""}>
                  {storage.persisted ? "Persistent storage granted" : "Best-effort storage"}
                </span>
                {!storage.persisted && (
                  <Button
                    size="xs"
                    variant="ghost"
                    onClick={async () => {
                      const ok = await requestPersistentStorage();
                      toast[ok ? "success" : "message"](ok ? "Persistent storage granted" : "Browser declined — installing the site or bookmarking it usually helps.");
                      setStorage(await storageEstimate());
                    }}
                  >
                    Request persistence
                  </Button>
                )}
              </div>
            )}
            <div className="flex flex-wrap gap-2">
              <Button variant="outline" onClick={() => exportBackup(settings.timezone).then(() => toast.success("Backup downloaded"))}>
                <Download /> Export backup (JSON)
              </Button>
              <Button variant="outline" onClick={() => fileRef.current?.click()}>
                <Upload /> Import backup
              </Button>
              <input
                ref={fileRef}
                type="file"
                accept="application/json,.json"
                className="hidden"
                onChange={async (e) => {
                  const file = e.target.files?.[0];
                  e.target.value = "";
                  if (!file) return;
                  try {
                    const counts = await importBackup(file);
                    toast.success("Backup restored", { description: `${counts.projects ?? 0} projects · ${counts.tasks ?? 0} tasks · ${counts.workLogs ?? 0} logs` });
                  } catch (err) {
                    toast.error(firstError(err));
                  }
                }}
              />
              <Button variant="ghost" className="text-destructive hover:bg-destructive/10 hover:text-destructive" onClick={() => setWipe(true)}>
                <Trash2 /> Erase all data
              </Button>
            </div>
            <p className="text-[11px] text-muted-foreground">Importing replaces everything currently in the hub with the backup's contents.</p>
          </CardContent>
        </Card>
      </div>

      <ConfirmDialog
        open={wipe}
        onOpenChange={setWipe}
        title="Erase all data?"
        description="Every project, task, log, report and setting in this browser will be permanently deleted. Export a backup first if you might need it."
        confirmLabel="Erase everything"
        onConfirm={async () => {
          await wipeAllData();
          toast.success("All data erased");
          setTimeout(() => window.location.assign("/"), 400);
        }}
      />
    </div>
  );
}
