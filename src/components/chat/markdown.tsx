import * as React from "react";

// A tiny, safe markdown renderer for assistant replies. Supports paragraphs,
// bold/italic/inline-code, simple bullet/numbered lists, headings, and GFM-style
// pipe tables. React escapes all text, so there's no HTML-injection surface.

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
const HEADING = /^(#{1,6})\s+(.*)$/;
const TABLE_ROW = /^\s*\|(.+)\|\s*$/;
const TABLE_SEPARATOR = /^\s*\|?\s*:?-{2,}:?\s*(\|\s*:?-{2,}:?\s*)*\|?\s*$/;

function splitTableRow(line: string): string[] {
  const trimmed = line.trim().replace(/^\|/, "").replace(/\|$/, "");
  return trimmed.split("|").map((cell) => cell.trim());
}

const HEADING_TAG = ["h1", "h2", "h3", "h4", "h5", "h6"] as const;
const HEADING_CLASS: Record<(typeof HEADING_TAG)[number], string> = {
  h1: "mt-2 text-base font-semibold",
  h2: "mt-2 text-sm font-semibold",
  h3: "mt-2 text-sm font-semibold",
  h4: "mt-2 text-sm font-semibold",
  h5: "mt-2 text-sm font-semibold",
  h6: "mt-2 text-sm font-semibold",
};

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
    const heading = HEADING.exec(line);
    if (heading) {
      const level = heading[1].length as 1 | 2 | 3 | 4 | 5 | 6;
      const Tag = HEADING_TAG[level - 1];
      blocks.push(
        <Tag key={key++} className={HEADING_CLASS[Tag]}>
          {renderInline(heading[2])}
        </Tag>,
      );
      i++;
      continue;
    }
    if (
      TABLE_ROW.test(line) &&
      i + 1 < lines.length &&
      TABLE_ROW.test(lines[i + 1]) &&
      TABLE_SEPARATOR.test(lines[i + 1])
    ) {
      const header = splitTableRow(line);
      i += 2; // header row + separator row
      const rows: string[][] = [];
      while (i < lines.length && TABLE_ROW.test(lines[i])) {
        rows.push(splitTableRow(lines[i]));
        i++;
      }
      blocks.push(
        <div key={key++} className="my-1.5 overflow-x-auto rounded-lg border">
          <table className="w-full border-collapse text-xs">
            <thead>
              <tr className="bg-muted/50">
                {header.map((h, j) => (
                  <th key={j} className="border-b px-2 py-1.5 text-left font-medium">
                    {renderInline(h)}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {rows.map((row, ri) => (
                <tr key={ri} className="border-t">
                  {row.map((cell, ci) => (
                    <td key={ci} className="px-2 py-1.5">
                      {renderInline(cell)}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>,
      );
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
    // Paragraph: gather until a blank line, a list, a heading, or a table starts.
    const para: string[] = [line];
    i++;
    while (
      i < lines.length &&
      lines[i].trim() &&
      !BULLET.test(lines[i]) &&
      !NUMBER.test(lines[i]) &&
      !HEADING.test(lines[i]) &&
      !TABLE_ROW.test(lines[i])
    ) {
      para.push(lines[i++]);
    }
    blocks.push(
      <p key={key++} className="whitespace-pre-wrap leading-relaxed [&:not(:first-child)]:mt-2">
        {para.map((ln, j) => (
          <React.Fragment key={j}>
            {j > 0 && <br />}
            {renderInline(ln)}
          </React.Fragment>
        ))}
      </p>,
    );
  }

  return <>{blocks}</>;
}
