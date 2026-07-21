import "server-only";
// ─────────────────────────────────────────────────────────────────────────────
// Groq streaming chat loop for the private assistant.
//
// Stateless: it receives the conversation, runs a tool-calling loop against Groq
// (openai/gpt-oss-20b by default), and STREAMS the final answer back as
// de-tokenised text. Nothing is stored. Only tokenised data ever leaves this
// process — real names are substituted back only as the reply streams out.
// ─────────────────────────────────────────────────────────────────────────────

import { runTool, TOOL_SCHEMAS, type ToolContext } from "./tools";

const GROQ_URL = "https://api.groq.com/openai/v1/chat/completions";
const MAX_TOOL_ROUNDS = 6;

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

Style — talk like a helpful, warm human, not a report generator:
- Write in natural sentences and short paragraphs. Get to the point kindly.
- Do NOT use tables, headings, or heavy markdown. A short bullet list is fine only when you list several items.
- Format money as "AED 2,500.00" and dates as "31 Jul 2026".
- When you reference a token, just use it inline in a sentence; the user will see the real name.`;

export interface ChatMessage {
  role: "user" | "assistant";
  content: string;
}

interface ToolCallAcc {
  id: string;
  name: string;
  args: string;
}
interface GroqMessage {
  role: "system" | "user" | "assistant" | "tool";
  content: string | null;
  tool_calls?: { id: string; type: "function"; function: { name: string; arguments: string } }[];
  tool_call_id?: string;
}

const toolDefs = TOOL_SCHEMAS.map((t) => ({
  type: "function" as const,
  function: { name: t.name, description: t.description, parameters: t.parameters },
}));

export function isConfigured() {
  return Boolean(process.env.GROQ_API_KEY);
}

/**
 * Stream the assistant's final answer as de-tokenised text chunks. Tool rounds
 * are consumed internally; only the user-facing answer is yielded.
 */
export async function* runAssistantStream(
  history: ChatMessage[],
  ctx: ToolContext,
): AsyncGenerator<string> {
  const apiKey = process.env.GROQ_API_KEY;
  if (!apiKey) throw new Error("GROQ_API_KEY is not configured.");
  const model = process.env.GROQ_MODEL || "openai/gpt-oss-20b";

  // Re-tokenise the whole history: prior assistant turns were de-tokenised for
  // display and the user may have typed a real name — only tokens go upstream.
  const messages: GroqMessage[] = [
    { role: "system", content: SYSTEM_PROMPT },
    ...history.map((m) => ({ role: m.role, content: ctx.tok.tokenize(m.content) })),
  ];

  for (let round = 0; round < MAX_TOOL_ROUNDS; round++) {
    const res = await fetch(GROQ_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${apiKey}` },
      body: JSON.stringify({
        model,
        messages,
        tools: toolDefs,
        tool_choice: "auto",
        temperature: 0.3,
        stream: true,
      }),
    });
    if (!res.ok || !res.body) {
      const detail = await res.text().catch(() => "");
      throw new Error(`Groq request failed (${res.status}): ${detail.slice(0, 200)}`);
    }

    const reader = res.body.getReader();
    const decoder = new TextDecoder();
    let buf = "";
    let content = "";
    let sawTool = false;
    let pending = ""; // buffered content awaiting a safe de-tokenisation boundary
    const toolAcc: ToolCallAcc[] = [];

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
        if (data === "[DONE]") {
          streamDone = true;
          break;
        }
        let json: { choices?: { delta?: GroqMessage & { tool_calls?: { index?: number; id?: string; function?: { name?: string; arguments?: string } }[] } }[] };
        try {
          json = JSON.parse(data);
        } catch {
          continue;
        }
        const delta = json.choices?.[0]?.delta;
        if (!delta) continue;
        if (delta.tool_calls) {
          sawTool = true;
          for (const tc of delta.tool_calls) {
            const i = tc.index ?? 0;
            const cur = toolAcc[i] ?? { id: "", name: "", args: "" };
            if (tc.id) cur.id = tc.id;
            if (tc.function?.name) cur.name += tc.function.name;
            if (tc.function?.arguments) cur.args += tc.function.arguments;
            toolAcc[i] = cur;
          }
        }
        if (typeof delta.content === "string" && delta.content && !sawTool) {
          content += delta.content;
          pending += delta.content;
          const chunk = flushSafe();
          if (chunk) yield chunk;
        }
      }
    }

    const toolCalls = toolAcc.filter(Boolean);
    if (toolCalls.length) {
      messages.push({
        role: "assistant",
        content,
        tool_calls: toolCalls.map((t) => ({
          id: t.id,
          type: "function",
          function: { name: t.name, arguments: t.args },
        })),
      });
      for (const call of toolCalls) {
        let args: Record<string, unknown> = {};
        try {
          args = call.args ? JSON.parse(call.args) : {};
        } catch {
          args = {};
        }
        let result: unknown;
        try {
          result = await runTool(call.name, args, ctx);
        } catch (e) {
          result = { error: e instanceof Error ? e.message : "tool failed" };
        }
        messages.push({ role: "tool", tool_call_id: call.id, content: JSON.stringify(result) });
      }
      continue;
    }

    // Final answer fully streamed — flush whatever's left.
    if (pending) yield ctx.tok.detokenize(pending);
    return;
  }

  yield "I couldn't finish that — please try rephrasing.";
}
