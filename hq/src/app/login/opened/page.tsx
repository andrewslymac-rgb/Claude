import { OrbitWordmark } from "@/components/OrbitLogo";

/** Shown when a sign-in link is opened in a different browser or Chrome profile than the one that asked for it. */
export default function Opened() {
  return (
    <main className="flex min-h-screen items-center justify-center bg-side px-6">
      <div className="w-full max-w-sm rounded-2xl border border-line bg-card p-8 shadow-sm">
        <OrbitWordmark size={30} />
        <h1 className="mt-3 text-xl font-semibold">You&apos;re signed in</h1>
        <p className="mt-2 text-sm text-ink-soft">The Orbit window where you asked for this link has signed in on its own. Head back there, and you can close this tab.</p>
        <p className="mt-2 text-sm text-ink-soft">Prefer to use Orbit here instead? You&apos;re signed in on this browser too.</p>
        <a href="/" className="mt-6 block w-full rounded-lg border border-line px-4 py-2.5 text-center text-sm font-medium hover:bg-hover">
          Open Orbit here
        </a>
      </div>
    </main>
  );
}
