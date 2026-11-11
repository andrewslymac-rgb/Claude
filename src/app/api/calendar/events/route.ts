import { NextResponse, type NextRequest } from "next/server";
import { getCurrentUser } from "@/lib/auth/session";
import { calendarFeed } from "@/lib/calendar";

export const dynamic = "force-dynamic";

/** The signed-in person's own calendar. Nobody else's is ever returned. */
export async function GET(req: NextRequest) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Please sign in again." }, { status: 401 });
  const days = Math.min(31, Math.max(1, Number(req.nextUrl.searchParams.get("days") ?? 7) || 7));
  const force = req.nextUrl.searchParams.get("refresh") === "1";
  try {
    return NextResponse.json(await calendarFeed(user.id, days, force), { headers: { "Cache-Control": "private, no-store" } });
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 500 });
  }
}
