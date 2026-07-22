import * as React from "react";

// A tiny, safe markdown renderer for assistant replies. Supports paragraphs,
// bold/italic/inline-code, and simple bullet/numbered lists. React escapes all
// text, so there's no HTML-injection surface. Anything fancier (tables etc.) the
// model is told to avoid, and falls through as plain text.

function renderInline(text: string): React.ReactNode[] {
  const nodes: React.ReactNode[] = [];
  const re = /(\*\*([^*]+)\*\*|(?:^|(?<=\s))\*([^*\s][^*]*?)\*|_([^_]+)_|`([^`]+)`)/g;
  let last = 0;
  let key = 0;
  let m: RegExpExecArray | null;
  while ((m = re.exec(text))) {
    if (m.index > last) nodes.push(text.slice(last, m.index));
    if (m[2] != null) nodes.push(<strong key={key++}>{m[2]}</strong>);
    else if (m[3] != null) nodes.push(<em key={key++}>{m[3]}</em>);
    else if (m[4] != null) nodes.push(<em key={key++}>{m[4]}</em>);
    else if (m[5] != null)
      nodes.push(
        <code key={key++} className="rounded bg-muted px-1 py-0.5 font-mono text-[0.85em]">
          {m[5]}
        </code>,
      );
    last = m.index + m[0].length;
  }
  if (last < text.length) nodes.push(text.slice(last));
  return nodes;
}

const BULLET = /^\s*[-*]\s+/;
const NUMBER = /^\s*\d+\.\s+/;

export function Markdown({ text }: { text: string }) {
  const lines = text.replace(/\r/g, "").split("\n");
  const blocks: React.ReactNode[] = [];
  let i = 0;
  let key = 0;

  while (i < lines.length) {
    const line = lines[i];
    if (!line.trim()) {
      i++;
      continue;
    }
    if (BULLET.test(line)) {
      const items: string[] = [];
      while (i < lines.length && BULLET.test(lines[i])) items.push(lines[i++].replace(BULLET, ""));
      blocks.push(
        <ul key={key++} className="my-1 list-disc space-y-0.5 pl-5">
          {items.map((it, j) => (
            <li key={j}>{renderInline(it)}</li>
          ))}
        </ul>,
      );
      continue;
    }
    if (NUMBER.test(line)) {
      const items: string[] = [];
      while (i < lines.length && NUMBER.test(lines[i])) items.push(lines[i++].replace(NUMBER, ""));
      blocks.push(
        <ol key={key++} className="my-1 list-decimal space-y-0.5 pl-5">
          {items.map((it, j) => (
            <li key={j}>{renderInline(it)}</li>
          ))}
        </ol>,
      );
      continue;
    }
    // Paragraph: gather until a blank line or a list starts.
    const para: string[] = [line];
    i++;
    while (i < lines.length && lines[i].trim() && !BULLET.test(lines[i]) && !NUMBER.test(lines[i])) {
      para.push(lines[i++]);
    }
    blocks.push(
      <p key={key++} className="whitespace-pre-wrap leading-relaxed [&:not(:first-child)]:mt-2">
        {para.map((ln, j) => (
          <React.Fragment key={j}>
            {j > 0 && <br />}
            {renderInline(ln.replace(/^#{1,6}\s+/, ""))}
          </React.Fragment>
        ))}
      </p>,
    );
  }

  return <>{blocks}</>;
}
