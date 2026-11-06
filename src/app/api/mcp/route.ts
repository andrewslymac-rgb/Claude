import { NextResponse, type NextRequest } from "next/server";
import { WebStandardStreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/webStandardStreamableHttp.js";
import { authenticate } from "@/lib/services/ai-auth";
import { buildServer } from "@/lib/mcp/server";
import { appUrl, cors } from "@/lib/oauth-meta";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

const unauthorized = () =>
  new NextResponse(JSON.stringify({ error: "unauthorized", error_description: "Connect Orbit in your AI tool to get access." }), {
    status: 401,
    headers: { ...cors, "Content-Type": "application/json", "WWW-Authenticate": `Bearer resource_metadata="${appUrl()}/.well-known/oauth-protected-resource/api/mcp"` },
  });

async function handle(req: NextRequest) {
  const auth = req.headers.get("authorization");
  const bearer = auth?.startsWith("Bearer ") ? auth.slice(7).trim() : null;
  const principal = await authenticate(bearer);
  if (!principal) return unauthorized();

  // Stateless: one server + transport per request. Simple and works behind any load balancer.
  const server = buildServer(principal);
  const transport = new WebStandardStreamableHTTPServerTransport({ sessionIdGenerator: undefined, enableJsonResponse: true });
  await server.connect(transport);
  const res = await transport.handleRequest(req);
  const headers = new Headers(res.headers);
  for (const [k, v] of Object.entries(cors)) headers.set(k, v);
  return new NextResponse(res.body, { status: res.status, headers });
}

export const POST = handle;
export const GET = handle;
export const DELETE = handle;
export const OPTIONS = () => new NextResponse(null, { status: 204, headers: cors });
