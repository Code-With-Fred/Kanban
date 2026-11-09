import { useEffect, useMemo, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { toast } from "sonner";
import { BarChart3, CalendarDays, NotebookPen, Search, Sparkles, X, Zap } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { EmptyState, PageHeader } from "@/components/common/layout";
import { PageLoader } from "@/components/common/PageLoader";
import { ProjectSelect } from "@/components/common/project-select";
import { WorkLogItem } from "@/components/worklog/WorkLogItem";
import { WorkLogFields, emptyDraft, type WorkLogDraft } from "@/components/forms/WorkLogFormDialog";
import { SummaryPanel } from "@/components/reports/SummaryPanel";
import { useDataset, useSettings, useToday } from "@/hooks/data";
import { addDays, fmtLong, relativeDay, startOfWeek } from "@/lib/dates";
import { createWorkLog } from "@/lib/repo";
import { fieldErrors, firstError } from "@/lib/schemas";
import { buildWeeklyData, generateDailyReport, generateWeeklyReport, type GeneratedReport } from "@/lib/summary";
import { fmtMinutes } from "@/lib/utils";

const PAGE = 30;

export default function WorkLogPage() {
  const today = useToday();
  const settings = useSettings();
  const { ready, data } = useDataset();
  const [params, setParams] = useSearchParams();

  // Quick entry
  const [draft, setDraft] = useState<WorkLogDraft>(emptyDraft(today, null));
  const [expanded, setExpanded] = useState(false);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState(false);
  const [seeded, setSeeded] = useState(false);

  useEffect(() => {
    if (seeded || !data) return;
    const last = settings.lastProjectId && data.projects.some((p) => p.id === settings.lastProjectId && p.status !== "archived") ? settings.lastProjectId : null;
    setDraft(emptyDraft(today, last));
    setSeeded(true);
  }, [data, settings.lastProjectId, today, seeded]);

  // Filters
  const q = params.get("q") ?? "";
  const projectFilter = params.get("project");
  const from = params.get("from") ?? "";
  const to = params.get("to") ?? "";
  const [limit, setLimit] = useState(PAGE);
  const setParam = (k: string, v: string | null) => {
    const next = new URLSearchParams(params);
    if (v) next.set(k, v);
    else next.delete(k);
    setParams(next, { replace: true });
    setLimit(PAGE);
  };

  // Summary
  const [summaryDate, setSummaryDate] = useState(today);
  const [summary, setSummary] = useState<{ kind: "daily" | "weekly"; start: string; end: string; report: GeneratedReport } | null>(null);

  const pmap = useMemo(() => new Map((data?.projects ?? []).map((p) => [p.id, p])), [data]);

  const filtered = useMemo(() => {
    if (!data) return [];
    const term = q.trim().toLowerCase();
    return data.logs
      .filter((l) => !projectFilter || (projectFilter === "none" ? !l.projectId : l.projectId === projectFilter))
      .filter((l) => (!from || l.date >= from) && (!to || l.date <= to))
      .filter((l) => {
        if (!term) return true;
        const hay = [l.workedOn, l.completed, l.challenges, l.pending, l.nextSteps, l.projectId ? pmap.get(l.projectId)?.name : "General"].join(" ").toLowerCase();
        return hay.includes(term);
      })
      .sort((a, b) => b.date.localeCompare(a.date) || b.createdAt.localeCompare(a.createdAt));
  }, [data, q, projectFilter, from, to, pmap]);

  const groups = useMemo(() => {
    const out: { date: string; minutes: number; items: typeof filtered }[] = [];
    for (const l of filtered.slice(0, limit)) {
      let g = out[out.length - 1];
      if (!g || g.date !== l.date) {
        g = { date: l.date, minutes: 0, items: [] };
        out.push(g);
      }
      g.items.push(l);
    }
    // Day totals use all logs of that date, not just the visible slice.
    for (const g of out) g.minutes = filtered.filter((l) => l.date === g.date).reduce((s, l) => s + l.minutes, 0);
    return out;
  }, [filtered, limit]);

  if (!ready || !data) return <PageLoader />;

  const todayLogs = data.logs.filter((l) => l.date === today);
  const todayMinutes = todayLogs.reduce((s, l) => s + l.minutes, 0);
  const totalFiltered = filtered.reduce((s, l) => s + l.minutes, 0);
  const filtersActive = !!(q || projectFilter || from || to);

  const submit = async (e?: React.FormEvent) => {
    e?.preventDefault();
    setSaving(true);
    try {
      await createWorkLog(draft);
      toast.success(`Logged ${fmtMinutes(draft.minutes)}`, { description: draft.workedOn.slice(0, 80) });
      setDraft((d) => ({ ...emptyDraft(d.date, d.projectId), minutes: d.minutes }));
      setErrors({});
      setExpanded(false);
    } catch (err) {
      setErrors(fieldErrors(err));
      toast.error(firstError(err));
    } finally {
      setSaving(false);
    }
  };

  const genDaily = () => {
    const report = generateDailyReport(summaryDate, data, settings);
    setSummary({ kind: "daily", start: summaryDate, end: summaryDate, report });
  };
  const genWeekly = () => {
    const start = startOfWeek(summaryDate, settings.weekStartsOn);
    const report = generateWeeklyReport(start, data, settings);
    setSummary({ kind: "weekly", start, end: addDays(start, 6), report });
  };

  return (
    <div className="page space-y-6">
      <PageHeader icon={NotebookPen} title="Daily Work Log" description="Record progress in seconds. Your reports are written from these entries." />

      <div className="grid gap-4 lg:grid-cols-5">
        {/* Quick entry */}
        <Card className="lg:col-span-3">
          <CardHeader>
            <div>
              <CardTitle>
                <Zap className="size-4 text-brand" /> Quick entry
              </CardTitle>
              <CardDescription>Pick a project, write one line, tap a time chip. Ctrl + Enter to save.</CardDescription>
            </div>
          </CardHeader>
          <CardContent>
            <form
              onSubmit={submit}
              onKeyDown={(e) => {
                if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) submit();
              }}
              noValidate
            >
              <WorkLogFields draft={draft} setDraft={setDraft} projects={data.projects} errors={errors} expanded={expanded} setExpanded={setExpanded} />
              <div className="mt-4 flex items-center justify-end gap-2">
                <Button type="submit" variant="brand" loading={saving}>
                  Save log
                </Button>
              </div>
            </form>
          </CardContent>
        </Card>

        {/* Summary generator */}
        <Card className="lg:col-span-2">
          <CardHeader>
            <div>
              <CardTitle>
                <Sparkles className="size-4 text-brand" /> Daily summary
              </CardTitle>
              <CardDescription>Turns your logs, completed tasks and plans into a professional report.</CardDescription>
            </div>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid grid-cols-3 gap-2 text-center">
              <div className="rounded-lg border bg-surface p-2.5">
                <p className="text-lg font-semibold tabular-nums">{fmtMinutes(todayMinutes)}</p>
                <p className="text-[11px] text-muted-foreground">today</p>
              </div>
              <div className="rounded-lg border bg-surface p-2.5">
                <p className="text-lg font-semibold tabular-nums">{todayLogs.length}</p>
                <p className="text-[11px] text-muted-foreground">entries</p>
              </div>
              <div className="rounded-lg border bg-surface p-2.5">
                <p className="text-lg font-semibold tabular-nums">{new Set(todayLogs.map((l) => l.projectId ?? "none")).size}</p>
                <p className="text-[11px] text-muted-foreground">projects</p>
              </div>
            </div>
            <div>
              <label className="mb-1.5 block text-xs font-medium text-muted-foreground" htmlFor="sum-date">
                Date
              </label>
              <Input id="sum-date" type="date" value={summaryDate} max={today} onChange={(e) => setSummaryDate(e.target.value || today)} />
            </div>
            <div className="grid gap-2 sm:grid-cols-2">
              <Button variant="brand" onClick={genDaily}>
                <Sparkles /> Generate Daily Summary
              </Button>
              <Button variant="outline" onClick={genWeekly}>
                <BarChart3 /> Generate Weekly Report
              </Button>
            </div>
            <p className="text-[11px] leading-relaxed text-muted-foreground">
              Generated locally from your data — nothing leaves this browser. Style and stats are configurable in Settings.
            </p>
          </CardContent>
        </Card>
      </div>

      {summary && (
        <Card>
          <CardHeader>
            <div>
              <CardTitle>{summary.report.title}</CardTitle>
              <CardDescription>Review, then copy it or save it to your report history.</CardDescription>
            </div>
            <Button variant="ghost" size="icon-sm" aria-label="Close summary" onClick={() => setSummary(null)}>
              <X />
            </Button>
          </CardHeader>
          <CardContent>
            <SummaryPanel
              key={summary.report.content}
              report={summary.report}
              type={summary.kind}
              periodStart={summary.start}
              periodEnd={summary.end}
              series={summary.kind === "weekly" ? buildWeeklyData(summary.start, data, settings).series : undefined}
            />
          </CardContent>
        </Card>
      )}

      {/* History */}
      <section>
        <div className="mb-3 flex flex-col gap-2 lg:flex-row lg:items-center">
          <h2 className="mr-auto text-sm font-semibold">
            History <span className="font-normal text-muted-foreground">· {filtered.length} entries · {fmtMinutes(totalFiltered)}</span>
          </h2>
          <div className="relative lg:w-64">
            <Search className="absolute left-3 top-1/2 size-3.5 -translate-y-1/2 text-muted-foreground" />
            <Input value={q} onChange={(e) => setParam("q", e.target.value || null)} placeholder="Search logs…" className="h-8 pl-8 text-xs" aria-label="Search logs" />
          </div>
          <div className="grid grid-cols-2 gap-2 sm:flex">
            <ProjectSelect
              size="sm"
              className="col-span-2 sm:w-48"
              projects={data.projects}
              value={projectFilter}
              onChange={(v) => setParam("project", v)}
              noneLabel="All projects"
            />
            <Input type="date" value={from} onChange={(e) => setParam("from", e.target.value || null)} className="h-8 text-xs sm:w-36" aria-label="From date" />
            <Input type="date" value={to} onChange={(e) => setParam("to", e.target.value || null)} className="h-8 text-xs sm:w-36" aria-label="To date" />
            {filtersActive && (
              <Button variant="ghost" size="sm" onClick={() => setParams(new URLSearchParams(), { replace: true })}>
                <X /> Clear
              </Button>
            )}
          </div>
        </div>

        {filtered.length === 0 ? (
          data.logs.length === 0 ? (
            <EmptyState icon={NotebookPen} title="No work logged yet" description="Your first entry takes about 20 seconds. Use the quick entry above or press Ctrl + J anywhere." />
          ) : (
            <EmptyState icon={Search} title="No entries match your filters" />
          )
        ) : (
          <div className="space-y-6">
            {groups.map((g) => (
              <div key={g.date}>
                <div className="sticky top-14 z-10 -mx-1 mb-2 flex items-center gap-2 bg-background/85 px-1 py-1.5 backdrop-blur">
                  <CalendarDays className="size-3.5 text-muted-foreground" />
                  <p className="text-xs font-semibold">{relativeDay(g.date, today)}</p>
                  <p className="text-xs text-muted-foreground">{fmtLong(g.date)}</p>
                  <span className="ml-auto rounded bg-accent px-1.5 py-0.5 text-[11px] font-medium tabular-nums">{fmtMinutes(g.minutes)}</span>
                </div>
                <div className="space-y-2">
                  {g.items.map((l) => (
                    <WorkLogItem key={l.id} log={l} project={l.projectId ? pmap.get(l.projectId) : null} today={today} tz={settings.timezone} />
                  ))}
                </div>
              </div>
            ))}
            {filtered.length > limit && (
              <div className="text-center">
                <Button variant="outline" size="sm" onClick={() => setLimit((l) => l + PAGE)}>
                  Load more ({filtered.length - limit} remaining)
                </Button>
              </div>
            )}
          </div>
        )}
      </section>
    </div>
  );
}
