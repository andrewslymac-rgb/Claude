import { NextResponse, type NextRequest } from "next/server";
import { exchangeCode, getClient, hash, OAuthError, refreshTokens } from "@/lib/services/ai-auth";
import { cors } from "@/lib/oauth-meta";

const err = (code: string, description: string, status = 400) => NextResponse.json({ error: code, error_description: description }, { status, headers: cors });

export async function POST(req: NextRequest) {
  const ct = req.headers.get("content-type") ?? "";
  const params: Record<string, string> = {};
  if (ct.includes("application/json")) Object.assign(params, await req.json().catch(() => ({})));
  else for (const [k, v] of await req.formData()) params[k] = String(v);

  // Client auth: secret in body, in Basic header, or none (public client with PKCE).
  let clientId = params.client_id ?? "";
  let clientSecret = params.client_secret ?? "";
  const basic = req.headers.get("authorization");
  if (basic?.startsWith("Basic ")) {
    const [id, secret] = Buffer.from(basic.slice(6), "base64").toString().split(":");
    clientId = decodeURIComponent(id ?? "");
    clientSecret = decodeURIComponent(secret ?? "");
  }
  const client = clientId ? await getClient(clientId) : null;
  if (!client) return err("invalid_client", "Unknown client", 401);
  if (client.secretHash && hash(clientSecret) !== client.secretHash) return err("invalid_client", "Bad client secret", 401);

  try {
    let t;
    if (params.grant_type === "authorization_code") {
      if (!params.code || !params.code_verifier || !params.redirect_uri) return err("invalid_request", "code, code_verifier and redirect_uri are required");
      t = await exchangeCode({ code: params.code, clientId, redirectUri: params.redirect_uri, codeVerifier: params.code_verifier });
    } else if (params.grant_type === "refresh_token") {
      if (!params.refresh_token) return err("invalid_request", "refresh_token is required");
      t = await refreshTokens(params.refresh_token, clientId);
    } else return err("unsupported_grant_type", "Use authorization_code or refresh_token");
    return NextResponse.json({ access_token: t.access, token_type: "Bearer", expires_in: t.expiresIn, refresh_token: t.refresh }, { headers: { ...cors, "Cache-Control": "no-store" } });
  } catch (e) {
    if (e instanceof OAuthError) return err(e.code, e.message);
    throw e;
  }
}
export const OPTIONS = () => new NextResponse(null, { status: 204, headers: cors });
