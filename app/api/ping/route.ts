import { NextResponse } from "next/server";

// Lightweight liveness ping used by the NetworkStatus widget to measure round-trip latency.
// Returns a tiny JSON body and disables caching.
export async function GET() {
  return NextResponse.json(
    { ok: true, t: Date.now() },
    { headers: { "Cache-Control": "no-store, max-age=0" } }
  );
}
