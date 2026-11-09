import { Bar, CartesianGrid, ComposedChart, Line, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { fmtShort, fmtWeekday } from "@/lib/dates";
import type { DayStat } from "@/lib/insights";
import { fmtMinutes } from "@/lib/utils";

function ChartTooltip({ active, payload }: { active?: boolean; payload?: { payload: DayStat }[] }) {
  if (!active || !payload?.length) return null;
  const d = payload[0].payload;
  return (
    <div className="rounded-lg border bg-popover px-3 py-2 text-xs shadow-xl">
      <p className="mb-1 font-medium">{fmtShort(d.date)}</p>
      <p className="flex items-center gap-2 text-muted-foreground">
        <span className="size-2 rounded-sm bg-violet-500" /> {fmtMinutes(d.minutes)} logged
      </p>
      <p className="flex items-center gap-2 text-muted-foreground">
        <span className="size-2 rounded-full bg-emerald-400" /> {d.tasksCompleted} task{d.tasksCompleted === 1 ? "" : "s"} done
      </p>
    </div>
  );
}

/** Hours logged (bars) + tasks completed (line) per day. */
export function ProductivityChart({ data, height = 220, today }: { data: DayStat[]; height?: number; today?: string }) {
  const rows = data.map((d) => ({ ...d, hours: +(d.minutes / 60).toFixed(2) }));
  return (
    <ResponsiveContainer width="100%" height={height}>
      <ComposedChart data={rows} margin={{ top: 8, right: 4, left: -18, bottom: 0 }}>
        <defs>
          <linearGradient id="barGrad" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="#8b5cf6" stopOpacity={0.95} />
            <stop offset="100%" stopColor="#6366f1" stopOpacity={0.55} />
          </linearGradient>
        </defs>
        <CartesianGrid vertical={false} stroke="hsl(var(--border))" strokeDasharray="3 3" />
        <XAxis
          dataKey="date"
          tickFormatter={(d: string) => (d === today ? "Today" : fmtWeekday(d))}
          tick={{ fontSize: 11, fill: "hsl(var(--muted-foreground))" }}
          axisLine={false}
          tickLine={false}
          interval={0}
        />
        <YAxis yAxisId="h" tick={{ fontSize: 11, fill: "hsl(var(--muted-foreground))" }} axisLine={false} tickLine={false} unit="h" allowDecimals={false} />
        <YAxis yAxisId="t" orientation="right" hide allowDecimals={false} />
        <Tooltip content={<ChartTooltip />} cursor={{ fill: "hsl(var(--accent))", opacity: 0.5 }} />
        <Bar yAxisId="h" dataKey="hours" fill="url(#barGrad)" radius={[5, 5, 2, 2]} maxBarSize={36} />
        <Line yAxisId="t" type="monotone" dataKey="tasksCompleted" stroke="#34d399" strokeWidth={2} dot={{ r: 3, fill: "#34d399", strokeWidth: 0 }} activeDot={{ r: 4 }} />
      </ComposedChart>
    </ResponsiveContainer>
  );
}
