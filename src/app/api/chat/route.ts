import { NextResponse, type NextRequest } from "next/server";
import { getAuth } from "@/server/auth";
import { createToolContext } from "@/server/ai/tools";
import { runAssistant, type ChatMessage } from "@/server/ai/groq";

// Never cached, never stored — every request is self-contained.
export const dynamic = "force-dynamic";

const MAX_MESSAGES = 40;
const MAX_CHARS = 6000;

function sanitize(input: unknown): ChatMessage[] {
  if (!Array.isArray(input)) return [];
  const out: ChatMessage[] = [];
  for (const m of input.slice(-MAX_MESSAGES)) {
    if (!m || typeof m !== "object") continue;
    const role = (m as { role?: unknown }).role;
    const content = (m as { content?: unknown }).content;
    if ((role === "user" || role === "assistant") && typeof content === "string" && content.trim()) {
      out.push({ role, content: content.slice(0, MAX_CHARS) });
    }
  }
  return out;
}

export async function POST(req: NextRequest) {
  const auth = await getAuth();
  if (!auth) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!auth.user.emailVerified && auth.user.role !== "admin") {
    return NextResponse.json({ error: "Verify your email first." }, { status: 403 });
  }

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid request." }, { status: 400 });
  }

  const messages = sanitize((body as { messages?: unknown })?.messages);
  if (messages.length === 0 || messages[messages.length - 1].role !== "user") {
    return NextResponse.json({ error: "Send a message." }, { status: 400 });
  }

  try {
    const ctx = await createToolContext(auth.user.id, auth.dek);
    const raw = await runAssistant(messages, ctx);
    const reply = ctx.tok.detokenize(raw); // restore real names for the user only
    return NextResponse.json(
      { reply },
      { headers: { "Cache-Control": "no-store", "X-Robots-Tag": "noindex" } },
    );
  } catch (e) {
    const message = e instanceof Error ? e.message : "The assistant is unavailable.";
    return NextResponse.json({ error: message }, { status: 502 });
  }
}
