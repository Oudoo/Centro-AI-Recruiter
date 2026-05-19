import { NextRequest, NextResponse } from "next/server";
import { updateRecord } from "@/lib/zoho-creator";

export const maxDuration = 30;

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const body = await req.json();
    const { newScore, reason, reviewerEmail } = body as {
      newScore?: number;
      reason?: string;
      reviewerEmail?: string;
    };

    if (
      typeof newScore !== "number" ||
      newScore < 0 ||
      newScore > 5 ||
      !reason ||
      reason.trim().length < 10 ||
      !reviewerEmail ||
      !/@/.test(reviewerEmail)
    ) {
      return NextResponse.json(
        { error: "Invalid override payload: need newScore (0-5), reason (≥10 chars), reviewerEmail" },
        { status: 400 }
      );
    }

    await updateRecord("All_Screening_Sessions", id, {
      Reviewer_Override_Applied: true,
      Reviewer_Override_Score: newScore,
      Reviewer_Override_Reason: reason.trim(),
      Reviewer_Email: reviewerEmail.trim(),
      Reviewed_Time: new Date().toISOString(),
      Session_Status: "Manual_Override"
    });

    return NextResponse.json({ ok: true });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error("/api/admin/sessions/[id]/override error:", err);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
