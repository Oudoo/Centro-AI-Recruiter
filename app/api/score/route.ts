import { NextRequest, NextResponse } from "next/server";
import { scoreScreening } from "@/lib/claude";
import { analyzeFaceFrames, aggregateFaceTimeline, type FaceFrame } from "@/lib/hume-face";
import { syncScreeningSession } from "@/lib/zoho-creator";

export const maxDuration = 300; // Vercel: allow up to 5 minutes for face batch + Claude

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const {
      candidateName,
      candidateEmail,
      candidatePhone,
      candidatePosition,
      candidateRecruitId,
      candidateExternalId,
      transcript,
      prosodyTimeline,
      faceFrames,
      durationSec,
      humeChatId,
      verification
    } = body as {
      candidateName?: string;
      candidateEmail?: string;
      candidatePhone?: string;
      candidatePosition?: string;
      candidateRecruitId?: string;
      candidateExternalId?: string;
      transcript?: string;
      prosodyTimeline?: Array<{ time: number; emotions: Record<string, number> }>;
      faceFrames?: FaceFrame[];
      durationSec?: number;
      humeChatId?: string;
      verification?: {
        verified: boolean;
        confidence: number;
        method?: string;
      } | null;
    };

    if (!transcript || transcript.trim().length < 20) {
      return NextResponse.json(
        {
          error:
            "Transcript is too short to score. The screening session may have ended before the candidate spoke.",
          framesCaptured: faceFrames?.length ?? 0
        },
        { status: 400 }
      );
    }

    const framesCaptured = faceFrames?.length ?? 0;

    let faceTimeline: Array<{ time: number; emotions: Record<string, number> }> = [];
    let faceAggregated: ReturnType<typeof aggregateFaceTimeline> = [];
    let faceFramesAnalyzed = 0;
    if (faceFrames && faceFrames.length > 0) {
      try {
        const rawResults = await analyzeFaceFrames(faceFrames);
        faceFramesAnalyzed = rawResults.filter((r) => r.detected).length;
        faceTimeline = rawResults
          .filter((r) => r.detected)
          .map((r) => ({ time: r.timeOffsetMs, emotions: r.emotions }));
        faceAggregated = aggregateFaceTimeline(rawResults);
      } catch (err) {
        console.error("Face analysis failed (continuing without):", err);
      }
    }

    const score = await scoreScreening({
      candidateName: candidateName ?? "Candidate",
      transcript,
      prosodyTimeline,
      faceTimeline
    });

    // Push the completed session into Zoho Creator (Phase 1A).
    // Silent-fail by design so the candidate never sees a Zoho error block their report —
    // we surface the sync status in the response and the dashboard will retry.
    let creatorRecordId: string | null = null;
    let creatorSyncError: string | null = null;
    if (process.env.ZOHO_CREATOR_OAUTH_REFRESH_TOKEN) {
      try {
        creatorRecordId = await syncScreeningSession({
          candidateName: candidateName ?? "Candidate",
          candidateEmail: candidateEmail ?? "",
          candidatePhone,
          candidatePosition,
          candidateRecruitId,
          candidateExternalId,
          sessionStatus: "Completed",
          startedAtIso: new Date(
            Date.now() - (durationSec ?? 0) * 1000
          ).toISOString(),
          completedAtIso: new Date().toISOString(),
          transcript,
          score,
          faceFramesAnalyzed,
          humeChatId,
          verification
        });
      } catch (err) {
        creatorSyncError = err instanceof Error ? err.message : String(err);
        console.error("Creator sync failed (continuing without):", err);
      }
    } else {
      creatorSyncError =
        "Zoho Creator OAuth not configured — set ZOHO_CREATOR_OAUTH_REFRESH_TOKEN in .env.local";
    }

    return NextResponse.json({
      ...score,
      faceAggregated,
      framesCaptured,
      faceFramesAnalyzed,
      durationSec: durationSec ?? 0,
      creatorRecordId,
      creatorSyncError
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error("Score endpoint error:", err);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
