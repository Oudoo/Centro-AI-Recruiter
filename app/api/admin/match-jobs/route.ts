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

function normalizeEnglishLevel(level: string): string {
  if (!level) return "Beginner";
  const l = level.trim().toUpperCase();
  if (l === "C2") return "Native";
  if (l === "C1") return "Advanced";
  if (l === "B2") return "Upper_Intermediate";
  if (l === "B1") return "Intermediate";
  if (l === "A2" || l === "A1") return "Beginner";
  if (l === "UPPER INTERMEDIATE" || l === "UPPER_INTERMEDIATE") return "Upper_Intermediate";
  if (l === "INTERMEDIATE") return "Intermediate";
  if (l === "ADVANCED") return "Advanced";
  if (l === "NATIVE") return "Native";
  if (l === "BEGINNER") return "Beginner";
  return level;
}

function levelRank(level: string): number {
  const norm = normalizeEnglishLevel(level);
  return ["Beginner", "Intermediate", "Upper_Intermediate", "Advanced", "Native"].indexOf(
    norm
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

        // Determine if we run in mock/heuristic fallback mode
        const useMock = !process.env.ANTHROPIC_API_KEY;
        let enriched: RoleMatch[] = [];

        if (useMock) {
          // Heuristic Offline Matching Engine
          enriched = ROLE_CATALOG.map((role) => {
            const gate = preFilter(role, candidate);
            
            // Calculate fitScore based on overall + emphasis matching
            let emphasisSum = 0;
            const emphasisCount = role.emphasis.length;
            for (const dim of role.emphasis) {
              const scoreVal = candidate[dim as keyof typeof candidate] as number ?? 3.0;
              emphasisSum += scoreVal;
            }
            const avgEmphasis = emphasisCount > 0 ? (emphasisSum / emphasisCount) : 3.0;

            const overallScaled = (candidate.overall / 5) * 100;
            const emphasisScaled = (avgEmphasis / 5) * 100;

            let baseFit = (overallScaled * 0.6) + (emphasisScaled * 0.4);

            // Shift matching bonus or applied position matching
            if (candidate.appliedPosition && role.title.toLowerCase().includes(candidate.appliedPosition.toLowerCase())) {
              baseFit += 12;
            } else if (candidate.appliedPosition && candidate.appliedPosition.toLowerCase().includes("customer") && role.title.toLowerCase().includes("customer")) {
              baseFit += 6;
            }

            if (!gate.meetsEnglishMin) baseFit = Math.min(baseFit, 35);
            if (!gate.meetsScoreMin) baseFit = Math.min(baseFit, 50);

            const fitScore = Math.max(15, Math.min(100, Math.round(baseFit)));

            let fitTier: "strong" | "good" | "stretch" | "no-fit" = "no-fit";
            if (fitScore >= 80) fitTier = "strong";
            else if (fitScore >= 65) fitTier = "good";
            else if (fitScore >= 45) fitTier = "stretch";

            let reasoning = "";
            let primaryConcern: string | undefined = undefined;

            if (fitTier === "strong") {
              reasoning = `Excellent alignment between candidate's overall score (${candidate.overall.toFixed(1)}/5) and the role requirements, showcasing premium ${role.emphasis.join(" and ")}.`;
            } else if (fitTier === "good") {
              reasoning = `Strong fit for ${role.title}. The candidate's English proficiency (${candidate.englishLevel}) and strong ${role.emphasis[0]} match this profile well.`;
            } else if (fitTier === "stretch") {
              const emphasisScore = candidate[role.emphasis[0] as keyof typeof candidate] as number ?? 3.0;
              reasoning = `Candidate meets the minimum threshold but would require structured nesting support, particularly to improve their ${role.emphasis[0]} of ${emphasisScore.toFixed(1)}/5.`;
              primaryConcern = `May require additional coaching to handle complex calls due to moderate ${role.emphasis[0]} scores.`;
            } else {
              if (!gate.meetsEnglishMin) {
                reasoning = `English level of ${candidate.englishLevel} does not meet the minimum required level of ${role.minEnglishLevel} for this voice-centric role.`;
                primaryConcern = `Failed hard English proficiency gate (requires minimum ${role.minEnglishLevel}).`;
              } else {
                reasoning = `Overall AI screening score of ${candidate.overall.toFixed(1)} is below the required baseline of ${role.minOverallScore} for this position.`;
                primaryConcern = `Insufficient overall technical screening score.`;
              }
            }

            return {
              roleId: role.id,
              title: role.title,
              fitScore,
              fitTier,
              reasoning,
              primaryConcern,
              meetsEnglishMin: gate.meetsEnglishMin,
              meetsScoreMin: gate.meetsScoreMin
            };
          });
        } else {
          // Live Claude Sonnet API Matching
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

          enriched = parsed.matches.map((m) => {
            const role = ROLE_CATALOG.find((r) => r.id === m.roleId);
            const gate = role ? preFilter(role, candidate) : { meetsEnglishMin: false, meetsScoreMin: false };
            return {
              ...m,
              title: role?.title ?? m.roleId,
              meetsEnglishMin: gate.meetsEnglishMin,
              meetsScoreMin: gate.meetsScoreMin
            };
          });
        }

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
