import { redirect } from "next/navigation";
import { devLoginEnabled, getCurrentUser, googleEnabled } from "@/lib/auth/session";
import { OrbitWordmark } from "@/components/OrbitLogo";
import { WaitForLink } from "./WaitForLink";

const MESSAGES: Record<string, string> = {
  expired: "That sign-in link expired. Please try again.",
  google_failed: "Google sign-in didn't work. Please try again.",
  unverified_email: "Your Google email isn't verified.",
  google_not_configured: "Google sign-in is turned off. Use the emailed sign-in link instead.",
};

export default async function Login({ searchParams }: { searchParams: Promise<{ error?: string; sent?: string; next?: string }> }) {
  if (await getCurrentUser()) redirect("/");
  const { error, sent, next } = await searchParams;
  const safeNext = next && next.startsWith("/") && !next.startsWith("//") ? next : "";
  const google = googleEnabled();
  const dev = devLoginEnabled();

  return (
    <main className="orbit-bg flex min-h-screen items-center justify-center px-6">
      <div className="card w-full max-w-sm p-8">
        <OrbitWordmark size={30} />
        <div className="eyebrow mt-5">Company headquarters</div>
        <h1 className="mt-1 text-xl font-semibold">Sign in to Orbit</h1>
        <p className="mt-1 text-sm text-ink-soft">{google ? "Use your Google account, or get a sign-in link by email." : "Enter your work email and we'll send you a sign-in link."}</p>

        {error && <p className="mt-4 rounded-lg bg-danger-soft px-3 py-2 text-sm text-danger">{MESSAGES[error] ?? error}</p>}
        {sent && <WaitForLink email={sent} />}

        {google && (
          <a
            href={`/api/auth/google${safeNext ? `?next=${encodeURIComponent(safeNext)}` : ""}`}
            className="mt-6 flex w-full items-center justify-center gap-3 rounded-lg border border-line bg-card px-4 py-2.5 text-sm font-medium hover:bg-hover"
          >
            <svg width="18" height="18" viewBox="0 0 48 48" aria-hidden>
              <path fill="#FFC107" d="M43.6 20.5H42V20H24v8h11.3C33.7 32.7 29.2 36 24 36c-6.6 0-12-5.4-12-12s5.4-12 12-12c3.1 0 5.8 1.2 7.9 3.1l5.7-5.7C34 6.1 29.3 4 24 4 12.9 4 4 12.9 4 24s8.9 20 20 20 20-8.9 20-20c0-1.3-.1-2.4-.4-3.5z" />
              <path fill="#FF3D00" d="m6.3 14.7 6.6 4.8C14.7 15.1 19 12 24 12c3.1 0 5.8 1.2 7.9 3.1l5.7-5.7C34 6.1 29.3 4 24 4 16.3 4 9.7 8.3 6.3 14.7z" />
              <path fill="#4CAF50" d="M24 44c5.2 0 9.9-2 13.4-5.2l-6.2-5.2C29.2 35.1 26.7 36 24 36c-5.2 0-9.6-3.3-11.3-8l-6.5 5C9.5 39.6 16.2 44 24 44z" />
              <path fill="#1976D2" d="M43.6 20.5H42V20H24v8h11.3c-.8 2.2-2.2 4.2-4.1 5.6l6.2 5.2C37 39.2 44 34 44 24c0-1.3-.1-2.4-.4-3.5z" />
            </svg>
            Continue with Google
          </a>
        )}

        {!sent && (
          <form action="/api/auth/magic" method="post" className="mt-6 space-y-2">
            <input type="hidden" name="next" value={safeNext} />
            {google && <div className="py-2 text-center text-xs text-ink-faint">or</div>}
            <label className="block text-sm font-medium" htmlFor="magic-email">
              Email me a sign-in link
            </label>
            <input id="magic-email" name="email" type="email" required placeholder="you@company.com" className="field outline-none focus:border-ink-faint" />
            <button className={`w-full btn ${google ? "btn-secondary" : "btn-primary"}`}>Send sign-in link</button>
            <p className="text-xs text-ink-faint">No password needed. Only people who&apos;ve been added to Orbit can sign in.</p>
          </form>
        )}

        {dev && (
          <form action="/api/auth/dev" method="post" className="mt-6 space-y-2 border-t border-line pt-4">
            <input type="hidden" name="next" value={safeNext} />
            <div className="pb-1 text-center text-xs text-ink-faint">for local testing only</div>
            <label className="block text-sm font-medium" htmlFor="email">
              Email (dev login)
            </label>
            <input id="email" name="email" type="email" required placeholder="you@company.com" className="field" />
            <button className="w-full btn btn-primary">Sign in</button>
            <p className="text-xs text-ink-faint">Dev login is for testing on your own computer and is switched off in production.</p>
          </form>
        )}


      </div>
    </main>
  );
}
