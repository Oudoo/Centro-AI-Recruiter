import { NextRequest, NextResponse } from "next/server";
import { updateRecord } from "@/lib/zoho-creator";

export const maxDuration = 60;

/**
 * Bulk approve / reject N candidates at once.
 *
 * Today we record the decision in the existing Reviewer_Override_* fields with a
 * structured reason. Once Centro adds dedicated Approval_Status fields to the
 * Screening_Session schema (recommended), this endpoint will write those instead
 * and stop conflating with score overrides. UI behaviour and audit trail won't
 * change for the recruiter — only the underlying field names.
 */
export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { ids, decision, reason, reviewerEmail } = body as {
      ids?: string[];
      decision?: "Approved" | "Rejected";
      reason?: string;
      reviewerEmail?: string;
    };

    if (!Array.isArray(ids) || ids.length === 0) {
      return NextResponse.json(
        { error: "ids[] must be a non-empty array" },
        { status: 400 }
      );
    }
    if (decision !== "Approved" && decision !== "Rejected") {
      return NextResponse.json(
        { error: "decision must be 'Approved' or 'Rejected'" },
        { status: 400 }
      );
    }
    if (!reason || reason.trim().length < 10) {
      return NextResponse.json(
        { error: "reason must be at least 10 chars (audit trail)" },
        { status: 400 }
      );
    }
    if (!reviewerEmail || !/@/.test(reviewerEmail)) {
      return NextResponse.json(
        { error: "valid reviewerEmail required" },
        { status: 400 }
      );
    }

    const tag = `[BULK_${decision.toUpperCase()}]`;
    const stamped = `${tag} ${reason.trim()}`;

    let succeeded = 0;
    let failed = 0;
    const failures: Array<{ id: string; error: string }> = [];

    for (const id of ids) {
      try {
        await updateRecord("All_Screening_Sessions", id, {
          Reviewer_Override_Applied: true,
          Reviewer_Override_Reason: stamped,
          Reviewer_Email: reviewerEmail.trim(),
          Reviewed_Time: new Date().toISOString(),
          Session_Status: decision === "Approved" ? "Completed" : "Manual_Override"
        });
        succeeded++;
      } catch (err) {
        failed++;
        failures.push({
          id,
          error: err instanceof Error ? err.message : String(err)
        });
      }
    }

    return NextResponse.json({
      ok: true,
      attempted: ids.length,
      succeeded,
      failed,
      failures
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error("/api/admin/sessions/bulk-action error:", err);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
