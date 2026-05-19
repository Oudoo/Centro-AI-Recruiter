import Anthropic from "@anthropic-ai/sdk";
import { activeRubric, mapEnglishLevel, weightedOverall } from "./rubric";

const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY ?? "" });

export type EmotionTimelinePoint = {
  time: number;
  emotions: Record<string, number>;
};

export type DimensionDetail = {
  score: number;
  rubricLevel: 1 | 2 | 3 | 4 | 5;
  evidence: string[];
  reasoning: string;
  toImprove: string;
};

export type ScoreInput = {
  candidateName: string;
  transcript: string;
  prosodyTimeline?: EmotionTimelinePoint[];
  faceTimeline?: EmotionTimelinePoint[];
};

export type SegmentNote = { segment: string; note: string; score: number };

export type ScoreOutput = {
  fluency: DimensionDetail;
  composure: DimensionDetail;
  eq: DimensionDetail;
  confidence: DimensionDetail;
  overall: number;
  englishLevel: string;
  passFailRecommendation: "Pass" | "Borderline" | "Auto_Flag_Reject";
  passFailReasoning: string;
  shortRationale: string;
  fullRationale: string;
  perSegmentNotes: SegmentNote[];
  methodologyVersion: string;
  // Token usage from the Claude scoring call (for the usage dashboard)
  claudeInputTokens: number;
  claudeOutputTokens: number;
};

function buildScoringPrompt(input: ScoreInput): string {
  const rubricJson = JSON.stringify(
    {
      rubricName: activeRubric.rubricName,
      version: activeRubric.version,
      weightedDimensions: activeRubric.weightedDimensions,
      passThreshold: activeRubric.passThreshold,
      autoFlagRejectThreshold: activeRubric.autoFlagRejectThreshold
    },
    null,
    2
  );

  const prosody =
    input.prosodyTimeline && input.prosodyTimeline.length > 0
      ? `\n\nPROSODY EMOTION TIMELINE (Hume voice-emotion scores, sampled per user turn). Use to corroborate composure and confidence ratings:\n${JSON.stringify(
          input.prosodyTimeline.slice(0, 80),
          null,
          2
        )}`
      : "";

  const face =
    input.faceTimeline && input.faceTimeline.length > 0
      ? `\n\nFACIAL EXPRESSION TIMELINE (${input.faceTimeline.length} samples from Hume face-expression scoring of the candidate's webcam during the call). Use to corroborate confidence and EQ ratings — look for steadiness vs flux across the timeline:\n${JSON.stringify(
          input.faceTimeline.slice(0, 60),
          null,
          2
        )}`
      : "\n\nFACIAL EXPRESSION TIMELINE: not available (camera not granted or no face detected). Confidence and EQ scoring must rely on transcript + prosody only.";

  return `You are scoring a 5-minute BPO Customer Service screening interview for Centro CDX. The candidate spoke with an AI interviewer named Maya. You must produce an EVIDENCE-DRIVEN, TRANSPARENT report that a recruiter and the candidate themselves could review.

RUBRIC (your scoring authority):
${rubricJson}

CANDIDATE: ${input.candidateName}

FULL TRANSCRIPT (lines prefixed CANDIDATE: or MAYA:):
${input.transcript}
${prosody}${face}

# SCORING INSTRUCTIONS

For each of the FOUR dimensions (fluency, composure, eq, confidence):
1. Decide the rubric level (1-5) by matching the candidate's behaviour to the level descriptors above.
2. Refine to a decimal score (0.00-5.00) — e.g. "strong 3, almost a 4" = 3.6.
3. Cite 1-3 SHORT direct quotes from the transcript that drove this score. Quotes must be VERBATIM substrings of CANDIDATE: lines. If no usable quote exists for that dimension (e.g. the session ended too early to assess role-play composure), say "Insufficient transcript data" and leave evidence empty.
4. Write a 2-3 sentence reasoning paragraph in plain English referencing the evidence.
5. Write one sentence on what specifically would have moved the score up one rubric level.

For OVERALL:
- Compute weighted average (handled by code afterward — you just give the per-dimension scores).
- Write a 2-3 sentence shortRationale (≤500 chars) suitable for the recruiter dashboard.
- Write a fullRationale paragraph (~400 words) synthesizing all dimensions, with clear narrative.
- Write a passFailReasoning sentence explaining the recommendation.

For PER-SEGMENT NOTES (Intro / Read_Aloud / Difficult_Customer / Role_Play / Schedule_Close):
- Score each segment 0-5 based on its specific demands.
- One sentence per segment explaining what happened.
- If a segment didn't occur (session ended early), score it 0 and note "Segment not reached".

# OUTPUT FORMAT

Return ONLY valid JSON in this exact shape, no surrounding prose, no markdown fences:

{
  "fluency": {
    "score": <number 0-5>,
    "rubricLevel": <integer 1-5>,
    "evidence": ["short verbatim candidate quote", "another quote"],
    "reasoning": "<2-3 sentences citing the evidence>",
    "toImprove": "<one sentence describing what would lift this one level>"
  },
  "composure":  { ... same shape ... },
  "eq":         { ... same shape ... },
  "confidence": { ... same shape ... },
  "shortRationale": "<≤500 chars, recruiter-facing>",
  "fullRationale": "<~400 word narrative synthesis>",
  "passFailReasoning": "<one sentence>",
  "perSegmentNotes": [
    {"segment": "Intro", "note": "...", "score": <number 0-5>},
    {"segment": "Read_Aloud", "note": "...", "score": <number 0-5>},
    {"segment": "Difficult_Customer", "note": "...", "score": <number 0-5>},
    {"segment": "Role_Play", "note": "...", "score": <number 0-5>},
    {"segment": "Schedule_Close", "note": "...", "score": <number 0-5>}
  ]
}

Critical: every quote in "evidence" must be a verbatim substring of a CANDIDATE: line in the transcript. Do not paraphrase, do not invent. If the transcript is too short to support a dimension, set score = 0, rubricLevel = 1, evidence = [], reasoning = "Insufficient transcript data — session ended before this dimension could be assessed.", toImprove = "Complete a full session to enable assessment."`;
}

