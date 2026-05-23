import { NextRequest, NextResponse } from "next/server";
import { listScreeningSessions } from "@/lib/zoho-creator";
import { listLocalSessions } from "@/lib/local-db";

export const maxDuration = 60;

export async function GET(req: NextRequest) {
  try {
    const url = new URL(req.url);
    const limit = Number(url.searchParams.get("limit")) || 200;
    const validLimits = [200, 500, 1000] as const;
    const safeLimit = (validLimits as readonly number[]).includes(limit)
      ? (limit as 200 | 500 | 1000)
      : 200;

    const localSessions = await listLocalSessions();
    const creatorSessions = await listScreeningSessions({ maxRecords: safeLimit });

    // De-duplicate sessions by ID, prioritizing local DB sessions over Zoho Creator/Mock sessions
    const localIds = new Set(localSessions.map((s) => s.id));
    const mergedSessions = [
      ...localSessions,
      ...creatorSessions.filter((s) => !localIds.has(s.id))
    ];

    return NextResponse.json({
      ok: true,
      sessions: mergedSessions,
      count: mergedSessions.length
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error("/api/admin/sessions error:", err);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
