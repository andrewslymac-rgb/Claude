import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth/session";
import { listWorkspacesForUser } from "@/lib/access";
import { can } from "@/lib/permissions";
import { getClient, parseScopes, SCOPE_LABELS } from "@/lib/services/ai-auth";
import { OrbitWordmark } from "@/components/OrbitLogo";
import { approveAction } from "./actions";
import type { AiScope } from "@/db/schema";

type Q = { response_type?: string; client_id?: string; redirect_uri?: string; state?: string; scope?: string; code_challenge?: string; code_challenge_method?: string; resource?: string };

/**
 * The OAuth "Allow" screen. An AI tool (claude.ai, Claude Code) sends the person here;
 * they pick which company and what the tool may do; we send them back with a code.
 */
export default async function Authorize({ searchParams }: { searchParams: Promise<Q> }) {
  const q = await searchParams;
  const user = await getCurrentUser();
  if (!user) {
    const qs = new URLSearchParams(Object.entries(q).filter(([, v]) => v) as [string, string][]).toString();
    redirect(`/login?next=${encodeURIComponent(`/ai/authorize?${qs}`)}`);
  }

  const problem = async () => {
    if (q.response_type !== "code") return "This request isn't a standard sign-in request (response_type must be 'code').";
    if (!q.client_id || !q.redirect_uri) return "The AI tool didn't say who it is (missing client_id or redirect_uri).";
    if (!q.code_challenge || q.code_challenge_method !== "S256") return "The AI tool must use PKCE (S256).";
    const client = await getClient(q.client_id);
    if (!client) return "Unknown AI tool. It needs to register with Orbit first.";
    if (!client.redirectUris.includes(q.redirect_uri)) return "The return address doesn't match what this AI tool registered.";
    return null;
  };
  const error = await problem();
  const client = q.client_id ? await getClient(q.client_id) : null;
  const scopes = parseScopes(q.scope);
  const workspaces = (await listWorkspacesForUser(user)).filter((w) => can(w.role, "manage_members"));

  return (
    <main className="flex min-h-screen items-center justify-center bg-side px-6 py-10">
      <div className="w-full max-w-md rounded-2xl border border-line bg-card p-8 shadow-sm">
        <OrbitWordmark size={26} />
        {error ? (
          <>
            <h1 className="mt-5 text-xl font-semibold">Can&apos;t connect</h1>
            <p className="mt-2 text-sm text-ink-soft">{error}</p>
          </>
        ) : workspaces.length === 0 ? (
          <>
            <h1 className="mt-5 text-xl font-semibold">Admin access needed</h1>
            <p className="mt-2 text-sm text-ink-soft">Only an Admin or Owner of a company can connect AI tools to it. Ask an admin to connect, or to make you an admin.</p>
          </>
        ) : (
          <form action={approveAction} className="mt-5">
            <input type="hidden" name="client_id" value={q.client_id} />
            <input type="hidden" name="redirect_uri" value={q.redirect_uri} />
            <input type="hidden" name="state" value={q.state ?? ""} />
            <input type="hidden" name="code_challenge" value={q.code_challenge} />
            <input type="hidden" name="scope" value={scopes.join(" ")} />
            <h1 className="text-xl font-semibold">
              Connect <span className="text-accent">{client?.name ?? "an AI tool"}</span> to Orbit?
            </h1>
            <p className="mt-1 text-sm text-ink-soft">
              Signed in as {user!.name ?? user!.email}. The tool will act in your name, and every change it makes is logged under its own name and can be undone.
            </p>

            <label className="mt-5 block text-sm font-medium">Company</label>
            <select name="workspace_id" className="field" defaultValue={workspaces[0].id}>
              {workspaces.map((w) => (
                <option key={w.id} value={w.id}>
                  {w.icon} {w.name}
                </option>
              ))}
            </select>

            <div className="mt-4 text-sm font-medium">It may</div>
            <ul className="mt-1 space-y-2">
              {(Object.keys(SCOPE_LABELS) as AiScope[]).map((s) => (
                <li key={s} className="flex items-start gap-2 rounded-lg border border-line px-3 py-2 text-sm">
                  <input type="checkbox" name="scopes" value={s} defaultChecked={scopes.includes(s)} disabled={s === "read"} className="mt-1" />
                  <span>
                    <span className="font-medium">{SCOPE_LABELS[s].label}</span>
                    <span className="block text-xs text-ink-soft">{SCOPE_LABELS[s].help}</span>
                  </span>
                </li>
              ))}
            </ul>
            <p className="mt-3 text-xs text-ink-faint">AI tools can never delete pages, change who has access, or edit Google Drive-synced documents. You can disconnect it any time in Settings → AI access.</p>

            <div className="mt-6 flex gap-2">
              <a href={`${q.redirect_uri}?error=access_denied${q.state ? `&state=${encodeURIComponent(q.state)}` : ""}`} className="flex-1 rounded-lg border border-line px-4 py-2.5 text-center text-sm hover:bg-hover">
                Cancel
              </a>
              <button className="flex-1 btn btn-primary">Allow</button>
            </div>
          </form>
        )}
      </div>
    </main>
  );
}
