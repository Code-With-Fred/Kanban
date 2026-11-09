import { fmtWeekday } from "./dates";
import type { DayStat } from "./insights";

/**
 * Renders a Markdown report (the format produced by summary.ts) into a clean,
 * paginated A4 PDF, with an optional daily-activity bar chart.
 */
export async function exportReportPdf(opts: {
  filename: string;
  markdown: string;
  series?: DayStat[];
  subtitle?: string;
}) {
  const { jsPDF } = await import("jspdf");
  const doc = new jsPDF({ unit: "pt", format: "a4" });
  const W = doc.internal.pageSize.getWidth();
  const H = doc.internal.pageSize.getHeight();
  const M = 48;
  const maxW = W - M * 2;
  let y = M;

  const ensure = (h: number) => {
    if (y + h > H - M) {
      footer();
      doc.addPage();
      y = M;
    }
  };
  let page = 1;
  const footer = () => {
    doc.setFont("helvetica", "normal");
    doc.setFontSize(8);
    doc.setTextColor(150);
    doc.text("CodewithFred Project Hub", M, H - 24);
    doc.text(`Page ${page}`, W - M, H - 24, { align: "right" });
    page++;
  };

  // Header band
  doc.setFillColor(12, 12, 16);
  doc.rect(0, 0, W, 70, "F");
  doc.setFillColor(124, 108, 246);
  doc.rect(0, 70, W, 2, "F");
  doc.setTextColor(240);
  doc.setFont("helvetica", "bold");
  doc.setFontSize(11);
  doc.text("CodewithFred Project Hub", M, 32);
  doc.setFont("helvetica", "normal");
  doc.setFontSize(8.5);
  doc.setTextColor(170);
  doc.text("Every project. Every milestone. Every day. Under control.", M, 48);
  y = 104;

  const clean = (s: string) => s.replace(/\*\*(.+?)\*\*/g, "$1").replace(/\*(.+?)\*/g, "$1").replace(/`(.+?)`/g, "$1").replace(/[—–]/g, "-").replace(/[“”]/g, '"').replace(/[‘’]/g, "'").replace(/…/g, "...").replace(/·/g, "|");

  const writeWrapped = (text: string, size: number, opts: { bold?: boolean; color?: number; indent?: number; gap?: number } = {}) => {
    doc.setFont("helvetica", opts.bold ? "bold" : "normal");
    doc.setFontSize(size);
    doc.setTextColor(opts.color ?? 30);
    const lines = doc.splitTextToSize(clean(text), maxW - (opts.indent ?? 0)) as string[];
    const lh = size * 1.42;
    for (const line of lines) {
      ensure(lh);
      doc.text(line, M + (opts.indent ?? 0), y);
      y += lh;
    }
    y += opts.gap ?? 0;
  };

  let chartDrawn = false;
  const drawChart = (series: DayStat[]) => {
    const ch = 130;
    ensure(ch + 40);
    doc.setFont("helvetica", "bold");
    doc.setFontSize(9);
    doc.setTextColor(110);
    doc.text("HOURS LOGGED PER DAY", M, y);
    y += 14;
    const top = y;
    const max = Math.max(60, ...series.map((d) => d.minutes));
    const bw = maxW / series.length;
    doc.setDrawColor(230);
    doc.line(M, top + ch, M + maxW, top + ch);
    series.forEach((d, i) => {
      const h = (d.minutes / max) * (ch - 14);
      const x = M + i * bw + bw * 0.22;
      doc.setFillColor(124, 108, 246);
      if (h > 0) doc.roundedRect(x, top + ch - h, bw * 0.56, h, 2, 2, "F");
      doc.setFont("helvetica", "normal");
      doc.setFontSize(7.5);
      doc.setTextColor(120);
      doc.text(fmtWeekday(d.date), x + bw * 0.28, top + ch + 11, { align: "center" });
      if (d.minutes) doc.text(`${(d.minutes / 60).toFixed(1)}h`, x + bw * 0.28, top + ch - h - 4, { align: "center" });
    });
    y = top + ch + 30;
    chartDrawn = true;
  };

  const lines = opts.markdown.split("\n");
  for (let i = 0; i < lines.length; i++) {
    const raw = lines[i];
    const line = raw.trimEnd();
    if (!line.trim()) {
      y += 4;
      continue;
    }
    if (line.startsWith("# ")) {
      writeWrapped(line.slice(2), 18, { bold: true, color: 15, gap: 2 });
      continue;
    }
    if (line.startsWith("## ")) {
      // Insert the chart before "Daily activity" (weekly) for context.
      if (opts.series && !chartDrawn && /daily activity/i.test(line)) drawChart(opts.series);
      y += 8;
      ensure(28);
      writeWrapped(line.slice(3).toUpperCase(), 9.5, { bold: true, color: 110, gap: 2 });
      doc.setDrawColor(235);
      doc.line(M, y - 8, M + maxW, y - 8);
      y += 4;
      continue;
    }
    if (line.startsWith("### ")) {
      writeWrapped(line.slice(4), 10.5, { bold: true, color: 25, gap: 1 });
      continue;
    }
    const li = line.match(/^\s*(?:[-*]|(\d+)\.)\s+(.*)$/);
    if (li) {
      const marker = li[1] ? `${li[1]}.` : "•";
      doc.setFont("helvetica", "normal");
      doc.setFontSize(10);
      doc.setTextColor(124, 108, 246);
      ensure(14);
      doc.text(marker, M + 4, y);
      writeWrapped(li[2], 10, { indent: 18, gap: 1.5 });
      continue;
    }
    const italic = /^\*(.+)\*$/.test(line);
    writeWrapped(line, italic ? 9 : 10, { color: italic ? 120 : 40, gap: 3 });
  }
  if (opts.series && !chartDrawn) drawChart(opts.series);
  footer();
  doc.save(opts.filename);
}
