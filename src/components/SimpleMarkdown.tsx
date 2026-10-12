import type { ReactNode } from "react";

/** 見出し・箇条書き・太字・リンクだけの簡易 Markdown（HTML は解釈しない） */
function inline(text: string): ReactNode[] {
  const out: ReactNode[] = [];
  const re = /(\*\*[^*]+\*\*|\[[^\]]+\]\(https?:\/\/[^)\s]+\))/g;
  let last = 0;
  let m: RegExpExecArray | null;
  let i = 0;
  while ((m = re.exec(text))) {
    if (m.index > last) out.push(text.slice(last, m.index));
    const tok = m[0];
    if (tok.startsWith("**")) out.push(<strong key={i++}>{tok.slice(2, -2)}</strong>);
    else {
      const [, label, href] = tok.match(/\[([^\]]+)\]\(([^)]+)\)/)!;
      out.push(
        <a key={i++} href={href} target="_blank" rel="noreferrer" className="text-accent underline">
          {label}
        </a>,
      );
    }
    last = m.index + tok.length;
  }
  if (last < text.length) out.push(text.slice(last));
  return out;
}

export function SimpleMarkdown({ text }: { text: string }) {
  const blocks: ReactNode[] = [];
  const lines = text.replace(/\r\n/g, "\n").split("\n");
  let list: string[] = [];
  let para: string[] = [];
  const flush = () => {
    if (para.length) {
      blocks.push(<p key={blocks.length}>{inline(para.join(" "))}</p>);
      para = [];
    }
    if (list.length) {
      blocks.push(
        <ul key={blocks.length} className="list-disc space-y-1 pl-5">
          {list.map((l, i) => (
            <li key={i}>{inline(l)}</li>
          ))}
        </ul>,
      );
      list = [];
    }
  };
  for (const line of lines) {
    const t = line.trim();
    if (!t) {
      flush();
    } else if (/^#{1,6}\s/.test(t)) {
      flush();
      blocks.push(
        <h3 key={blocks.length} className="font-semibold">
          {inline(t.replace(/^#+\s/, ""))}
        </h3>,
      );
    } else if (/^[-*・]\s?/.test(t)) {
      if (para.length) flush();
      list.push(t.replace(/^[-*・]\s?/, ""));
    } else {
      if (list.length) flush();
      para.push(t);
    }
  }
  flush();
  return <div className="space-y-3 text-sm leading-relaxed">{blocks}</div>;
}
