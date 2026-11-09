import { useState } from "react";
import { toast } from "sonner";
import { Check, Copy, Download, FileDown, Save } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Markdown } from "@/components/common/markdown";
import { saveReport } from "@/lib/repo";
import type { GeneratedReport } from "@/lib/summary";
import type { CheckIn, ISODate } from "@/lib/types";
import { copyText, downloadFile } from "@/lib/utils";
import { exportReportPdf } from "@/lib/pdf";
import type { DayStat } from "@/lib/insights";

/** Renders a generated report with Copy / Save / Download actions. */
export function SummaryPanel({
  report,
  type,
  periodStart,
  periodEnd,
  checkIn,
  series,
  savedLabel,
  onSaved,
}: {
  report: GeneratedReport;
  type: "daily" | "weekly";
  periodStart: ISODate;
  periodEnd: ISODate;
  checkIn?: CheckIn | null;
  series?: DayStat[];
  savedLabel?: string;
  onSaved?: () => void;
}) {
  const [copied, setCopied] = useState(false);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);

  const copy = async () => {
    const ok = await copyText(report.content);
    if (ok) {
      setCopied(true);
      setTimeout(() => setCopied(false), 1600);
      toast.success("Summary copied to clipboard");
    } else toast.error("Couldn't access the clipboard");
  };

  const save = async () => {
    setSaving(true);
    try {
      const { updated } = await saveReport({ type, periodStart, periodEnd, title: report.title, content: report.content, stats: report.stats, checkIn });
      setSaved(true);
      toast.success(updated ? "Report updated in history" : "Report saved to history");
      onSaved?.();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Couldn't save the report");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="animate-fade-up">
      <div className="mb-3 flex flex-wrap gap-2">
        <Button size="sm" variant="outline" onClick={copy}>
          {copied ? <Check className="text-emerald-500" /> : <Copy />} {copied ? "Copied" : "Copy summary"}
        </Button>
        <Button size="sm" variant="outline" onClick={save} loading={saving}>
          {saved ? <Check className="text-emerald-500" /> : <Save />} {saved ? (savedLabel ?? "Saved") : "Save to reports"}
        </Button>
        <Button size="sm" variant="ghost" onClick={() => downloadFile(`${report.title.replace(/[^\w-]+/g, "-")}.md`, report.content, "text/markdown")}>
          <Download /> .md
        </Button>
        <Button
          size="sm"
          variant="ghost"
          onClick={() =>
            exportReportPdf({ filename: `${report.title.replace(/[^\w-]+/g, "-")}.pdf`, markdown: report.content, series }).catch(() => toast.error("PDF export failed"))
          }
        >
          <FileDown /> PDF
        </Button>
      </div>
      <div className="rounded-xl border bg-surface/60 p-5">
        <Markdown source={report.content} />
      </div>
    </div>
  );
}
