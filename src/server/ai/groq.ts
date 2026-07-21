import "server-only";
// ─────────────────────────────────────────────────────────────────────────────
// Groq chat loop for the private assistant.
//
// Stateless: it receives the conversation, runs a tool-calling loop against Groq
// (openai/gpt-oss-20b by default), and returns the final answer. Nothing is
// stored. Only tokenised data ever leaves this process — real names are
// substituted back in only after the model has produced its reply.
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
- Be concise and accurate. If a tool returns nothing, say so plainly.`;

export interface ChatMessage {
  role: "user" | "assistant";
  content: string;
}

interface GroqToolCall {
  id: string;
  type: "function";
  function: { name: string; arguments: string };
}
interface GroqMessage {
  role: "system" | "user" | "assistant" | "tool";
  content: string | null;
  tool_calls?: GroqToolCall[];
  tool_call_id?: string;
}

const tools = TOOL_SCHEMAS.map((t) => ({
  type: "function" as const,
  function: { name: t.name, description: t.description, parameters: t.parameters },
}));

async function callGroq(messages: GroqMessage[], apiKey: string, model: string) {
  const res = await fetch(GROQ_URL, {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${apiKey}` },
    body: JSON.stringify({ model, messages, tools, tool_choice: "auto", temperature: 0.2 }),
  });
  if (!res.ok) {
    const detail = await res.text().catch(() => "");
    throw new Error(`Groq request failed (${res.status}): ${detail.slice(0, 300)}`);
  }
  const json = (await res.json()) as { choices: { message: GroqMessage }[] };
  return json.choices[0]?.message;
}

/**
 * Run the conversation to a final answer. `history` is the sanitised client
 * conversation (user/assistant turns only). Returns the raw reply text, still in
 * token form — the caller de-tokenises it before returning to the user.
 */
export async function runAssistant(history: ChatMessage[], ctx: ToolContext): Promise<string> {
  const apiKey = process.env.GROQ_API_KEY;
  if (!apiKey) throw new Error("GROQ_API_KEY is not configured.");
  const model = process.env.GROQ_MODEL || "openai/gpt-oss-20b";

  // Re-tokenise the whole history before it leaves the process: prior assistant
  // turns were de-tokenised for display, and the user may have typed a real name
  // too. Either way, only tokens reach the model.
  const messages: GroqMessage[] = [
    { role: "system", content: SYSTEM_PROMPT },
    ...history.map((m) => ({ role: m.role, content: ctx.tok.tokenize(m.content) })),
  ];

  for (let round = 0; round < MAX_TOOL_ROUNDS; round++) {
    const reply = await callGroq(messages, apiKey, model);
    if (!reply) return "Sorry — I couldn't produce a reply.";

    if (reply.tool_calls?.length) {
      messages.push({ role: "assistant", content: reply.content ?? "", tool_calls: reply.tool_calls });
      for (const call of reply.tool_calls) {
        let args: Record<string, unknown> = {};
        try {
          args = call.function.arguments ? JSON.parse(call.function.arguments) : {};
        } catch {
          args = {};
        }
        let result: unknown;
        try {
          result = await runTool(call.function.name, args, ctx);
        } catch (e) {
          result = { error: e instanceof Error ? e.message : "tool failed" };
        }
        messages.push({ role: "tool", tool_call_id: call.id, content: JSON.stringify(result) });
      }
      continue;
    }

    return reply.content ?? "";
  }

  return "I wasn't able to finish that — please try rephrasing.";
}
