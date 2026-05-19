import { NextRequest, NextResponse } from "next/server";
import Anthropic from "@anthropic-ai/sdk";
import { getScreeningSession } from "@/lib/zoho-creator";
import { ROLE_CATALOG, type Role } from "@/lib/role-catalog";

export const maxDuration = 60;

const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY ?? "" });

export type RoleMatch = {
  roleId: string;
  title: string;
  fitScore: number; // 0-100
  fitTier: "strong" | "good" | "stretch" | "no-fit";
  reasoning: string;
  primaryConcern?: string;
  meetsEnglishMin: boolean;
  meetsScoreMin: boolean;
};

function levelRank(level: string): number {
  return ["Beginner", "Intermediate", "Upper_Intermediate", "Advanced", "Native"].indexOf(
    level
  );
}

function preFilter(
  role: Role,
  candidate: {
    overall: number;
    englishLevel: string;
  }
): { meetsEnglishMin: boolean; meetsScoreMin: boolean } {
  return {
    meetsEnglishMin: levelRank(candidate.englishLevel) >= levelRank(role.minEnglishLevel),
    meetsScoreMin: candidate.overall >= role.minOverallScore
  };
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { sessionIds } = body as { sessionIds?: string[] };

    if (!Array.isArray(sessionIds) || sessionIds.length === 0) {
      return NextResponse.json(
        { error: "sessionIds[] required" },
        { status: 400 }
      );
    }

    const sessions = await Promise.all(
      sessionIds.map((id) => getScreeningSession(id))
    );
    const validSessions = sessions.filter(
      (s): s is NonNullable<typeof s> => s !== null
    );

    if (validSessions.length === 0) {
      return NextResponse.json({ error: "No matching sessions found" }, { status: 404 });
    }

    // For each candidate, compute role matches
    const results = await Promise.all(
      validSessions.map(async (s) => {
        const candidate = {
          overall: s.overallScore,
          englishLevel: s.englishLevel,
          composure: s.composureScore,
          eq: s.eqScore,
          confidence: s.confidenceScore,
          fluency: s.fluencyScore,
          appliedPosition: s.candidatePosition,
          rationale: s.aiRationaleSummary
        };

        // Pre-filter to roles that meet hard mins (don't waste tokens on no-fits)
        const eligibleRoles = ROLE_CATALOG.map((r) => ({
          role: r,
          gate: preFilter(r, candidate)
        }));

        // Use Claude to rank fit for each role, with reasoning
        const prompt = `You are a Centro CDX BPO recruiting specialist. Rank how well this candidate fits each open role.

CANDIDATE PROFILE:
- Overall AI screening score: ${candidate.overall.toFixed(2)}/5 (English level: ${candidate.englishLevel.replace("_", " ")})
- Composure ${candidate.composure.toFixed(2)} · EQ ${candidate.eq.toFixed(2)} · Confidence ${candidate.confidence.toFixed(2)} · Fluency ${candidate.fluency.toFixed(2)}
- Applied for: ${candidate.appliedPosition || "Unspecified"}
- AI rationale: ${candidate.rationale}

OPEN ROLES TO SCORE:
${JSON.stringify(
  ROLE_CATALOG.map((r) => ({
    id: r.id,
    title: r.title,
    shift: r.shift,
    languages: r.languageRequirements,
    minEnglish: r.minEnglishLevel,
    minOverallScore: r.minOverallScore,
    weighted: r.emphasis,
    description: r.description
  })),
  null,
  2
)}

For EACH role, return a fitScore 0-100 and one-sentence reasoning. Be honest — most candidates fit 2-3 roles well, not all of them. A "no-fit" should score 0-30 with a clear reason.

Return ONLY valid JSON, no surrounding prose:
{
  "matches": [
    {
      "roleId": "...",
      "fitScore": <0-100>,
      "fitTier": "strong" | "good" | "stretch" | "no-fit",
      "reasoning": "<one sentence>",
      "primaryConcern": "<one short sentence, only if fitScore < 70>"
    }
  ]
}`;

        const response = await client.messages.create({
          model: "claude-sonnet-4-6",
          max_tokens: 2500,
          messages: [{ role: "user", content: prompt }]
        });

        const textBlock = response.content.find((b) => b.type === "text");
        if (!textBlock || textBlock.type !== "text") {
          throw new Error("Claude returned no text content");
        }
        const raw = textBlock.text
          .trim()
          .replace(/^```(?:json)?\s*/i, "")
          .replace(/\s*```$/i, "");
        const parsed = JSON.parse(raw) as { matches: RoleMatch[] };

        // Enrich with title + pre-filter outcomes (Claude doesn't see those)
        const enriched: RoleMatch[] = parsed.matches.map((m) => {
          const role = ROLE_CATALOG.find((r) => r.id === m.roleId);
          const gate = role ? preFilter(role, candidate) : { meetsEnglishMin: false, meetsScoreMin: false };
          return {
            ...m,
            title: role?.title ?? m.roleId,
            meetsEnglishMin: gate.meetsEnglishMin,
            meetsScoreMin: gate.meetsScoreMin
          };
        });

        // Sort: meets-both-gates first, then by fitScore desc
        enriched.sort((a, b) => {
          const aPass = a.meetsEnglishMin && a.meetsScoreMin ? 1 : 0;
          const bPass = b.meetsEnglishMin && b.meetsScoreMin ? 1 : 0;
          if (bPass !== aPass) return bPass - aPass;
          return b.fitScore - a.fitScore;
        });

        return {
          sessionId: s.id,
          candidateName: s.candidateName,
          candidateEmail: s.candidateEmail,
          overallScore: s.overallScore,
          englishLevel: s.englishLevel,
          appliedPosition: s.candidatePosition,
          matches: enriched
        };
      })
    );

    return NextResponse.json({ ok: true, results });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error("/api/admin/match-jobs error:", err);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
