import { NextRequest, NextResponse } from "next/server";
import { createInvitation, listInvitations } from "@/lib/zoho-creator";

export const maxDuration = 30;

function generatePIN(): string {
  // 6-digit, leading-zero safe
  return Math.floor(100000 + Math.random() * 900000).toString();
}

function generateInvitationCode(): string {
  // Short, URL-safe, human-readable. Format: INV-XXXXXX
  const chars = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789"; // skip ambiguous 0/O/1/I
  let code = "";
  for (let i = 0; i < 6; i++) {
    code += chars[Math.floor(Math.random() * chars.length)];
  }
  return `INV-${code}`;
}

export async function GET() {
  try {
    const invitations = await listInvitations();
    invitations.sort((a, b) => b.expiresAt.localeCompare(a.expiresAt));
    return NextResponse.json({ ok: true, invitations });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const {
      candidateEmail,
      candidateFullName,
      candidatePhone,
      targetPosition,
      expiresInHours,
      createdBy,
      notes
    } = body as {
      candidateEmail?: string;
      candidateFullName?: string;
      candidatePhone?: string;
      targetPosition?: string;
      expiresInHours?: number;
      createdBy?: string;
      notes?: string;
    };

    if (!candidateEmail || !/@/.test(candidateEmail)) {
      return NextResponse.json(
        { error: "Valid candidateEmail is required" },
        { status: 400 }
      );
    }
    if (!createdBy || !/@/.test(createdBy)) {
      return NextResponse.json(
        { error: "Valid createdBy (recruiter email) is required" },
        { status: 400 }
      );
    }

    const ttlHours =
      typeof expiresInHours === "number" && expiresInHours > 0 && expiresInHours <= 168
        ? expiresInHours
        : 48;
    const expiresAt = new Date(Date.now() + ttlHours * 3600 * 1000).toISOString();

    const invitationCode = generateInvitationCode();
    const pin = generatePIN();

    await createInvitation({
      invitationCode,
      pin,
      candidateEmail,
      candidateFullName,
      candidatePhone,
      targetPosition,
      createdBy,
      expiresAtIso: expiresAt,
      notes
    });

    const origin =
      req.headers.get("origin") ?? `http://${req.headers.get("host") ?? "localhost:3000"}`;
    const url = `${origin}/start/${invitationCode}`;

    return NextResponse.json({
      ok: true,
      invitationCode,
      pin,
      candidateEmail,
      expiresAt,
      ttlHours,
      url
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error("/api/admin/invitations POST error:", err);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
