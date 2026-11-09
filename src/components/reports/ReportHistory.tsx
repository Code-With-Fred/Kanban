import { useMemo, useState } from "react";
import { toast } from "sonner";
import { Clock, Copy, Download, FileDown, FileText, Search, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { ConfirmDialog } from "@/components/ui/alert-dialog";
import { Dialog, DialogBody, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { EmptyState } from "@/components/common/layout";
import { Markdown } from "@/components/common/markdown";
import { useReports } from "@/hooks/data";
import { fmtLong, fmtMedium, timeAgo } from "@/lib/dates";
import { deleteReport } from "@/lib/repo";
import { exportReportPdf } from "@/lib/pdf";
import type { Report } from "@/lib/types";
import { copyText, downloadFile, fmtMinutes, pluralize } from "@/lib/utils";

export function ReportHistory({ type }: { type: Report["type"] }) {
  const reports = useReports();
  const [q, setQ] = useState("");
  const [open, setOpen] = useState<Report | null>(null);
  const [del, setDel] = useState<Report | null>(null);

  const list = useMemo(() => {
    const term = q.trim().toLowerCase();
    return (reports ?? []).filter((r) => r.type === type).filter((r) => !term || `${r.title} ${r.content}`.toLowerCase().includes(term));
  }, [reports, q, type]);

  if (!reports) return null;

  return (
    <section>
      <div className="mb-3 flex flex-col gap-2 sm:flex-row sm:items-center">
        <h2 className="mr-auto text-sm font-semibold">
          Report history <span className="font-normal text-muted-foreground">· {list.length}</span>
        </h2>
        <div className="relative sm:w-64">
          <Search className="absolute left-3 top-1/2 size-3.5 -translate-y-1/2 text-muted-foreground" />
          <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search reports…" className="h-8 pl-8 text-xs" aria-label="Search reports" />
        </div>
      </div>
      {list.length === 0 ? (
        <EmptyState
          compact
          icon={FileText}
          title={q ? "No reports match" : `No ${type} reports saved yet`}
          description={type === "daily" ? "Finish a check-in and press End My Day — the report lands here." : "Generate a weekly report and save it to keep a record of every week."}
        />
      ) : (
        <Card className="divide-y overflow-hidden">
          {list.map((r) => (
            <button key={r.id} onClick={() => setOpen(r)} className="flex w-full items-center gap-4 px-4 py-3 text-left transition-colors hover:bg-accent/40">
              <div className="grid size-9 shrink-0 place-items-center rounded-lg border bg-surface">
                <FileText className="size-4 text-brand" />
              </div>
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-medium">{r.title}</p>
                <p className="truncate text-xs text-muted-foreground">
                  {type === "daily" ? fmtLong(r.periodStart) : `${fmtMedium(r.periodStart)} – ${fmtMedium(r.periodEnd)}`} · saved {timeAgo(r.updatedAt)}
                  {r.checkIn ? " · with check-in" : ""}
                </p>
              </div>
              <div className="hidden shrink-0 items-center gap-4 text-xs text-muted-foreground sm:flex">
                <span className="inline-flex items-center gap-1">
                  <Clock className="size-3" /> {fmtMinutes(r.stats.minutes)}
                </span>
                <span>{pluralize(r.stats.tasksCompleted, "task")}</span>
                <span>{pluralize(r.stats.projectsTouched, "project")}</span>
              </div>
            </button>
          ))}
        </Card>
      )}

      <Dialog open={!!open} onOpenChange={(o) => !o && setOpen(null)}>
        <DialogContent className="max-w-3xl">
          {open && (
            <>
              <DialogHeader>
                <DialogTitle>{open.title}</DialogTitle>
              </DialogHeader>
              <DialogBody>
                <Markdown source={open.content} />
              </DialogBody>
              <DialogFooter className="flex-wrap justify-between">
                <Button
                  variant="ghost"
                  size="sm"
                  className="text-destructive hover:bg-destructive/10 hover:text-destructive"
                  onClick={() => {
                    setDel(open);
                  }}
                >
                  <Trash2 /> Delete
                </Button>
                <div className="flex flex-wrap gap-2">
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={async () => ((await copyText(open.content)) ? toast.success("Copied") : toast.error("Clipboard unavailable"))}
                  >
                    <Copy /> Copy
                  </Button>
                  <Button variant="outline" size="sm" onClick={() => downloadFile(`${open.title.replace(/[^\w-]+/g, "-")}.md`, open.content, "text/markdown")}>
                    <Download /> .md
                  </Button>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => exportReportPdf({ filename: `${open.title.replace(/[^\w-]+/g, "-")}.pdf`, markdown: open.content }).catch(() => toast.error("PDF export failed"))}
                  >
                    <FileDown /> PDF
                  </Button>
                </div>
              </DialogFooter>
            </>
          )}
        </DialogContent>
      </Dialog>
      <ConfirmDialog
        open={!!del}
        onOpenChange={(o) => !o && setDel(null)}
        title="Delete this report?"
        description="It will be removed from your history. Your logs and tasks are not affected, so you can regenerate it."
        onConfirm={async () => {
          if (!del) return;
          await deleteReport(del.id);
          setOpen(null);
          toast.success("Report deleted");
        }}
      />
    </section>
  );
}
