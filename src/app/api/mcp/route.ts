import { NextResponse, type NextRequest } from "next/server";
import { getAuth } from "@/server/auth";
import { createToolContext, runTool, TOOL_SCHEMAS } from "@/server/ai/tools";

// A minimal Model Context Protocol server over HTTP (JSON-RPC 2.0). It exposes
// the same tokenising tools the in-app assistant uses, scoped to the signed-in
// user via the session cookie. Non-streaming: each POST returns a JSON response.
export const dynamic = "force-dynamic";

const PROTOCOL_VERSION = "2024-11-05";
const SERVER_INFO = { name: "cashflow-mcp", version: "1.0.0" };

interface RpcRequest {
  jsonrpc: "2.0";
  id?: string | number | null;
  method: string;
  params?: Record<string, unknown>;
}

const ok = (id: RpcRequest["id"], result: unknown) => ({ jsonrpc: "2.0" as const, id, result });
const err = (id: RpcRequest["id"], code: number, message: string) => ({
  jsonrpc: "2.0" as const,
  id,
  error: { code, message },
});

export async function POST(req: NextRequest) {
  const auth = await getAuth();
  if (!auth) return NextResponse.json(err(null, -32001, "Unauthorized"), { status: 401 });

  let body: RpcRequest;
  try {
    body = (await req.json()) as RpcRequest;
  } catch {
    return NextResponse.json(err(null, -32700, "Parse error"), { status: 400 });
  }

  // Notifications (no id) get acknowledged with no body.
  if (body.id === undefined || body.id === null) {
    return new NextResponse(null, { status: 202 });
  }

  switch (body.method) {
    case "initialize":
      return NextResponse.json(
        ok(body.id, {
          protocolVersion: PROTOCOL_VERSION,
          capabilities: { tools: { listChanged: false } },
          serverInfo: SERVER_INFO,
        }),
      );

    case "ping":
      return NextResponse.json(ok(body.id, {}));

    case "tools/list":
      return NextResponse.json(
        ok(body.id, {
          tools: TOOL_SCHEMAS.map((t) => ({
            name: t.name,
            description: t.description,
            inputSchema: t.parameters,
          })),
        }),
      );

    case "tools/call": {
      const name = (body.params?.name as string) ?? "";
      const args = (body.params?.arguments as Record<string, unknown>) ?? {};
      if (!TOOL_SCHEMAS.some((t) => t.name === name)) {
        return NextResponse.json(err(body.id, -32602, `Unknown tool: ${name}`));
      }
      try {
        const ctx = await createToolContext(auth.user.id, auth.dek);
        const result = await runTool(name, args, ctx);
        return NextResponse.json(
          ok(body.id, { content: [{ type: "text", text: JSON.stringify(result) }] }),
          { headers: { "Cache-Control": "no-store" } },
        );
      } catch (e) {
        const message = e instanceof Error ? e.message : "Tool failed";
        return NextResponse.json(ok(body.id, { content: [{ type: "text", text: message }], isError: true }));
      }
    }

    default:
      return NextResponse.json(err(body.id, -32601, `Method not found: ${body.method}`));
  }
}
