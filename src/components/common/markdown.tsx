import * as React from "react";
import { cn } from "@/lib/utils";

/** Minimal, safe Markdown renderer for generated reports (no HTML injection). */
function inline(text: string, keyBase: string): React.ReactNode[] {
  const out: React.ReactNode[] = [];
  const re = /(\*\*[^*]+\*\*|\*[^*]+\*|`[^`]+`)/g;
  let last = 0;
  let m: RegExpExecArray | null;
  let i = 0;
  while ((m = re.exec(text))) {
    if (m.index > last) out.push(text.slice(last, m.index));
    const tok = m[0];
    const k = `${keyBase}-${i++}`;
    if (tok.startsWith("**")) out.push(<strong key={k}>{tok.slice(2, -2)}</strong>);
    else if (tok.startsWith("`")) out.push(<code key={k}>{tok.slice(1, -1)}</code>);
    else out.push(<em key={k} className="text-muted-foreground">{tok.slice(1, -1)}</em>);
    last = m.index + tok.length;
  }
  if (last < text.length) out.push(text.slice(last));
  return out;
}

export function Markdown({ source, className }: { source: string; className?: string }) {
  const blocks: React.ReactNode[] = [];
  const lines = source.split("\n");
  let list: { ordered: boolean; items: string[] } | null = null;
  const flush = () => {
    if (!list) return;
    const k = `l${blocks.length}`;
    blocks.push(
      list.ordered ? (
        <ol key={k} className="mb-3 list-decimal space-y-1.5 pl-5 text-sm marker:text-muted-foreground">
          {list.items.map((it, i) => (
            <li key={i} className="pl-1 leading-relaxed text-foreground/90">
              {inline(it, `${k}${i}`)}
            </li>
          ))}
        </ol>
      ) : (
        <ul key={k}>
          {list.items.map((it, i) => (
            <li key={i}>{inline(it, `${k}${i}`)}</li>
          ))}
        </ul>
      ),
    );
    list = null;
  };
  lines.forEach((raw, idx) => {
    const line = raw.trimEnd();
    const ul = line.match(/^\s*[-*]\s+(.*)$/);
    const ol = line.match(/^\s*\d+\.\s+(.*)$/);
    if (ul || ol) {
      const ordered = !!ol;
      if (!list || list.ordered !== ordered) {
        flush();
        list = { ordered, items: [] };
      }
      list.items.push((ul ?? ol)![1]);
      return;
    }
    flush();
    if (!line.trim()) return;
    const k = `b${idx}`;
    if (line.startsWith("### ")) blocks.push(<h3 key={k}>{inline(line.slice(4), k)}</h3>);
    else if (line.startsWith("## ")) blocks.push(<h2 key={k}>{inline(line.slice(3), k)}</h2>);
    else if (line.startsWith("# ")) blocks.push(<h1 key={k}>{inline(line.slice(2), k)}</h1>);
    else if (/^---+$/.test(line)) blocks.push(<hr key={k} />);
    else blocks.push(<p key={k}>{inline(line, k)}</p>);
  });
  flush();
  return <div className={cn("prose-report", className)}>{blocks}</div>;
}
