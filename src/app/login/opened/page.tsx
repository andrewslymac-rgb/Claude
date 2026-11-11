import { OrbitWordmark } from "@/components/OrbitLogo";

/** Shown when a sign-in link is opened in a different browser or Chrome profile than the one that asked for it. */
export default function Opened() {
  return (
    <main className="flex pt-safe pb-safe min-h-dvh items-center justify-center bg-side px-6">
      <div className="w-full max-w-sm rounded-2xl border border-line bg-card p-8 shadow-sm">
        <OrbitWordmark size={30} />
        <h1 className="mt-3 text-xl font-semibold">You&apos;re signed in</h1>
        <p className="mt-2 text-sm text-ink-soft">The Orbit window where you asked for this link has signed in on its own. Head back there, and you can close this tab.</p>
        <p className="mt-2 text-sm text-ink-soft">This browser isn&apos;t signed in. If you&apos;d rather use Orbit here, use the button.</p>
        <form action="/api/auth/magic/here" method="post">
          <button className="mt-6 block w-full rounded-lg border border-line px-4 py-2.5 text-center text-sm font-medium hover:bg-hover">Open Orbit here</button>
        </form>
      </div>
    </main>
  );
}
