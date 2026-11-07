import { NextResponse } from "next/server";
import { claimWaitingLogin, consumeNext } from "@/lib/auth/session";

export const dynamic = "force-dynamic";

/** Polled by the login page after a link is sent. */
export async function GET() {
  const status = await claimWaitingLogin();
  const next = status === "done" ? await consumeNext() : null;
  return NextResponse.json({ status, next }, { headers: { "Cache-Control": "no-store" } });
}
