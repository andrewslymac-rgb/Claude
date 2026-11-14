"use client";

import { useTransition } from "react";
import { useRouter } from "next/navigation";
import { Lock } from "lucide-react";
import { relockAction } from "@/app/dash-actions";

/** Close the owner area on this device before the 12 hours are up. */
export function LockButton({ slug }: { slug: string }) {
  const [busy, start] = useTransition();
  const router = useRouter();
  return (
    <button onClick={() => start(async () => (await relockAction(slug), router.push(`/w/${slug}/dash`), router.refresh()))} disabled={busy} className="btn btn-sm">
      <Lock size={14} /> Lock now
    </button>
  );
}
