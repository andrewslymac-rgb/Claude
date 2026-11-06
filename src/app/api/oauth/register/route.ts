import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import { registerClient } from "@/lib/services/ai-auth";
import { cors } from "@/lib/oauth-meta";

/** OAuth 2.0 Dynamic Client Registration (RFC 7591), as used by claude.ai and Claude Code. */
const body = z.object({
  client_name: z.string().max(120).optional(),
  redirect_uris: z.array(z.string().url()).min(1).max(10),
  token_endpoint_auth_method: z.enum(["none", "client_secret_post", "client_secret_basic"]).optional(),
  grant_types: z.array(z.string()).optional(),
  response_types: z.array(z.string()).optional(),
});

export async function POST(req: NextRequest) {
  const parsed = body.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "invalid_client_metadata", error_description: parsed.error.message }, { status: 400, headers: cors });
  const d = parsed.data;
  const method = d.token_endpoint_auth_method ?? "none";
  const { id, secret } = await registerClient({ name: d.client_name ?? "AI tool", redirectUris: d.redirect_uris, wantsSecret: method !== "none" });
  return NextResponse.json(
    {
      client_id: id,
      ...(secret ? { client_secret: secret, client_secret_expires_at: 0 } : {}),
      client_name: d.client_name ?? "AI tool",
      redirect_uris: d.redirect_uris,
      token_endpoint_auth_method: method,
      grant_types: ["authorization_code", "refresh_token"],
      response_types: ["code"],
    },
    { status: 201, headers: cors },
  );
}
export const OPTIONS = () => new NextResponse(null, { status: 204, headers: cors });