export async function scoreScreening(input: ScoreInput): Promise<ScoreOutput> {
  const response = await client.messages.create({
    model: "claude-sonnet-4-6",
    max_tokens: 6000,
    messages: [{ role: "user", content: buildScoringPrompt(input) }]
  });

  const textBlock = response.content.find((b) => b.type === "text");
  if (!textBlock || textBlock.type !== "text") {
    throw new Error("Claude returned no text content");
  }

  const raw = textBlock.text
    .trim()
    .replace(/^```(?:json)?\s*/i, "")
    .replace(/\s*```$/i, "");

  const parsed = JSON.parse(raw) as {
    fluency: DimensionDetail;
    composure: DimensionDetail;
    eq: DimensionDetail;
    confidence: DimensionDetail;
    shortRationale: string;
    fullRationale: string;
    passFailReasoning: string;
    perSegmentNotes: SegmentNote[];
  };

  const overall = weightedOverall({
    fluency: parsed.fluency.score,
    composure: parsed.composure.score,
    eq: parsed.eq.score,
    confidence: parsed.confidence.score
  });
  const englishLevel = mapEnglishLevel(parsed.fluency.score);

  let passFailRecommendation: ScoreOutput["passFailRecommendation"];
  if (overall >= activeRubric.passThreshold) passFailRecommendation = "Pass";
  else if (overall <= activeRubric.autoFlagRejectThreshold)
    passFailRecommendation = "Auto_Flag_Reject";
  else passFailRecommendation = "Borderline";

  return {
    ...parsed,
    overall: Math.round(overall * 100) / 100,
    englishLevel,
    passFailRecommendation,
    methodologyVersion: `${activeRubric.rubricName} ${activeRubric.version}`,
    claudeInputTokens: response.usage?.input_tokens ?? 0,
    claudeOutputTokens: response.usage?.output_tokens ?? 0
  };
}
