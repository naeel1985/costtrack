import "server-only";
// ─────────────────────────────────────────────────────────────────────────────
// Claude (Anthropic Messages API) streaming chat loop for the private assistant.
//
// Stateless: it receives the conversation, runs a tool-calling loop against the
// Claude API (claude-haiku-4-5 by default), and STREAMS the final answer back as
// de-tokenised text. Nothing is stored. Only tokenised data ever leaves this
// process — real names are substituted back only as the reply streams out.
// ─────────────────────────────────────────────────────────────────────────────

import { runTool, TOOL_SCHEMAS, type ToolContext } from "./tools";

const ANTHROPIC_URL = "https://api.anthropic.com/v1/messages";
const ANTHROPIC_VERSION = "2023-06-01";
const MAX_TOOL_ROUNDS = 6;
// Generous headroom so a multi-round tool answer (e.g. a month-by-month
// breakdown) never gets cut off mid-sentence by hitting the output cap.
const MAX_TOKENS = 4096;

/** Prepended server-side on every request; the user never sees or edits it. */
export const SYSTEM_PROMPT = `You are a private financial assistant embedded in the user's own cost-tracking dashboard.
You will see placeholder tokens such as PAYEE_001, ACCT_002, CARD_003, PERSON_004.
These are opaque identifiers for real entities you are NOT allowed to know. Rules:
- Treat each token as a stable name. Reuse it verbatim; never alter, translate, or guess what it stands for.
- Never invent tokens that were not provided to you. If you need data, call a tool.
- When you need to reference an entity in a tool call, pass the exact token.
- Answer using the tokens; the system will substitute real names before the user sees your reply.
- You only have access to THIS user's data via tools. Do not claim to access anything else.
- Be concise and accurate. If a tool returns nothing, say so plainly.
- When asked about committed costs, upcoming bills, or "how much do I owe" over a period longer than a month, break the total down month by month (use the tool's monthly breakdown when it provides one) instead of quoting a single lump sum for the whole horizon.

Style — talk like a helpful, warm human, not a report generator:
- Write in natural sentences and short paragraphs. Get to the point kindly.
- Avoid headings and heavy markdown. A short bullet list is fine when you list several items.
- Use a markdown table (GFM pipe syntax, with a header row) when presenting structured multi-row data — a month-by-month breakdown, a list of payments, a comparison — instead of writing it out as prose.
- Format money as "AED 2,500.00" and dates as "31 Jul 2026".
- When you reference a token, just use it inline in a sentence; the user will see the real name.`;

export interface ChatMessage {
  role: "user" | "assistant";
  content: string;
}

type ContentBlockParam =
  | { type: "text"; text: string }
  | { type: "tool_use"; id: string; name: string; input: unknown }
  | { type: "tool_result"; tool_use_id: string; content: string };

interface AnthropicMessage {
  role: "user" | "assistant";
  content: string | ContentBlockParam[];
}

interface StreamBlock {
  type: string;
  text: string;
  json: string;
  id?: string;
  name?: string;
}

const toolDefs = TOOL_SCHEMAS.map((t) => ({
  name: t.name,
  description: t.description,
  input_schema: t.parameters,
}));

export function isConfigured() {
  return Boolean(process.env.ANTHROPIC_API_KEY);
}

/**
 * Stream the assistant's final answer as de-tokenised text chunks. Tool rounds
 * are consumed internally; only the user-facing answer is yielded.
 */
