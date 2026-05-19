import { NextRequest, NextResponse } from "next/server";
import Anthropic from "@anthropic-ai/sdk";
import { getScreeningSession } from "@/lib/zoho-creator";

export const maxDuration = 60;

const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY ?? "" });

/**
 * Generates a personalised coaching email for a Borderline candidate inviting them
 * to re-screen in 30 days. The email is encouraging, specific, and identifies the
 * exact dimension(s) they should work on — drawn from their original screening
 * scores.
 */
export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { sessionId } = body as { sessionId?: string };

    if (!sessionId) {
      return NextResponse.json({ error: "sessionId required" }, { status: 400 });
    }

    const session = await getScreeningSession(sessionId);
    if (!session) {
      return NextResponse.json({ error: "Session not found" }, { status: 404 });
    }

    // Find the weakest dimension(s)
    const dims = [
      { key: "fluency", label: "spoken English clarity", score: session.fluencyScore },
      { key: "composure", label: "composure under stress", score: session.composureScore },
      { key: "eq", label: "emotional intelligence / empathy", score: session.eqScore },
      { key: "confidence", label: "confidence in delivery", score: session.confidenceScore }
    ].sort((a, b) => a.score - b.score);

    const weakest = dims[0];
    const secondWeakest = dims[1];

    const prompt = `You are writing a coaching follow-up email from Centro CDX to a candidate who scored "Borderline" on their AI screening. Tone: warm, specific, encouraging, NOT condescending. Treat them as someone we want back, not a reject.

CANDIDATE: ${session.candidateName || "Candidate"}
EMAIL: ${session.candidateEmail}
APPLIED FOR: ${session.candidatePosition || "Customer Service Agent"}

THEIR SCORES (0-5):
- Fluency: ${session.fluencyScore.toFixed(2)}
- Composure: ${session.composureScore.toFixed(2)}
- EQ: ${session.eqScore.toFixed(2)}
- Confidence: ${session.confidenceScore.toFixed(2)}
- Overall: ${session.overallScore.toFixed(2)}

WEAKEST DIMENSION: ${weakest.label} (${weakest.score.toFixed(2)}/5)
SECOND WEAKEST: ${secondWeakest.label} (${secondWeakest.score.toFixed(2)}/5)

AI RATIONALE FROM ORIGINAL SCREENING: ${session.aiRationaleSummary}

Write an email with:
1. A warm opener thanking them for their time
2. Honest, specific feedback — name the weakest dimension AND give 2 concrete improvement tactics (real practice, not platitudes)
3. An invitation to re-screen in 30 days with a fresh invitation
4. A signoff that feels human, not corporate

Constraints:
- Under 200 words total
- No bullet points unless natural
- Address by first name
- Don't mention specific scores (it's discouraging) — describe the behaviour
- End with: "Reply to this email when you're ready and we'll send you a new invitation."

Return ONLY the email body as plain text. No subject line, no JSON, no markdown fences.`;

    const response = await client.messages.create({
      model: "claude-sonnet-4-6",
      max_tokens: 800,
      messages: [{ role: "user", content: prompt }]
    });

    const textBlock = response.content.find((b) => b.type === "text");
    const emailBody =
      textBlock && textBlock.type === "text" ? textBlock.text.trim() : "";

    if (!emailBody) {
      return NextResponse.json(
        { error: "Claude returned empty draft" },
        { status: 500 }
      );
    }

    const subject = `Centro CDX screening follow-up — next steps for ${session.candidateName.split(" ")[0] || "you"}`;

    return NextResponse.json({
      ok: true,
      to: session.candidateEmail,
      subject,
      body: emailBody,
      weakestDimension: weakest.label,
      weakestScore: weakest.score,
      sessionId
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error("/api/admin/draft-coaching error:", err);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
