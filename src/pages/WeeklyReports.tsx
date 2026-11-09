import { useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { toast } from "sonner";
import { Cell, Pie, PieChart, ResponsiveContainer, Tooltip } from "recharts";
import {
  AlertTriangle,
  BarChart3,
  CalendarRange,
  CheckCircle2,
  ChevronLeft,
  ChevronRight,
  CircleDashed,
  Clock,
  FileDown,
  Flag,
  FolderKanban,
  Sparkles,
  Target,
  Trophy,
  X,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Progress } from "@/components/ui/misc";
import { EmptyState, PageHeader, StatCard } from "@/components/common/layout";
import { PageLoader } from "@/components/common/PageLoader";
import { ProductivityChart } from "@/components/charts/ProductivityChart";
import { SummaryPanel } from "@/components/reports/SummaryPanel";
import { ReportHistory } from "@/components/reports/ReportHistory";
import { useDataset, useSettings, useToday } from "@/hooks/data";
import { addDays, fmtDayMonth, fmtMedium, fmtShort, startOfWeek } from "@/lib/dates";
import { projectProgress, rankFocus } from "@/lib/insights";
import { exportReportPdf } from "@/lib/pdf";
import { buildWeeklyData, generateWeeklyReport, refDate, type GeneratedReport } from "@/lib/summary";
import { fmtMinutes } from "@/lib/utils";

const PIE_COLORS = ["#8b5cf6", "#6366f1", "#22d3ee", "#34d399", "#f59e0b", "#f472b6", "#a3a3a3"];

export default function WeeklyReports() {
  const today = useToday();
  const settings = useSettings();
  const { ready, data } = useDataset();
  const [start, setStart] = useState(() => startOfWeek(today, settings.weekStartsOn));
  const [report, setReport] = useState<GeneratedReport | null>(null);

  const w = useMemo(() => (data ? buildWeeklyData(start, data, settings) : null), [data, start, settings]);
  const nextFocus = useMemo(() => (data && w ? rankFocus(data.tasks, data.projects, refDate(w.end, settings.timezone), 5) : []), [data, w]);

  if (!ready || !data || !w) return <PageLoader />;

  const thisWeek = startOfWeek(today, settings.weekStartsOn);
  const isCurrent = start === thisWeek;
  const pmap = new Map(data.projects.map((p) => [p.id, p]));
  const pie = w.byProject.map((p) => ({ name: p.name, value: p.minutes }));
  const prev = buildWeeklyData(addDays(start, -7), data, settings);
  const delta = prev.minutes ? Math.round(((w.minutes - prev.minutes) / prev.minutes) * 100) : null;

  const move = (n: number) => {
    setStart(addDays(start, n * 7));
    setReport(null);
  };

  const generate = () => setReport(generateWeeklyReport(start, data, settings));

  const exportPdf = async () => {
    const r = report ?? generateWeeklyReport(start, data, settings);
    try {
      await exportReportPdf({ filename: `Weekly-Report-${start}.pdf`, markdown: r.content, series: w.series });
      toast.success("PDF exported");
    } catch {
      toast.error("PDF export failed");
    }
  };

  return (
    <div className="page space-y-6">
      <PageHeader
        icon={BarChart3}
        title="Weekly Reports"
        description="Your week in numbers — time, output, progress and what's next."
        actions={
          <>
            <Button variant="outline" onClick={exportPdf}>
              <FileDown /> Export PDF
            </Button>
            <Button variant="brand" onClick={generate}>
              <Sparkles /> Generate weekly report
            </Button>
          </>
        }
      />

      <div className="flex flex-wrap items-center gap-2">
        <Button variant="outline" size="icon-sm" aria-label="Previous week" onClick={() => move(-1)}>
          <ChevronLeft />
        </Button>
        <div className="flex h-8 items-center gap-2 rounded-md border bg-surface px-3 text-sm">
          <CalendarRange className="size-3.5 text-muted-foreground" />
          <span className="font-medium">
            {fmtMedium(w.start)} – {fmtMedium(w.end)}
          </span>
          {isCurrent && <span className="rounded bg-brand/15 px-1.5 text-[10px] font-semibold uppercase text-brand">This week</span>}
        </div>
        <Button variant="outline" size="icon-sm" aria-label="Next week" onClick={() => move(1)} disabled={start >= thisWeek}>
          <ChevronRight />
        </Button>
        {!isCurrent && (
          <Button variant="ghost" size="sm" onClick={() => {
            setStart(thisWeek);
            setReport(null);
          }}>
            Back to this week
          </Button>
        )}
      </div>

      <section className="grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-6">
        <StatCard label="Hours logged" value={fmtMinutes(w.minutes)} icon={Clock} tone="violet" hint={delta === null ? "vs last week: —" : `${delta >= 0 ? "+" : ""}${delta}% vs last week`} />
        <StatCard label="Tasks completed" value={w.tasksCompleted.length} icon={CheckCircle2} tone="emerald" hint={`${prev.tasksCompleted.length} last week`} />
        <StatCard label="Projects worked on" value={w.projectsWorked.length} icon={FolderKanban} tone="sky" />
        <StatCard label="Active days" value={`${w.activeDays}/7`} icon={CalendarRange} />
        <StatCard label="Milestones" value={w.milestonesDone.length} icon={Flag} tone="violet" hint="reached" />
        <StatCard label="Pending" value={w.pending.length} icon={CircleDashed} tone={w.overdue.length ? "rose" : "amber"} hint={w.overdue.length ? `${w.overdue.length} overdue` : "open & in progress"} />
      </section>

      {report && (
        <Card>
          <CardHeader>
            <div>
              <CardTitle>{report.title}</CardTitle>
              <CardDescription>Copy it into a client update, or save it to your weekly history.</CardDescription>
            </div>
            <Button variant="ghost" size="icon-sm" aria-label="Close report" onClick={() => setReport(null)}>
              <X />
            </Button>
          </CardHeader>
          <CardContent>
            <SummaryPanel key={report.content} report={report} type="weekly" periodStart={w.start} periodEnd={w.end} series={w.series} />
          </CardContent>
        </Card>
      )}

      <div className="grid gap-4 lg:grid-cols-3">
        <Card className="lg:col-span-2">
          <CardHeader>
            <div>
              <CardTitle>Daily activity</CardTitle>
              <CardDescription>Hours logged and tasks completed per day</CardDescription>
            </div>
          </CardHeader>
          <CardContent>
            <ProductivityChart data={w.series} height={240} today={today} />
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle>Time by project</CardTitle>
          </CardHeader>
          <CardContent>
            {pie.length === 0 ? (
              <p className="py-16 text-center text-xs text-muted-foreground">No time logged this week.</p>
            ) : (
              <>
                <ResponsiveContainer width="100%" height={160}>
                  <PieChart>
                    <Pie data={pie} dataKey="value" nameKey="name" innerRadius={48} outerRadius={72} paddingAngle={pie.length > 1 ? 2 : 0} stroke="none" animationDuration={600}>
                      {pie.map((_, i) => (
                        <Cell key={i} fill={PIE_COLORS[i % PIE_COLORS.length]} />
                      ))}
                    </Pie>
                    <Tooltip
                      formatter={(v) => fmtMinutes(Number(v))}
                      contentStyle={{ background: "hsl(var(--popover))", border: "1px solid hsl(var(--border))", borderRadius: 8, fontSize: 12 }}
                      itemStyle={{ color: "hsl(var(--foreground))" }}
                    />
                  </PieChart>
                </ResponsiveContainer>
                <ul className="mt-2 space-y-1.5">
                  {w.byProject.map((p, i) => (
                    <li key={p.name} className="flex items-center gap-2 text-xs">
                      <span className="size-2 shrink-0 rounded-sm" style={{ background: PIE_COLORS[i % PIE_COLORS.length] }} />
                      <span className="flex-1 truncate">{p.name}</span>
                      <span className="tabular-nums text-muted-foreground">{fmtMinutes(p.minutes)}</span>
                      <span className="w-9 text-right tabular-nums text-muted-foreground">{w.minutes ? Math.round((p.minutes / w.minutes) * 100) : 0}%</span>
                    </li>
                  ))}
                </ul>
              </>
            )}
          </CardContent>
        </Card>
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>
              <FolderKanban className="size-4 text-sky-500 dark:text-sky-300" /> Project progress
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            {w.projectsWorked.length === 0 ? (
              <p className="py-6 text-center text-xs text-muted-foreground">No project activity this week.</p>
            ) : (
              w.projectsWorked.map((p) => {
                const prog = projectProgress(p, data.tasks);
                const mins = w.byProject.find((x) => x.projectId === p.id)?.minutes ?? 0;
                const done = w.tasksCompleted.filter((t) => t.projectId === p.id).length;
                return (
                  <Link key={p.id} to={`/projects/${p.id}`} className="block rounded-lg p-2 transition-colors hover:bg-accent/40">
                    <div className="mb-1.5 flex items-center justify-between gap-2 text-sm">
                      <span className="truncate font-medium">{p.name}</span>
                      <span className="shrink-0 text-xs tabular-nums text-muted-foreground">
                        {fmtMinutes(mins)} · {done} done · {prog}%
                      </span>
                    </div>
                    <Progress value={prog} />
                  </Link>
                );
              })
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>
              <Trophy className="size-4 text-amber-500 dark:text-amber-300" /> Achievements
            </CardTitle>
            <span className="text-xs text-muted-foreground">{w.tasksCompleted.length + w.milestonesDone.length + w.achievements.length}</span>
          </CardHeader>
          <CardContent>
            {w.tasksCompleted.length + w.milestonesDone.length + w.achievements.length === 0 ? (
              <p className="py-6 text-center text-xs text-muted-foreground">Completed tasks, milestones and logged wins appear here.</p>
            ) : (
              <ul className="max-h-72 space-y-1.5 overflow-y-auto pr-1">
                {w.milestonesDone.map((m) => (
                  <li key={m.id} className="flex items-start gap-2 text-sm">
                    <Flag className="mt-0.5 size-3.5 shrink-0 text-violet-500" /> <span>{m.title} <span className="text-xs text-muted-foreground">· {pmap.get(m.projectId)?.name}</span></span>
                  </li>
                ))}
                {w.tasksCompleted.map((t) => (
                  <li key={t.id} className="flex items-start gap-2 text-sm">
                    <CheckCircle2 className="mt-0.5 size-3.5 shrink-0 text-emerald-500" />
                    <span>
                      {t.title}
                      {t.projectId && <span className="text-xs text-muted-foreground"> · {pmap.get(t.projectId)?.name}</span>}
                    </span>
                  </li>
                ))}
                {w.achievements.map((a, i) => (
                  <li key={`a${i}`} className="flex items-start gap-2 text-sm text-foreground/85">
                    <Sparkles className="mt-0.5 size-3.5 shrink-0 text-brand" /> {a}
                  </li>
                ))}
              </ul>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>
              <CircleDashed className="size-4 text-amber-500 dark:text-amber-300" /> Pending tasks
            </CardTitle>
            <Button variant="ghost" size="xs" asChild>
              <Link to="/tasks?view=list">Open tasks</Link>
            </Button>
          </CardHeader>
          <CardContent>
            {w.pending.length === 0 ? (
              <p className="py-6 text-center text-xs text-muted-foreground">Nothing pending.</p>
            ) : (
              <ul className="max-h-72 space-y-1.5 overflow-y-auto pr-1">
                {w.pending.slice(0, 20).map((t) => (
                  <li key={t.id} className="flex items-center gap-2 text-sm">
                    <span className={`size-1.5 shrink-0 rounded-full ${t.dueDate && t.dueDate < today ? "bg-rose-400" : t.status === "todo" ? "bg-zinc-400" : "bg-violet-400"}`} />
                    <span className="flex-1 truncate">{t.title}</span>
                    {t.dueDate && <span className="shrink-0 text-xs text-muted-foreground">{fmtDayMonth(t.dueDate)}</span>}
                  </li>
                ))}
              </ul>
            )}
            {w.challenges.length > 0 && (
              <div className="mt-4 border-t pt-3">
                <p className="mb-1.5 flex items-center gap-1.5 text-[11px] font-medium uppercase tracking-wider text-rose-600 dark:text-rose-400">
                  <AlertTriangle className="size-3" /> Challenges this week
                </p>
                <ul className="space-y-1">
                  {w.challenges.slice(0, 6).map((c, i) => (
                    <li key={i} className="text-sm text-foreground/85">
                      {c}
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <div>
              <CardTitle>
                <Target className="size-4 text-brand" /> Next week's priorities
              </CardTitle>
              <CardDescription>{isCurrent ? "Ranked as of today" : `From ${fmtShort(addDays(w.end, 1))}`}: overdue first, then deadlines and priority.</CardDescription>
            </div>
          </CardHeader>
          <CardContent>
            {nextFocus.length === 0 && w.nextSteps.length === 0 ? (
              <EmptyState compact icon={Target} title="No priorities yet" description="Add tasks with due dates to plan next week." />
            ) : (
              <ol className="space-y-2">
                {nextFocus.map((f, i) => (
                  <li key={f.task.id} className="flex items-start gap-3 text-sm">
                    <span className="grid size-5 shrink-0 place-items-center rounded bg-accent text-[11px] font-semibold tabular-nums">{i + 1}</span>
                    <div className="min-w-0">
                      <p className="truncate">{f.task.title}</p>
                      <p className="truncate text-xs text-muted-foreground">
                        {f.project?.name ?? "No project"}
                        {f.reasons[0] ? ` · ${f.reasons[0]}` : ""}
                      </p>
                    </div>
                  </li>
                ))}
                {w.nextSteps.slice(0, 3).map((n, i) => (
                  <li key={`n${i}`} className="flex items-start gap-3 text-sm text-foreground/85">
                    <span className="grid size-5 shrink-0 place-items-center rounded bg-brand/10 text-brand">
                      <Sparkles className="size-3" />
                    </span>
                    {n}
                  </li>
                ))}
              </ol>
            )}
          </CardContent>
        </Card>
      </div>

      <ReportHistory type="weekly" />
    </div>
  );
}
