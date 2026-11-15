import { readFile } from "node:fs/promises";
import path from "node:path";
import { NextResponse, type NextRequest } from "next/server";
import { requireTool } from "@/lib/tools/access";
import { isAppId } from "@/lib/tools/apps";
import { appDef } from "@/lib/tools/store";

export const dynamic = "force-dynamic";

const cache = new Map<string, string>();
async function source(file: string) {
  const hit = cache.get(file);
  if (hit && process.env.NODE_ENV === "production") return hit;
  const text = await readFile(path.join(process.cwd(), "tools-src", file), "utf8");
  cache.set(file, text);
  return text;
}

/**
 * A built-in tool's screens, shown inside the Orbit page in a frame. Only members of the
 * company that has the tool get it; everyone else gets a 404. The screens hold no data:
 * they load it from the tool's API with the person's own Orbit sign-in.
 */
export async function GET(_req: NextRequest, { params }: { params: Promise<{ slug: string; app: string }> }) {
  const { slug, app } = await params;
  let access;
  try {
    if (!isAppId(app)) throw new Error("unknown");
    access = await requireTool(slug, app, "view");
  } catch {
    return new NextResponse("Not found", { status: 404 });
  }
  const orbit = { api: `/api/w/${access.workspace.slug}/tools/${app}`, canWrite: access.canEdit, canAdmin: access.canAdmin, user: access.user.name ?? access.user.email };
  const boot = `window.ORBIT=${JSON.stringify(orbit).replace(/</g, "\\u003c")};\n${await source("shim.js")}`;
  const html = (await source(appDef(app).file)).replace("/*__ORBIT__*/", () => boot);
  return new NextResponse(html, {
    headers: { "Content-Type": "text/html; charset=utf-8", "Cache-Control": "private, no-store", "X-Frame-Options": "SAMEORIGIN", "Content-Security-Policy": "frame-ancestors 'self'", "X-Content-Type-Options": "nosniff", "Referrer-Policy": "same-origin" },
  });
}
