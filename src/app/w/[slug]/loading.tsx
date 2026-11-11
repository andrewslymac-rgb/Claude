/** Skeleton while a workspace screen loads, so navigation never shows a blank page. */
export default function Loading() {
  return (
    <div className="page animate-pulse" aria-busy="true" aria-label="Loading">
      <div className="flex items-center gap-3.5">
        <div className="h-12 w-12 rounded-2xl bg-card md:h-14 md:w-14" />
        <div className="space-y-2">
          <div className="h-3 w-32 rounded bg-card" />
          <div className="h-6 w-56 rounded bg-card" />
          <div className="h-3 w-40 rounded bg-card" />
        </div>
      </div>
      <div className="mt-8 grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-3">
        <div className="h-28 rounded-2xl border border-line bg-card/60 md:col-span-2 lg:col-span-3" />
        <div className="h-40 rounded-2xl border border-line bg-card/60 md:col-span-2 lg:col-span-3" />
        <div className="h-56 rounded-2xl border border-line bg-card/60" />
        <div className="h-56 rounded-2xl border border-line bg-card/60" />
        <div className="h-56 rounded-2xl border border-line bg-card/60" />
      </div>
    </div>
  );
}
