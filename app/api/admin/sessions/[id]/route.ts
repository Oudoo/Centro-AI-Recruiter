import { NextRequest, NextResponse } from "next/server";
import { getScreeningSession } from "@/lib/zoho-creator";

export const maxDuration = 30;

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    if (!id) {
      return NextResponse.json({ error: "Missing session id" }, { status: 400 });
    }
    const session = await getScreeningSession(id);
    if (!session) {
      return NextResponse.json({ error: "Session not found" }, { status: 404 });
    }
    return NextResponse.json({ ok: true, session });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error("/api/admin/sessions/[id] error:", err);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
