import { NextRequest, NextResponse } from "next/server";
import { findInvitationByCode, markInvitationUsed } from "@/lib/zoho-creator";

export const maxDuration = 20;

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { invitationCode, pin } = body as {
      invitationCode?: string;
      pin?: string;
    };

    if (!invitationCode || !pin) {
      return NextResponse.json(
        { error: "invitationCode and pin are required" },
        { status: 400 }
      );
    }

    const invitation = await findInvitationByCode(invitationCode);
    if (!invitation) {
      return NextResponse.json(
        { error: "Invitation not found. Check the link your recruiter sent you." },
        { status: 404 }
      );
    }

    if (invitation.invitationStatus !== "Pending") {
      return NextResponse.json(
        {
          error: `This invitation is ${invitation.invitationStatus.toLowerCase()}. Ask your recruiter for a new one.`
        },
        { status: 410 }
      );
    }

    // Expiry check
    if (invitation.expiresAt) {
      const exp = new Date(invitation.expiresAt).getTime();
      if (!Number.isNaN(exp) && exp < Date.now()) {
        return NextResponse.json(
          { error: "This invitation has expired. Ask your recruiter for a new one." },
          { status: 410 }
        );
      }
    }

    if (invitation.pin !== pin) {
      return NextResponse.json(
        { error: "Incorrect PIN. Double-check the code your recruiter sent." },
        { status: 401 }
      );
    }

    // PIN valid — issue a session ID and mark invitation as Used so it can't be replayed
    const sessionId =
      typeof crypto.randomUUID === "function"
        ? crypto.randomUUID()
        : Math.random().toString(36).slice(2) + Math.random().toString(36).slice(2);

    try {
      await markInvitationUsed(invitation.id, sessionId);
    } catch (err) {
      console.error("Could not mark invitation used:", err);
      // Don't block the candidate — let them proceed; the audit log just won't be perfect
    }

    return NextResponse.json({
      ok: true,
      sessionId,
      candidateEmail: invitation.candidateEmail,
      candidateFullName: invitation.candidateFullName,
      targetPosition: invitation.targetPosition
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error("/api/start-session error:", err);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