export async function* runAssistantStream(
  history: ChatMessage[],
  ctx: ToolContext,
): AsyncGenerator<string> {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) throw new Error("ANTHROPIC_API_KEY is not configured.");
  const model = process.env.ANTHROPIC_MODEL || "claude-haiku-4-5-20251001";

  // Re-tokenise the whole history: prior assistant turns were de-tokenised for
  // display and the user may have typed a real name — only tokens go upstream.
  const messages: AnthropicMessage[] = history.map((m) => ({
    role: m.role,
    content: ctx.tok.tokenize(m.content),
  }));

  for (let round = 0; round < MAX_TOOL_ROUNDS; round++) {
    const res = await fetch(ANTHROPIC_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": apiKey,
        "anthropic-version": ANTHROPIC_VERSION,
      },
      body: JSON.stringify({
        model,
        max_tokens: MAX_TOKENS,
        system: SYSTEM_PROMPT,
        messages,
        tools: toolDefs,
        temperature: 0.3,
        stream: true,
      }),
    });
    if (!res.ok || !res.body) {
      const detail = await res.text().catch(() => "");
      throw new Error(`Claude request failed (${res.status}): ${detail.slice(0, 200)}`);
    }

    const reader = res.body.getReader();
    const decoder = new TextDecoder();
    let buf = "";
    let pending = ""; // buffered content awaiting a safe de-tokenisation boundary
    let stopReason: string | null = null;
    const blocks = new Map<number, StreamBlock>();

    const flushSafe = (): string => {
      // A token never contains whitespace, so any complete word is safe to
      // de-tokenise. Hold back only the trailing partial word.
      const cut = Math.max(pending.lastIndexOf(" "), pending.lastIndexOf("\n"));
      if (cut < 0) return "";
      const out = ctx.tok.detokenize(pending.slice(0, cut + 1));
      pending = pending.slice(cut + 1);
      return out;
    };

    let streamDone = false;
    while (!streamDone) {
      const { value, done } = await reader.read();
      if (done) break;
      buf += decoder.decode(value, { stream: true });
      let nl: number;
      while ((nl = buf.indexOf("\n")) >= 0) {
        const line = buf.slice(0, nl).trim();
        buf = buf.slice(nl + 1);
        if (!line.startsWith("data:")) continue;
        const data = line.slice(5).trim();
        if (!data) continue;
        let json: {
          type: string;
          index?: number;
          content_block?: { type: string; id?: string; name?: string };
          delta?: { type: string; text?: string; partial_json?: string; stop_reason?: string };
          error?: unknown;
        };
        try {
          json = JSON.parse(data);
        } catch {
          continue;
        }
        switch (json.type) {
          case "content_block_start": {
            if (json.index == null || !json.content_block) break;
            blocks.set(json.index, {
              type: json.content_block.type,
              text: "",
              json: "",
              id: json.content_block.id,
              name: json.content_block.name,
            });
            break;
          }
          case "content_block_delta": {
            if (json.index == null || !json.delta) break;
            const block = blocks.get(json.index);
            if (!block) break;
            if (json.delta.type === "text_delta" && json.delta.text) {
              block.text += json.delta.text;
              pending += json.delta.text;
              const chunk = flushSafe();
              if (chunk) yield chunk;
            } else if (json.delta.type === "input_json_delta" && json.delta.partial_json) {
              block.json += json.delta.partial_json;
            }
            break;
          }
          case "message_delta":
            if (json.delta?.stop_reason) stopReason = json.delta.stop_reason;
            break;
          case "message_stop":
            streamDone = true;
            break;
          case "error":
            throw new Error(`Claude stream error: ${JSON.stringify(json.error).slice(0, 200)}`);
        }
      }
    }

    const ordered = [...blocks.entries()].sort(([a], [b]) => a - b).map(([, b]) => b);
    const toolBlocks = ordered.filter((b) => b.type === "tool_use");

    if (stopReason === "tool_use" && toolBlocks.length) {
      const assistantContent: ContentBlockParam[] = [];
      for (const b of ordered) {
        if (b.type === "text" && b.text) {
          assistantContent.push({ type: "text", text: b.text });
        } else if (b.type === "tool_use") {
          let input: unknown = {};
          try {
            input = b.json ? JSON.parse(b.json) : {};
          } catch {
            input = {};
          }
          assistantContent.push({ type: "tool_use", id: b.id!, name: b.name!, input });
        }
      }
      messages.push({ role: "assistant", content: assistantContent });

      const resultBlocks: ContentBlockParam[] = [];
      for (const b of toolBlocks) {
        let args: Record<string, unknown> = {};
        try {
          args = b.json ? JSON.parse(b.json) : {};
        } catch {
          args = {};
        }
        let result: unknown;
        try {
          result = await runTool(b.name!, args, ctx);
        } catch (e) {
          result = { error: e instanceof Error ? e.message : "tool failed" };
        }
        resultBlocks.push({ type: "tool_result", tool_use_id: b.id!, content: JSON.stringify(result) });
      }
      messages.push({ role: "user", content: resultBlocks });
      continue;
    }

    // Final answer fully streamed — flush whatever's left.
    if (pending) yield ctx.tok.detokenize(pending);
    if (stopReason === "max_tokens") yield "\n\n_(cut off — ask me to continue for the rest)_";
    return;
  }

  yield "I couldn't finish that — please try rephrasing.";
}
