import { NextRequest, NextResponse } from "next/server";

export const maxDuration = 10;

export async function GET(req: NextRequest) {
  try {
    const url = new URL(req.url);
    const invitationCode = url.searchParams.get("invitationCode") || "";

    // Generate upcoming available booking slots dynamically
    // Generates slots for the next 3 days, in hours between 9:00 AM and 5:00 PM
    const slots: string[] = [];
    const now = new Date();

    for (let dayOffset = 0; dayOffset < 3; dayOffset++) {
      const date = new Date();
      date.setDate(now.getDate() + dayOffset);
      
      // Reset hours to typical working times (9 to 17)
      for (let hour = 9; hour <= 17; hour += 2) {
        const slotTime = new Date(
          date.getFullYear(),
          date.getMonth(),
          date.getDate(),
          hour,
          0,
          0
        );

        // Only include slots in the future
        if (slotTime.getTime() > now.getTime()) {
          slots.push(slotTime.toISOString());
        }
      }
    }

    return NextResponse.json({
      ok: true,
      invitationCode,
      slots,
      timezone: "UTC",
      message: "Fetched available screening booking slots successfully."
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error("/api/genesys/whatsapp-booking GET error:", err);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
