import { NextResponse } from "next/server";
import { protectedResourceMetadata, cors } from "@/lib/oauth-meta";
export const GET = () => NextResponse.json(protectedResourceMetadata(), { headers: cors });
export const OPTIONS = () => new NextResponse(null, { status: 204, headers: cors });
