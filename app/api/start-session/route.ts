import { NextRequest, NextResponse } from "next/server";
import { findInvitationByCode, markInvitationUsed } from "@/lib/zoho-creator";

export const maxDuration = 20;

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { invitationCode, email, pin } = body as {
      invitationCode?: string;
      email?: string;
      pin?: string;
    };

    if (!invitationCode || !email || !pin) {
      return NextResponse.json(
        { error: "invitationCode, email, and pin are required" },
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

    if (
      invitation.candidateEmail.toLowerCase() !== email.toLowerCase() ||
      invitation.pin !== pin
    ) {
      return NextResponse.json(
        { error: "Incorrect Email or PIN. Double-check the details your recruiter sent." },
        { status: 401 }
      );
    }

    // Schedule-gate check: 403 Too Early if < slotTime - 10m, 403 Expired if > slotTime + 10m
    if (invitation.slotTime) {
      const slotTimeMs = new Date(invitation.slotTime).getTime();
      if (!Number.isNaN(slotTimeMs)) {
        const nowMs = Date.now();
        const tenMinutesMs = 10 * 60 * 1000;

        if (nowMs < slotTimeMs - tenMinutesMs) {
          const formattedTime = new Date(invitation.slotTime).toLocaleString("en-US", {
            dateStyle: "medium",
            timeStyle: "short"
          });
          return NextResponse.json(
            {
              error: "Too Early",
              message: `Too Early: Your screening is scheduled for ${formattedTime}. You can only join starting 10 minutes before your slot.`
            },
            { status: 403 }
          );
        }

        if (nowMs > slotTimeMs + tenMinutesMs) {
          const formattedTime = new Date(invitation.slotTime).toLocaleString("en-US", {
            dateStyle: "medium",
            timeStyle: "short"
          });
          return NextResponse.json(
            {
              error: "Expired",
              message: `Expired: Your scheduled screening slot was ${formattedTime}. This session has expired since you did not join within the 10-minute grace window.`
            },
            { status: 403 }
          );
        }
      }
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
