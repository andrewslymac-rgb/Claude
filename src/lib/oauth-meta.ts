export const appUrl = () => (process.env.APP_URL ?? "http://localhost:3000").replace(/\/$/, "");

export const authServerMetadata = () => ({
  issuer: appUrl(),
  authorization_endpoint: `${appUrl()}/ai/authorize`,
  token_endpoint: `${appUrl()}/api/oauth/token`,
  registration_endpoint: `${appUrl()}/api/oauth/register`,
  scopes_supported: ["read", "write:pages", "write:tasks"],
  response_types_supported: ["code"],
  grant_types_supported: ["authorization_code", "refresh_token"],
  code_challenge_methods_supported: ["S256"],
  token_endpoint_auth_methods_supported: ["none", "client_secret_post", "client_secret_basic"],
});

export const protectedResourceMetadata = () => ({
  resource: `${appUrl()}/api/mcp`,
  authorization_servers: [appUrl()],
  scopes_supported: ["read", "write:pages", "write:tasks"],
  bearer_methods_supported: ["header"],
  resource_name: "Orbit",
});

export const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, DELETE, OPTIONS",
  "Access-Control-Allow-Headers": "Authorization, Content-Type, Mcp-Session-Id, Mcp-Protocol-Version",
  "Access-Control-Expose-Headers": "Mcp-Session-Id, WWW-Authenticate",
};
