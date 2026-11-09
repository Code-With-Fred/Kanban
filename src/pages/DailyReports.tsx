import { useEffect, useMemo, useRef, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { toast } from "sonner";
import { ArrowUp, Bot, CheckCircle2, FileText, RotateCcw, SkipForward, Sparkles, Sunset, Undo2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input, Textarea } from "@/components/ui/input";
import { Checkbox } from "@/components/ui/misc";
import { PageHeader } from "@/components/common/layout";
import { PageLoader } from "@/components/common/PageLoader";
import { ProjectSelect } from "@/components/common/project-select";
import { SummaryPanel } from "@/components/reports/SummaryPanel";
import { ReportHistory } from "@/components/reports/ReportHistory";
import { DetectedWork } from "@/components/tracking/DetectedWork";
import { useDataset, useSettings, useToday } from "@/hooks/data";
import { addDays, fmtLong } from "@/lib/dates";
import { completedOn, rankFocus } from "@/lib/insights";
import { createWorkLog, loadDataset, saveReport, setTaskStatus } from "@/lib/repo";
import { firstError } from "@/lib/schemas";
import { generateDailyReport, type GeneratedReport } from "@/lib/summary";
import type { CheckIn } from "@/lib/types";
import { cn, fmtMinutes, parseDuration, toBullets } from "@/lib/utils";

type Key = keyof CheckIn;
const QUESTIONS: { key: Key; ask: string; placeholder: string }[] = [
  { key: "workedOn", ask: "What did you work on today?", placeholder: "Shipped the billing page, reviewed PRs…" },
  { key: "completed", ask: "What did you complete?", placeholder: "One per line" },
  { key: "pending", ask: "What's still pending?", placeholder: "Anything unfinished or waiting on someone" },
  { key: "challenges", ask: "Any challenges or blockers?", placeholder: "Bugs, unclear requirements, slow builds…" },
  { key: "tomorrow", ask: "What should you work on tomorrow?", placeholder: "Your top priorities for tomorrow" },
];
const EMPTY: CheckIn = { workedOn: "", completed: "", pending: "", challenges: "", tomorrow: "" };
const storageKey = (d: string) => `cwf-checkin-${d}`;

function loadDraft(date: string): { answers: CheckIn; step: number } {
  try {
    const raw = localStorage.getItem(storageKey(date));
    if (raw) return JSON.parse(raw);
  } catch {
    /* storage unavailable */
  }
  return { answers: EMPTY, step: 0 };
}

export default function DailyReports() {
  const today = useToday();
  const settings = useSettings();
  const { ready, data } = useDataset();
  const [params, setParams] = useSearchParams();
  const [date, setDate] = useState(today);
  const [{ answers, step }, setState] = useState(() => loadDraft(today));
  const [input, setInput] = useState("");
  const [result, setResult] = useState<{ report: GeneratedReport; checkIn: CheckIn | null } | null>(null);
  const [saveAsLog, setSaveAsLog] = useState<boolean | null>(null);
  const [logProject, setLogProject] = useState<string | null>(null);
  const [logTime, setLogTime] = useState("");
  const [busy, setBusy] = useState(false);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const chatEnd = useRef<HTMLDivElement>(null);

  // Persist the in-progress check-in so a refresh doesn't lose answers.
  useEffect(() => {
    try {
      localStorage.setItem(storageKey(date), JSON.stringify({ answers, step }));
    } catch {
      /* ignore */
    }
  }, [answers, step, date]);

  useEffect(() => {
    if (params.get("checkin")) {
      setTimeout(() => inputRef.current?.focus(), 150);
      const next = new URLSearchParams(params);
      next.delete("checkin");
      setParams(next, { replace: true });
    }
  }, [params, setParams]);

  useEffect(() => {
    chatEnd.current?.scrollIntoView({ block: "nearest", behavior: "smooth" });
  }, [step]);

  const ctx = useMemo(() => {
    if (!data) return null;
    const logs = data.logs.filter((l) => l.date === date);
    const pmap = new Map(data.projects.map((p) => [p.id, p]));
    const doneTasks = data.tasks.filter((t) => t.status === "done" && completedOn(t, settings.timezone) === date);
    const active = data.tasks.filter((t) => t.status === "in_progress" || t.status === "review");
    const focus = rankFocus(data.tasks, data.projects, addDays(date, 1), 3);
    const suggestions: Record<Key, string | null> = {
      workedOn: logs.length ? logs.map((l) => `${l.projectId ? pmap.get(l.projectId)?.name + ": " : ""}${l.workedOn}`).join("\n") : null,
      completed: [...doneTasks.map((t) => t.title), ...logs.flatMap((l) => toBullets(l.completed))].join("\n") || null,
      pending: [...active.map((t) => t.title), ...logs.flatMap((l) => toBullets(l.pending))].join("\n") || null,
      challenges: logs.flatMap((l) => toBullets(l.challenges)).join("\n") || null,
      tomorrow: [...logs.flatMap((l) => toBullets(l.nextSteps)), ...focus.map((f) => f.task.title)].join("\n") || null,
    };
    return { logs, doneTasks, active, suggestions, minutes: logs.reduce((s, l) => s + l.minutes, 0) };
  }, [data, date, settings.timezone]);

  if (!ready || !data || !ctx) return <PageLoader />;

  const finished = step >= QUESTIONS.length;
  const current = QUESTIONS[Math.min(step, QUESTIONS.length - 1)];
  const wantsLog = saveAsLog ?? ctx.logs.length === 0;

  const answer = (value: string) => {
    setState((s) => ({ answers: { ...s.answers, [current.key]: value.trim() }, step: s.step + 1 }));
    setInput("");
    setTimeout(() => inputRef.current?.focus(), 50);
  };

  const back = () => {
    if (step === 0) return;
    const prev = QUESTIONS[step - 1];
    setInput(answers[prev.key]);
    setState((s) => ({ ...s, step: s.step - 1 }));
  };

  const reset = () => {
    setState({ answers: EMPTY, step: 0 });
    setInput("");
    setResult(null);
  };

  const changeDate = (d: string) => {
    setDate(d);
    setState(loadDraft(d));
    setResult(null);
    setInput("");
  };

  const endDay = async (withCheckIn: boolean) => {
    setBusy(true);
    try {
      const checkIn = withCheckIn && Object.values(answers).some(Boolean) ? { ...answers } : null;
      let loggedFromCheckIn = false;
      if (checkIn && wantsLog && checkIn.workedOn) {
        const minutes = logTime.trim() ? parseDuration(logTime) : 0;
        if (logTime.trim() && minutes === null) throw new Error("Time spent: try 45m, 2h or 1h30");
        await createWorkLog({
          date,
          projectId: logProject,
          workedOn: checkIn.workedOn,
          completed: checkIn.completed,
          challenges: checkIn.challenges,
          pending: checkIn.pending,
          nextSteps: checkIn.tomorrow,
          minutes: minutes ?? 0,
        });
        loggedFromCheckIn = true;
      }
      // Read fresh data so the log just created is included; if the check-in was saved as a log,
      // its text is already in the dataset and shouldn't be counted twice.
      const fresh = await loadDataset();
      const report = generateDailyReport(date, fresh, settings, loggedFromCheckIn ? null : checkIn);
      await saveReport({ type: "daily", periodStart: date, periodEnd: date, title: report.title, content: report.content, stats: report.stats, checkIn });
      setResult({ report, checkIn });
      setState({ answers: EMPTY, step: 0 });
      setInput("");
      setSaveAsLog(null);
      setLogTime("");
      toast.success("Day wrapped up", { description: "Report generated and saved to history." });
    } catch (e) {
      toast.error(firstError(e));
    } finally {
      setBusy(false);
    }
  };

  const suggestion = ctx.suggestions[current.key];

  return (
    <div className="page space-y-6">
      <PageHeader
        icon={FileText}
        title="Daily Reports"
        description="Check in, end your day, and keep a professional record of every working day."
        actions={
          <Input type="date" value={date} max={today} onChange={(e) => changeDate(e.target.value || today)} className="w-40" aria-label="Report date" />
        }
      />

      <DetectedWork date={date} compact />

      <div className="grid gap-4 lg:grid-cols-5">
        {/* Conversational check-in */}
        <Card className="flex flex-col lg:col-span-3">
          <CardHeader>
            <div>
              <CardTitle>
                <Sunset className="size-4 text-amber-500 dark:text-amber-300" /> Daily check-in
              </CardTitle>
              <CardDescription>
                {fmtLong(date)} · {Math.min(step, QUESTIONS.length)}/{QUESTIONS.length} answered
              </CardDescription>
            </div>
            {step > 0 && (
              <Button variant="ghost" size="xs" onClick={reset}>
                <RotateCcw /> Start over
              </Button>
            )}
          </CardHeader>
          <CardContent className="flex flex-1 flex-col">
            <div className="mb-3 h-1 overflow-hidden rounded-full bg-muted">
              <div className="h-full bg-gradient-to-r from-amber-400 to-violet-500 transition-all duration-500" style={{ width: `${(Math.min(step, 5) / 5) * 100}%` }} />
            </div>
            <div className="max-h-[440px] flex-1 space-y-3 overflow-y-auto pr-1">
              {QUESTIONS.slice(0, Math.min(step + 1, QUESTIONS.length)).map((qn, i) => (
                <div key={qn.key} className="space-y-2">
                  <div className="flex animate-fade-up items-start gap-2.5">
                    <span className="grid size-7 shrink-0 place-items-center rounded-full bg-gradient-to-br from-violet-500 to-indigo-600">
                      <Bot className="size-3.5 text-white" />
                    </span>
                    <div className="rounded-2xl rounded-tl-sm border bg-surface px-3.5 py-2 text-sm">
                      {i === 0 ? `Hey ${settings.displayName.split(" ")[0]}! ` : ""}
                      {qn.ask}
                    </div>
                  </div>
                  {i < step && (
                    <div className="flex animate-fade-up justify-end">
                      <div className={cn("max-w-[85%] whitespace-pre-line rounded-2xl rounded-tr-sm px-3.5 py-2 text-sm", answers[qn.key] ? "bg-brand/15 text-foreground" : "bg-muted italic text-muted-foreground")}>
                        {answers[qn.key] || "Skipped"}
                      </div>
                    </div>
                  )}
                </div>
              ))}
              <div ref={chatEnd} />
            </div>

            {!finished ? (
              <form
                className="mt-4"
                onSubmit={(e) => {
                  e.preventDefault();
                  answer(input);
                }}
              >
                {suggestion && !input && (
                  <button
                    type="button"
                    onClick={() => setInput(suggestion)}
                    className="mb-2 inline-flex max-w-full items-center gap-1.5 truncate rounded-full border border-brand/30 bg-brand/10 px-2.5 py-1 text-xs text-foreground/90 hover:bg-brand/15"
                  >
                    <Sparkles className="size-3 shrink-0 text-brand" />
                    <span className="truncate">Use from today's data: {suggestion.split("\n")[0]}{suggestion.includes("\n") ? " …" : ""}</span>
                  </button>
                )}
                <div className="flex items-end gap-2 rounded-xl border bg-surface p-1.5 focus-within:ring-2 focus-within:ring-ring/30">
                  <Textarea
                    ref={inputRef}
                    value={input}
                    onChange={(e) => setInput(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter" && !e.shiftKey) {
                        e.preventDefault();
                        answer(input);
                      }
                    }}
                    rows={2}
                    placeholder={current.placeholder}
                    className="min-h-[44px] flex-1 resize-none border-0 bg-transparent shadow-none focus-visible:ring-0"
                    aria-label={current.ask}
                  />
                  <div className="flex gap-1 pb-0.5">
                    {step > 0 && (
                      <Button type="button" variant="ghost" size="icon-sm" aria-label="Previous question" onClick={back}>
                        <Undo2 />
                      </Button>
                    )}
                    <Button type="button" variant="ghost" size="icon-sm" aria-label="Skip question" onClick={() => answer("")}>
                      <SkipForward />
                    </Button>
                    <Button type="submit" variant="brand" size="icon-sm" aria-label="Send answer">
                      <ArrowUp />
                    </Button>
                  </div>
                </div>
                <p className="mt-1.5 text-[11px] text-muted-foreground">Enter to send · Shift + Enter for a new line</p>
              </form>
            ) : (
              <div className="mt-4 animate-fade-up space-y-4 rounded-xl border bg-surface p-4">
                <div className="flex items-start gap-3">
                  <Checkbox id="save-log" checked={wantsLog} onCheckedChange={(v) => setSaveAsLog(!!v)} className="mt-0.5" />
                  <label htmlFor="save-log" className="text-sm">
                    Also save this check-in as a work log entry
                    <span className="block text-xs text-muted-foreground">
                      {ctx.logs.length ? `You already have ${ctx.logs.length} log entr${ctx.logs.length === 1 ? "y" : "ies"} for this day (${fmtMinutes(ctx.minutes)}).` : "No work logged for this day yet — recommended."}
                    </span>
                  </label>
                </div>
                {wantsLog && (
                  <div className="grid gap-2 pl-7 sm:grid-cols-[1fr_140px]">
                    <ProjectSelect projects={data.projects} value={logProject} onChange={setLogProject} noneLabel="General / no project" size="sm" />
                    <Input value={logTime} onChange={(e) => setLogTime(e.target.value)} placeholder="Time, e.g. 3h" className="h-8 text-xs" aria-label="Time spent" />
                  </div>
                )}
                {ctx.active.length > 0 && (
                  <div>
                    <p className="mb-1.5 text-xs font-medium text-muted-foreground">Did you finish any of these? Tick to mark done (optional)</p>
                    <div className="space-y-1">
                      {ctx.active.slice(0, 6).map((t) => (
                        <label key={t.id} className="flex cursor-pointer items-center gap-2.5 rounded-md px-1 py-1 text-sm hover:bg-accent/40">
                          <Checkbox
                            checked={false}
                            onCheckedChange={async () => {
                              await setTaskStatus(t.id, "done");
                              toast.success(`Completed “${t.title}”`);
                            }}
                          />
                          {t.title}
                        </label>
                      ))}
                    </div>
                  </div>
                )}
                <div className="flex flex-wrap gap-2">
                  <Button variant="brand" onClick={() => endDay(true)} loading={busy}>
                    <Sunset /> End My Day
                  </Button>
                  <Button variant="ghost" onClick={back}>
                    <Undo2 /> Edit last answer
                  </Button>
                </div>
              </div>
            )}
          </CardContent>
        </Card>

        {/* Day snapshot */}
        <Card className="lg:col-span-2">
          <CardHeader>
            <div>
              <CardTitle>Day snapshot</CardTitle>
              <CardDescription>What the report will be built from.</CardDescription>
            </div>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid grid-cols-3 gap-2 text-center">
              <div className="rounded-lg border bg-surface p-2.5">
                <p className="text-lg font-semibold tabular-nums">{fmtMinutes(ctx.minutes)}</p>
                <p className="text-[11px] text-muted-foreground">logged</p>
              </div>
              <div className="rounded-lg border bg-surface p-2.5">
                <p className="text-lg font-semibold tabular-nums">{ctx.logs.length}</p>
                <p className="text-[11px] text-muted-foreground">entries</p>
              </div>
              <div className="rounded-lg border bg-surface p-2.5">
                <p className="text-lg font-semibold tabular-nums">{ctx.doneTasks.length}</p>
                <p className="text-[11px] text-muted-foreground">tasks done</p>
              </div>
            </div>
            {ctx.doneTasks.length > 0 && (
              <div>
                <p className="mb-1.5 text-[11px] font-medium uppercase tracking-wider text-muted-foreground">Completed</p>
                <ul className="space-y-1">
                  {ctx.doneTasks.slice(0, 6).map((t) => (
                    <li key={t.id} className="flex items-center gap-2 text-sm">
                      <CheckCircle2 className="size-3.5 shrink-0 text-emerald-500" /> <span className="truncate">{t.title}</span>
                    </li>
                  ))}
                </ul>
              </div>
            )}
            <div className="rounded-lg border border-dashed p-3">
              <p className="text-xs text-muted-foreground">
                In a hurry? Skip the questions and build the report from your logs and tasks alone.
              </p>
              <Button variant="outline" size="sm" className="mt-2.5" onClick={() => endDay(false)} loading={busy} disabled={!ctx.logs.length && !ctx.doneTasks.length}>
                <Sparkles /> End My Day without check-in
              </Button>
            </div>
          </CardContent>
        </Card>
      </div>

      {result && (
        <Card>
          <CardHeader>
            <div>
              <CardTitle>
                <CheckCircle2 className="size-4 text-emerald-500" /> {result.report.title}
              </CardTitle>
              <CardDescription>Saved to your report history. Copy it for a client update or stand-up.</CardDescription>
            </div>
          </CardHeader>
          <CardContent>
            <SummaryPanel key={result.report.content} report={result.report} type="daily" periodStart={date} periodEnd={date} checkIn={result.checkIn} savedLabel="Saved" />
          </CardContent>
        </Card>
      )}

      <ReportHistory type="daily" />
    </div>
  );
}
