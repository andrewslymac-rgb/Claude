import Link from "next/link";
export default function NotFound() {
  return (
    <div className="mx-auto max-w-md px-6 py-24 text-center">
      <div className="text-4xl">🔍</div>
      <h1 className="mt-3 text-xl font-semibold">Not found</h1>
      <p className="mt-1 text-sm text-ink-soft">This page doesn&apos;t exist, or you don&apos;t have access to it.</p>
      <Link href="/" className="mt-6 inline-block rounded-lg bg-accent px-4 py-2 text-sm font-medium text-paper">Go home</Link>
    </div>
  );
}
