import { NextRequest, NextResponse } from "next/server";
import { listScreeningSessions } from "@/lib/zoho-creator";

export const maxDuration = 60;

export async function GET(req: NextRequest) {
  try {
    const url = new URL(req.url);
    const limit = Number(url.searchParams.get("limit")) || 200;
    const validLimits = [200, 500, 1000] as const;
    const safeLimit = (validLimits as readonly number[]).includes(limit)
      ? (limit as 200 | 500 | 1000)
      : 200;

    const sessions = await listScreeningSessions({ maxRecords: safeLimit });
    return NextResponse.json({
      ok: true,
      sessions,
      count: sessions.length
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error("/api/admin/sessions error:", err);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
