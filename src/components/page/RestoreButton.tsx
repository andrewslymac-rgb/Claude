"use client";

import { useRouter } from "next/navigation";
import { useTransition } from "react";
import { restorePageAction } from "@/app/actions";

export function RestoreButton({ slug, pageId }: { slug: string; pageId: string }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  return (
    <button
      disabled={pending}
      onClick={() => start(async () => (await restorePageAction(slug, pageId), router.push(`/w/${slug}/p/${pageId}`)))}
      className="rounded-md border border-line px-3 py-1 text-sm hover:bg-hover disabled:opacity-50"
    >
      {pending ? "Restoring…" : "Restore"}
    </button>
  );
}
