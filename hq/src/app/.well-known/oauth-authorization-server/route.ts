import { NextResponse } from "next/server";
import { authServerMetadata, cors } from "@/lib/oauth-meta";
export const GET = () => NextResponse.json(authServerMetadata(), { headers: cors });
export const OPTIONS = () => new NextResponse(null, { status: 204, headers: cors });
