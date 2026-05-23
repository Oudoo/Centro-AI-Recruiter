import { NextRequest, NextResponse } from "next/server";
import { findInvitationByCode, updateInvitationSlotAndPIN } from "@/lib/zoho-creator";

export const maxDuration = 30;

function generatePIN(): string {
  // 6-digit, leading-zero safe
  return Math.floor(100000 + Math.random() * 900000).toString();
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { invitationCode, slotTime } = body as {
      invitationCode?: string;
      slotTime?: string;
    };

    if (!invitationCode || !slotTime) {
      return NextResponse.json(
        { error: "invitationCode and slotTime are required" },
        { status: 400 }
      );
    }

    // Validate ISO string format
    const parsedDate = new Date(slotTime);
    if (Number.isNaN(parsedDate.getTime())) {
      return NextResponse.json(
        { error: "Invalid slotTime format. Must be an ISO date string." },
        { status: 400 }
      );
    }

    // Retrieve invitation
    const invitation = await findInvitationByCode(invitationCode);
    if (!invitation) {
      return NextResponse.json(
        { error: "Invitation not found" },
        { status: 404 }
      );
    }

    // Generate randomized unique 6-digit PIN
    const final_pin = generatePIN();

    // Update invitation slot time and PIN
    await updateInvitationSlotAndPIN(invitation.id, slotTime, final_pin);

    // Compute start URL
    const origin = req.headers.get("origin") ?? `http://${req.headers.get("host") ?? "localhost:3000"}`;
    const url = `${origin}/start/${invitationCode}`;

    console.log(`[BOOKING CONFIRM] Confirmed slot for invitation ${invitationCode}: Time=${slotTime}, PIN=${final_pin}`);

    return NextResponse.json({
      ok: true,
      pin: final_pin,
      slotTime,
      url
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error("/api/booking/confirm POST error:", err);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
