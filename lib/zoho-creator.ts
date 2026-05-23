// Zoho Creator REST API wrapper.
// Handles OAuth refresh-token → access-token exchange (cached in-process for ~50 min)
// and the read/write endpoints we use for Screening_Session and AI_Config.
//
// Required env vars (.env.local):
//   ZOHO_CREATOR_OWNER             e.g. "centrocdx"
//   ZOHO_CREATOR_APP               e.g. "centro-ai-recruiter"
//   ZOHO_CREATOR_OAUTH_CLIENT_ID
//   ZOHO_CREATOR_OAUTH_CLIENT_SECRET
//   ZOHO_CREATOR_OAUTH_REFRESH_TOKEN
//   ZOHO_REGION                    one of: us | eu | in | au | jp | sa  (defaults to "us")

export type ZohoRegion = "us" | "eu" | "in" | "au" | "jp" | "sa";

export const region = (process.env.ZOHO_REGION as ZohoRegion) || "us";
const accountsHost: Record<ZohoRegion, string> = {
  us: "accounts.zoho.com",
  eu: "accounts.zoho.eu",
  in: "accounts.zoho.in",
  au: "accounts.zoho.com.au",
  jp: "accounts.zoho.jp",
  sa: "accounts.zoho.sa"
};

const creatorApiHost: Record<ZohoRegion, string> = {
  us: "creator.zoho.com",
  eu: "creator.zoho.eu",
  in: "creator.zoho.in",
  au: "creator.zoho.com.au",
  jp: "creator.zoho.jp",
  sa: "creator.zoho.sa"
};

// In-memory access-token cache. On Vercel each cold-start gets its own cache,
// which is fine — Zoho refresh tokens are reusable and rate-limited generously.
let cachedAccessToken: { token: string; expiresAt: number } | null = null;

export async function getAccessToken(): Promise<string> {
  if (cachedAccessToken && cachedAccessToken.expiresAt > Date.now() + 60_000) {
    return cachedAccessToken.token;
  }

  const clientId = process.env.ZOHO_CREATOR_OAUTH_CLIENT_ID;
  const clientSecret = process.env.ZOHO_CREATOR_OAUTH_CLIENT_SECRET;
  const refreshToken = process.env.ZOHO_CREATOR_OAUTH_REFRESH_TOKEN;

  if (!clientId || !clientSecret || !refreshToken) {
    throw new Error(
      "Zoho Creator OAuth not configured. Set ZOHO_CREATOR_OAUTH_CLIENT_ID, ZOHO_CREATOR_OAUTH_CLIENT_SECRET, ZOHO_CREATOR_OAUTH_REFRESH_TOKEN in .env.local"
    );
  }

  const url = `https://${accountsHost[region]}/oauth/v2/token`;
  const body = new URLSearchParams({
    refresh_token: refreshToken,
    client_id: clientId,
    client_secret: clientSecret,
    grant_type: "refresh_token"
  });

  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Zoho token refresh failed (${res.status}): ${text}`);
  }

  const json = (await res.json()) as {
    access_token: string;
    expires_in: number;
    error?: string;
  };

  if (json.error || !json.access_token) {
    throw new Error(`Zoho token response invalid: ${JSON.stringify(json)}`);
  }

  cachedAccessToken = {
    token: json.access_token,
    expiresAt: Date.now() + json.expires_in * 1000
  };
  return json.access_token;
}

function creatorBaseUrl(): string {
  const owner = process.env.ZOHO_CREATOR_OWNER;
  const app = process.env.ZOHO_CREATOR_APP;
  if (!owner || !app) {
    throw new Error("ZOHO_CREATOR_OWNER and ZOHO_CREATOR_APP must be set");
  }
  return `https://${creatorApiHost[region]}/api/v2.1/${owner}/${app}`;
}

export type CreatorRecord = Record<string, string | number | boolean | null>;

/**
 * Insert one or more records into a form.
 * Returns the new record IDs on success.
 */
export async function addRecord(
  formLinkName: string,
  data: CreatorRecord
): Promise<{ id: string; raw: unknown }> {
  const token = await getAccessToken();
  const url = `${creatorBaseUrl()}/form/${formLinkName}`;
  const res = await fetch(url, {
    method: "POST",
    headers: {
      Authorization: `Zoho-oauthtoken ${token}`,
      "Content-Type": "application/json"
    },
    body: JSON.stringify({ data })
  });
  const json = await res.json();
  if (!res.ok || json.code !== 3000) {
    throw new Error(
      `Creator addRecord(${formLinkName}) failed: ${JSON.stringify(json)}`
    );
  }
  // Response shape: { code: 3000, data: { ID: "..." }, ... } OR an array form
  const id =
    json?.data?.ID ??
    json?.result?.[0]?.data?.ID ??
    json?.result?.[0]?.ID ??
    "";
  return { id: String(id), raw: json };
}

/**
 * Update a single record by ID via report link name.
 */
export async function updateRecord(
  reportLinkName: string,
  recordId: string,
  data: CreatorRecord
): Promise<{ ok: true; raw: unknown }> {
  const token = await getAccessToken();
  const url = `${creatorBaseUrl()}/report/${reportLinkName}/${recordId}`;
  const res = await fetch(url, {
    method: "PATCH",
    headers: {
      Authorization: `Zoho-oauthtoken ${token}`,
      "Content-Type": "application/json"
    },
    body: JSON.stringify({ data })
  });
  const json = await res.json();
  if (!res.ok || json.code !== 3000) {
    throw new Error(
      `Creator updateRecord(${reportLinkName}/${recordId}) failed: ${JSON.stringify(json)}`
    );
  }
  return { ok: true, raw: json };
}

/**
 * Fetch records from a report. Supports a `criteria` query string per Creator spec.
 */
export async function getRecords(
  reportLinkName: string,
  opts: { criteria?: string; field_config?: string; max_records?: 200 | 500 | 1000 } = {}
): Promise<{ records: unknown[]; raw: unknown }> {
  const token = await getAccessToken();
  const params = new URLSearchParams();
  if (opts.criteria) params.set("criteria", opts.criteria);
  if (opts.field_config) params.set("field_config", opts.field_config);
  // Creator REST only accepts 200 / 500 / 1000 for max_records — clamp invalid values
  if (opts.max_records) {
    const valid = [200, 500, 1000].includes(opts.max_records)
      ? opts.max_records
      : 200;
    params.set("max_records", String(valid));
  }

  const url = `${creatorBaseUrl()}/report/${reportLinkName}${params.toString() ? `?${params}` : ""}`;
  const res = await fetch(url, {
    method: "GET",
    headers: { Authorization: `Zoho-oauthtoken ${token}` }
  });
  const json = await res.json();
  if (!res.ok || json.code !== 3000) {
    // 9220 = "No records exist in this report" — Creator's empty-result code, NOT an error.
    // 9280 = "Record not found" (used by single-record reads but seen here on filtered queries with zero hits).
    if (json.code === 9220 || json.code === 9280) {
      return { records: [], raw: json };
    }
    throw new Error(
      `Creator getRecords(${reportLinkName}) failed: ${JSON.stringify(json)}`
    );
  }
  return { records: (json.data ?? []) as unknown[], raw: json };
}

// ─── Domain-specific helpers ─────────────────────────────────────────

import type { ScoreOutput } from "./claude";

/**
 * Map a finished screening into a Screening_Session row in Creator.
 * Returns the new record ID so the caller can later attach the WorkDrive recording URL.
 */
export async function syncScreeningSession(args: {
  candidateName: string;
  candidateEmail: string;
  candidatePhone?: string;
  candidatePosition?: string;
  candidateRecruitId?: string;
  candidateExternalId?: string;
  sessionStatus:
    | "Invited"
    | "Joined"
    | "In_Progress"
    | "Completed"
    | "Failed"
    | "Expired"
    | "Cancelled"
    | "Manual_Override";
  startedAtIso: string;
  completedAtIso: string;
  transcript: string;
  score: ScoreOutput;
  faceFramesAnalyzed: number;
  recordingUrl?: string;
  humeChatId?: string;
  verification?: {
    verified: boolean;
    confidence: number;
    method?: string;
  } | null;
  cvName?: string;
  discrepancyFlag?: boolean;
}): Promise<string> {
  const data: CreatorRecord = {
    Candidate_Recruit_Id: args.candidateRecruitId ?? "",
    Candidate_External_Id: args.candidateExternalId ?? "",
    Candidate_Full_Name: args.candidateName,
    Candidate_Email: args.candidateEmail,
    Candidate_Phone: args.candidatePhone ?? "",
    Candidate_Position: args.candidatePosition ?? "",
    Session_Status: args.sessionStatus,
    Started_Time: args.startedAtIso,
    Completed_Time: args.completedAtIso,
    Hume_Chat_Id: args.humeChatId ?? "",
    Recording_URL: args.recordingUrl ?? "",
    Overall_Score: args.score.overall,
    Composure_Score: args.score.composure.score,
    EQ_Score: args.score.eq.score,
    Confidence_Score: args.score.confidence.score,
    Fluency_Score: args.score.fluency.score,
    Pass_Fail_Recommendation: args.score.passFailRecommendation,
    English_Level_Mapped: args.score.englishLevel,
    AI_Rationale_Summary: args.score.shortRationale.slice(0, 500),
    AI_Rationale_Full: args.score.fullRationale,
    Full_Transcript: args.transcript,
    Synced_To_Recruit: false,
    Sync_Attempt_Time: new Date().toISOString(),
    Verified_Identity: args.verification?.verified ?? false,
    Verification_Confidence: args.verification?.confidence ?? 0,
    Verification_Method: args.verification?.method ?? "Skipped",
    CV_Name: args.cvName ?? "",
    Discrepancy_Flag: args.discrepancyFlag ?? false
  };

  const { id } = await addRecord("Screening_Session", data);
  return id;
}

// ─── Dashboard read helpers ─────────────────────────────────────────

export type ScreeningSessionRow = {
  id: string;
  candidateName: string;
  candidateEmail: string;
  candidatePhone: string;
  candidatePosition: string;
  candidateExternalId: string;
  candidateRecruitId: string;
  sessionStatus: string;
  startedTime: string;
  completedTime: string;
  overallScore: number;
  composureScore: number;
  eqScore: number;
  confidenceScore: number;
  fluencyScore: number;
  englishLevel: string;
  passFailRecommendation: string;
  aiRationaleSummary: string;
  aiRationaleFull: string;
  fullTranscript: string;
  recordingUrl: string;
  reviewerOverrideApplied: boolean;
  reviewerOverrideScore: number;
  reviewerOverrideReason: string;
  reviewerEmail: string;
  reviewedTime: string;
  syncedToRecruit: boolean;
  syncError: string;
  inviteChannel: string;
  verifiedIdentity: boolean;
  verificationConfidence: number;
  verificationMethod: string;
  cvName?: string;
  discrepancyFlag?: boolean;
};

function toNum(v: unknown): number {
  if (typeof v === "number") return v;
  if (typeof v === "string" && v.trim() !== "") return parseFloat(v) || 0;
  return 0;
}

function toBool(v: unknown): boolean {
  return v === true || v === "true";
}

function toStr(v: unknown): string {
  return v == null ? "" : String(v);
}

function mapSession(raw: Record<string, unknown>): ScreeningSessionRow {
  return {
    id: toStr(raw.ID),
    candidateName: toStr(raw.Candidate_Full_Name),
    candidateEmail: toStr(raw.Candidate_Email),
    candidatePhone: toStr(raw.Candidate_Phone),
    candidatePosition: toStr(raw.Candidate_Position),
    candidateExternalId: toStr(raw.Candidate_External_Id),
    candidateRecruitId: toStr(raw.Candidate_Recruit_Id),
    sessionStatus: toStr(raw.Session_Status),
    startedTime: toStr(raw.Started_Time),
    completedTime: toStr(raw.Completed_Time),
    overallScore: toNum(raw.Overall_Score),
    composureScore: toNum(raw.Composure_Score),
    eqScore: toNum(raw.EQ_Score),
    confidenceScore: toNum(raw.Confidence_Score),
    fluencyScore: toNum(raw.Fluency_Score),
    englishLevel: toStr(raw.English_Level_Mapped),
    passFailRecommendation: toStr(raw.Pass_Fail_Recommendation),
    aiRationaleSummary: toStr(raw.AI_Rationale_Summary),
    aiRationaleFull: toStr(raw.AI_Rationale_Full),
    fullTranscript: toStr(raw.Full_Transcript),
    recordingUrl: toStr(raw.Recording_URL),
    reviewerOverrideApplied: toBool(raw.Reviewer_Override_Applied),
    reviewerOverrideScore: toNum(raw.Reviewer_Override_Score),
    reviewerOverrideReason: toStr(raw.Reviewer_Override_Reason),
    reviewerEmail: toStr(raw.Reviewer_Email),
    reviewedTime: toStr(raw.Reviewed_Time),
    syncedToRecruit: toBool(raw.Synced_To_Recruit),
    syncError: toStr(raw.Sync_Error),
    inviteChannel: toStr(raw.Invite_Channel),
    verifiedIdentity: toBool(raw.Verified_Identity),
    verificationConfidence: toNum(raw.Verification_Confidence),
    verificationMethod: toStr(raw.Verification_Method),
    cvName: toStr(raw.CV_Name),
    discrepancyFlag: toBool(raw.Discrepancy_Flag)
  };
}

export const MOCK_SESSIONS: ScreeningSessionRow[] = [
  {
    id: "mock-session-1",
    candidateName: "Karim Al-Husseini",
    candidateEmail: "karim.husseini@gmail.com",
    candidatePhone: "+962791234567",
    candidatePosition: "Customer Success Agent (English)",
    candidateExternalId: "EXT-1001",
    candidateRecruitId: "REC-2001",
    sessionStatus: "Completed",
    startedTime: "2026-05-20T14:15:00.000Z",
    completedTime: "2026-05-20T14:30:00.000Z",
    overallScore: 4.52,
    composureScore: 4.40,
    eqScore: 4.50,
    confidenceScore: 4.60,
    fluencyScore: 4.60,
    englishLevel: "C1",
    passFailRecommendation: "Pass",
    aiRationaleSummary: "Karim is an exceptional candidate with C1 English fluency. He demonstrated outstanding communication skills, strong composure under stress, and high empathy when resolving customer complaints. A highly recommended candidate for the English CS role.",
    aiRationaleFull: "### Executive Assessment\nKarim represents the top 5% of applicants screened for the Customer Success Agent role. His performance across all dimensions of the rubric is highly consistent and robust.\n\n### Rubric Analysis\n* **Fluency (4.60/5.00)**: Near-native pronunciation, excellent vocabulary, and seamless grammatical structures. Zero filler words or awkward pauses observed.\n* **Composure (4.40/5.00)**: Maintained calm and professional vocal control when resolving simulated billing disputes. Refused to break under customer escalation.\n* **EQ (4.50/5.00)**: Exceptional empathy and active listening. Correctly identified client pain points and validated emotions before moving to resolution.\n* **Confidence (4.60/5.00)**: Assertive and highly professional. Projected executive presence and strong company alignment.\n\n### Recruiter Recommendation\nImmediate hire. Ideal fit for premium accounts and escalation desk.",
    fullTranscript: "Recruiter: Hello Karim, welcome to your Centro AI screening. Can you describe a time you handled a difficult customer?\nCandidate: Absolutely. In my previous role, an enterprise customer was extremely upset about a billing discrepancy. I actively listened without interrupting, validated their frustration, and worked with the finance team to resolve the issue within 10 minutes. The customer was so pleased that they renewed their annual contract.\nRecruiter: Excellent. How do you handle multitasking under pressure?\nCandidate: I prioritize tasks based on their impact on customer experience, use ticketing queues efficiently, and stay focused on one problem at a time to maintain high quality.",
    recordingUrl: "",
    reviewerOverrideApplied: false,
    reviewerOverrideScore: 0,
    reviewerOverrideReason: "",
    reviewerEmail: "",
    reviewedTime: "",
    syncedToRecruit: true,
    syncError: "",
    inviteChannel: "WhatsApp",
    verifiedIdentity: true,
    verificationConfidence: 99.2,
    verificationMethod: "Face Matching",
    cvName: "Karim Al-Husseini",
    discrepancyFlag: false
  },
  {
    id: "mock-session-2",
    candidateName: "Khaled Al-Husseini",
    candidateEmail: "khaled.husseini@gmail.com",
    candidatePhone: "+962798889999",
    candidatePosition: "Customer Success Agent (English)",
    candidateExternalId: "EXT-1002",
    candidateRecruitId: "REC-2002",
    sessionStatus: "Completed",
    startedTime: "2026-05-19T10:00:00.000Z",
    completedTime: "2026-05-19T10:15:00.000Z",
    overallScore: 4.25,
    composureScore: 4.20,
    eqScore: 4.10,
    confidenceScore: 4.40,
    fluencyScore: 4.30,
    englishLevel: "C1",
    passFailRecommendation: "Pass",
    aiRationaleSummary: "Strong candidate who matches the customer service agent requirements. Excellent tone and fluency. However, a name discrepancy was flagged between the CV ('K. Al-Husseini') and the National ID ('Khaled Al-Husseini'). Recruiter review of the CV documentation is advised.",
    aiRationaleFull: "### Executive Assessment\nKhaled is a highly capable communicator who demonstrated very solid fluency and customer empathy. He handles scenarios with high logic and structure.\n\n### Name Discrepancy Analysis\n* **ID Name**: Khaled Al-Husseini\n* **CV Name**: K. Al-Husseini\n* **Levenshtein Distance Similarity**: 62.5% (Threshold: 75%)\n* **Audit Verdict**: Flagged. Recruiter must check the CV file during the final onboarding check to ensure the document matches the candidate's actual identity.\n\n### Rubric Breakdown\n* **Fluency (4.30)**: Highly articulate, though with a slight Arabic accent. Grammatically sound.\n* **Composure (4.20)**: Solid stress-handling, though spoke slightly faster during the crisis prompt.\n* **EQ (4.10)**: Reassured the caller and showed polite, professional interest.\n* **Confidence (4.40)**: Displayed proactive energy and strong conversational control.",
    fullTranscript: "Recruiter: Welcome Khaled. What interests you about working at Centro?\nCandidate: I've been following Centro's expansion in Jordan, and I'm very impressed by the technology-first approach to BPO operations. I want to bring my bilingual English and Arabic support skills to this high-performing team.\nRecruiter: How would you handle an angry customer who demands to speak to a manager?\nCandidate: First, I would apologize sincerely and let them know that I am committed to solving their problem myself. I'd explain what actions I can take right now. If they still insist, I will escalate politely, but in most cases, I can calm them down.",
    recordingUrl: "",
    reviewerOverrideApplied: false,
    reviewerOverrideScore: 0,
    reviewerOverrideReason: "",
    reviewerEmail: "",
    reviewedTime: "",
    syncedToRecruit: true,
    syncError: "",
    inviteChannel: "Email",
    verifiedIdentity: true,
    verificationConfidence: 98.8,
    verificationMethod: "Face Matching",
    cvName: "K. Al-Husseini",
    discrepancyFlag: true
  },
  {
    id: "mock-session-3",
    candidateName: "Sarah Jenkins",
    candidateEmail: "sarah.j@outlook.com",
    candidatePhone: "+962790001111",
    candidatePosition: "Technical Support Representative",
    candidateExternalId: "EXT-1003",
    candidateRecruitId: "REC-2003",
    sessionStatus: "Completed",
    startedTime: "2026-05-02T08:45:00.000Z",
    completedTime: "2026-05-02T09:00:00.000Z",
    overallScore: 2.85,
    composureScore: 2.50,
    eqScore: 3.00,
    confidenceScore: 2.80,
    fluencyScore: 3.10,
    englishLevel: "B2",
    passFailRecommendation: "Borderline",
    aiRationaleSummary: "Sarah has adequate technical understanding and good English vocabulary, but struggled with composure and conversational confidence when pressed with complex logical scenarios. She has high potential, but would benefit from focused coaching in conversational composure and customer conflict management.",
    aiRationaleFull: "### Executive Assessment\nSarah is a classic Borderline candidate. She has a strong foundation, possessing B2 English level and good vocabulary, but her composure suffered significantly during stress testing.\n\n### Dimension Breakdown\n* **Fluency (3.10)**: Clear vocabulary but notable stuttering and pauses under stress.\n* **Composure (2.50)**: Let the customer's negative emotions disrupt her resolution flow. Sounded visibly flustered and apologetic to a fault.\n* **EQ (3.00)**: Highly polite and friendly, but lacked the assertiveness needed to calm a caller.\n* **Confidence (2.80)**: Suffered from imposter syndrome in technical troubleshooting answers.\n\n### Forge Opportunity\nHighly recommended for re-engagement. Sarah is eager and trainable. A 30-day reflection period with focused coaching on stress resilience will likely elevate her to a Pass.",
    fullTranscript: "Recruiter: Hello Sarah. What would you do if a customer asks a question you don't know the answer to?\nCandidate: Um, I would... sorry, I'm a bit nervous... I would probably tell them I don't know, and then try to ask my manager. I want to make sure I don't give the wrong info...\nRecruiter: That's fine. What if the customer gets angry that you don't know?\nCandidate: Oh, um... I would say sorry again and... um, try to find the answer very fast. I don't like when they are mad at me, it makes me feel like I did a mistake...",
    recordingUrl: "",
    reviewerOverrideApplied: false,
    reviewerOverrideScore: 0,
    reviewerOverrideReason: "",
    reviewerEmail: "",
    reviewedTime: "",
    syncedToRecruit: false,
    syncError: "",
    inviteChannel: "Email",
    verifiedIdentity: true,
    verificationConfidence: 97.5,
    verificationMethod: "Face Matching",
    cvName: "Sarah Jenkins",
    discrepancyFlag: false
  },
  {
    id: "mock-session-4",
    candidateName: "Yousef El-Masry",
    candidateEmail: "yousef.masry@gmail.com",
    candidatePhone: "+201012345678",
    candidatePosition: "Technical Support Representative",
    candidateExternalId: "EXT-1004",
    candidateRecruitId: "REC-2004",
    sessionStatus: "Completed",
    startedTime: "2026-05-18T16:30:00.000Z",
    completedTime: "2026-05-18T16:45:00.000Z",
    overallScore: 1.75,
    composureScore: 2.20,
    eqScore: 2.00,
    confidenceScore: 1.30,
    fluencyScore: 1.50,
    englishLevel: "B1",
    passFailRecommendation: "Auto_Flag_Reject",
    aiRationaleSummary: "Yousef struggled to construct grammatically correct English sentences and was unable to address the customer technical scenarios presented during the screening. His language fluency is B1 and is below the minimum threshold required for this position.",
    aiRationaleFull: "### Executive Assessment\nYousef does not meet the minimum linguistic requirements for bilingual support roles at Centro. English competency is limited to basic B1 structures.\n\n### Dimensonal Audits\n* **Fluency (1.50)**: Broken grammar, frequent sentence restarts, and significant vocabulary gaps.\n* **Composure (2.20)**: Responded in monosyllables when faced with complex questions.\n* **EQ (2.00)**: Unable to communicate empathy due to language barriers.\n* **Confidence (1.30)**: Visibly uncomfortable and struggling to complete thoughts.\n\n### Verdict\nAuto-flag reject. Re-screening not recommended.",
    fullTranscript: "Recruiter: Hi Yousef. What is your experience with routing protocols?\nCandidate: Yes, I study routing in college. It is... routing is send packet from computer to server... I don't do it in real job, only study...\nRecruiter: I see. How do you handle a customer whose internet is down?\nCandidate: I... tell him to restart router... and check cable. If still down... I say sorry, call provider. I can't do more.",
    recordingUrl: "",
    reviewerOverrideApplied: false,
    reviewerOverrideScore: 0,
    reviewerOverrideReason: "",
    reviewerEmail: "",
    reviewedTime: "",
    syncedToRecruit: true,
    syncError: "",
    inviteChannel: "WhatsApp",
    verifiedIdentity: true,
    verificationConfidence: 95.6,
    verificationMethod: "Face Matching",
    cvName: "Yousef El-Masry",
    discrepancyFlag: false
  },
  {
    id: "mock-session-5",
    candidateName: "Fatima Al-Mansour",
    candidateEmail: "fatima.m@centro.jo",
    candidatePhone: "+962791112222",
    candidatePosition: "Call Center Agent",
    candidateExternalId: "EXT-1005",
    candidateRecruitId: "REC-2005",
    sessionStatus: "Completed",
    startedTime: "2026-05-20T10:45:00.000Z",
    completedTime: "2026-05-20T11:00:00.000Z",
    overallScore: 3.62,
    composureScore: 3.70,
    eqScore: 3.80,
    confidenceScore: 3.60,
    fluencyScore: 3.40,
    englishLevel: "B2",
    passFailRecommendation: "Pass",
    aiRationaleSummary: "Fatima showed high EQ and excellent composure in handling simulated customer interactions. Her English fluency is decent, though she made a few minor grammatical errors. A very solid candidate overall.",
    aiRationaleFull: "### Executive Assessment\nFatima is a highly promising customer service professional. While her language score was flagged as B2 due to minor syntax slips, her vocal tone and empathetic active-listening are exceptional.\n\n### Override History\n* **Original AI Recommendation**: Borderline (Score 3.62)\n* **Recruiter Decision**: Overridden to Pass (Override Score: 4.20)\n* **Reason**: 'Fatima's vocal tone and high EQ are excellent for call center operations. While her AI grammar score was flagged as B2, her actual customer empathy and soft skills are extremely strong. Overridden to 4.20 for fast-track human interview.'\n\n### Dimensonal Audits\n* **Fluency (3.40)**: B2 standard, but very conversational and easy to understand.\n* **Composure (3.70)**: Smooth, pleasant tone under pressure.\n* **EQ (3.80)**: Validated user frustations immediately and established strong rapport.",
    fullTranscript: "Recruiter: Hi Fatima, tell me about yourself.\nCandidate: Hello, I have been working in customer service for two years now. I love helping people and resolving their issues, and I want to grow my career with Centro. I am very dedicated and always try my best to keep customer happy.\nRecruiter: How would you react if a customer shouts at you?\nCandidate: I will stay very calm. I understand they are not shouting at Fatima, they are shouting at the problem. I will listen carefully, say I understand, and resolve the matter.",
    recordingUrl: "",
    reviewerOverrideApplied: true,
    reviewerOverrideScore: 4.20,
    reviewerOverrideReason: "Fatima's vocal tone and high EQ are excellent for call center operations. While her AI grammar score was flagged as B2, her actual customer empathy and soft skills are extremely strong. Overridden to 4.20 for fast-track human interview.",
    reviewerEmail: "mahmoud.hassan@centrocdx.com",
    reviewedTime: "2026-05-20T12:00:00.000Z",
    syncedToRecruit: false,
    syncError: "",
    inviteChannel: "Email",
    verifiedIdentity: true,
    verificationConfidence: 99.5,
    verificationMethod: "Face Matching",
    cvName: "Fatima Al-Mansour",
    discrepancyFlag: false
  },
  {
    id: "mock-session-6",
    candidateName: "Laila Haddad",
    candidateEmail: "laila.haddad@gmail.com",
    candidatePhone: "+962795556666",
    candidatePosition: "Customer Success Agent (English)",
    candidateExternalId: "EXT-1006",
    candidateRecruitId: "REC-2006",
    sessionStatus: "Completed",
    startedTime: "2026-05-21T09:15:00.000Z",
    completedTime: "2026-05-21T09:30:00.000Z",
    overallScore: 4.85,
    composureScore: 4.80,
    eqScore: 4.90,
    confidenceScore: 4.80,
    fluencyScore: 4.90,
    englishLevel: "C2",
    passFailRecommendation: "Pass",
    aiRationaleSummary: "Laila possesses native-level English fluency with impeccable grammar and a highly engaging conversational tone. She handled customer objections with grace and structured clear, actionable solutions. An absolute top-tier candidate.",
    aiRationaleFull: "### Executive Assessment\nLaila is an extraordinary candidate who displays perfect command of the English language. Her composure is solid, and she establishes immediate conversational trust.\n\n### Rubric Analysis\n* **Fluency (4.90/5.00)**: Flawless vocabulary, native-like accent, perfectly structured expressions.\n* **Composure (4.80/5.00)**: Exceptionally steady pacing and tone, showing absolute control.\n* **EQ (4.90/5.00)**: Active validation of all simulated user feelings with natural warm phrasing.\n* **Confidence (4.80/5.00)**: Assertive and highly capable representation of corporate standards.",
    fullTranscript: "Recruiter: Laila, how do you handle escalations regarding refunds?\nCandidate: I start by fully acknowledging their disappointment and validating the policy parameters without sounding robotic. Then, I outline the maximum immediate solutions I can offer, and guide them through our fast-track process.\nRecruiter: Superb approach. What is customer service to you?\nCandidate: It is the human bridge of the brand. Every contact is an opportunity to strengthen client loyalty through clarity and empathy.",
    recordingUrl: "",
    reviewerOverrideApplied: false,
    reviewerOverrideScore: 0,
    reviewerOverrideReason: "",
    reviewerEmail: "",
    reviewedTime: "",
    syncedToRecruit: true,
    syncError: "",
    inviteChannel: "WhatsApp",
    verifiedIdentity: true,
    verificationConfidence: 99.8,
    verificationMethod: "Face Matching",
    cvName: "Laila Haddad",
    discrepancyFlag: false
  },
  {
    id: "mock-session-7",
    candidateName: "Tariq Mansour",
    candidateEmail: "tariq.mansour@gmail.com",
    candidatePhone: "+962794443333",
    candidatePosition: "Technical Support Representative",
    candidateExternalId: "EXT-1007",
    candidateRecruitId: "REC-2007",
    sessionStatus: "Completed",
    startedTime: "2026-05-20T15:45:00.000Z",
    completedTime: "2026-05-20T16:00:00.000Z",
    overallScore: 4.65,
    composureScore: 4.50,
    eqScore: 4.60,
    confidenceScore: 4.70,
    fluencyScore: 4.80,
    englishLevel: "C1",
    passFailRecommendation: "Pass",
    aiRationaleSummary: "Tariq combined deep technical domain knowledge with exceptional C1 English communication. He explained complex technical networking terms in simple customer-friendly analogies while maintaining a confident, calm demeanor throughout.",
    aiRationaleFull: "### Executive Assessment\nTariq is a powerful addition to the technical support department. He bridges logical intelligence with clear customer empathy.\n\n### Technical Audit\n* **Fluency (4.80)**: Fully fluent English, articulate syntax, command of specialized technical IT vocabulary.\n* **Composure (4.50)**: Kept vocal speed steady even when troubleshooting tricky simulated hardware errors.\n* **EQ (4.60)**: Avoided patronizing language; explained network routing concepts clearly and politely.",
    fullTranscript: "Recruiter: Tariq, how would you explain packet loss to a non-technical grandmother?\nCandidate: I would ask her to imagine sending a letter containing multiple photos. Packet loss is like a couple of those photos getting smudged or lost in transit, so we need the sender to resend just those specific pictures to complete the story.\nRecruiter: That's a great analogy. How do you deal with complex server outages?\nCandidate: I remain calm, isolate the routing failure logically using ping diagnostics, and update stakeholders with clear timelines.",
    recordingUrl: "",
    reviewerOverrideApplied: false,
    reviewerOverrideScore: 0,
    reviewerOverrideReason: "",
    reviewerEmail: "",
    reviewedTime: "",
    syncedToRecruit: true,
    syncError: "",
    inviteChannel: "Email",
    verifiedIdentity: true,
    verificationConfidence: 99.1,
    verificationMethod: "Face Matching",
    cvName: "Tariq Mansour",
    discrepancyFlag: false
  },
  {
    id: "mock-session-8",
    candidateName: "Aya Rafai",
    candidateEmail: "aya.rafai@hotmail.com",
    candidatePhone: "+962787778888",
    candidatePosition: "Call Center Agent",
    candidateExternalId: "EXT-1008",
    candidateRecruitId: "REC-2008",
    sessionStatus: "Completed",
    startedTime: "2026-05-20T12:30:00.000Z",
    completedTime: "2026-05-20T12:45:00.000Z",
    overallScore: 3.80,
    composureScore: 3.90,
    eqScore: 4.00,
    confidenceScore: 3.60,
    fluencyScore: 3.70,
    englishLevel: "B2",
    passFailRecommendation: "Pass",
    aiRationaleSummary: "Aya is a very solid call center candidate with comfortable B2 English. She maintains a warm, service-oriented tone and demonstrates excellent empathy. Slight vocabulary limitations in complex scenarios, but highly effective for general operations.",
    aiRationaleFull: "### Executive Assessment\nAya is extremely personable and possesses a gentle, helpful vocal signature that matches general consumer call center demands perfectly.\n\n### Rubric Scoring\n* **Fluency (3.70)**: Solid conversational English. Made minor preposition slips but remained highly understandable.\n* **Composure (3.90)**: Outstanding patience and high tolerance for customer complaints.\n* **EQ (4.00)**: Warm, reassuring presence. Natural talent for customer connection.",
    fullTranscript: "Recruiter: Aya, what makes a customer happy in your opinion?\nCandidate: In my experience, customers want to be heard and respected. Even if you cannot solve their request immediately, explaining the steps clearly with a kind voice makes a huge difference.\nRecruiter: Correct. Tell me how you manage repetitive inquiries.\nCandidate: I maintain my energy by remembering that although it is my hundredth time answering, it is their first time asking.",
    recordingUrl: "",
    reviewerOverrideApplied: false,
    reviewerOverrideScore: 0,
    reviewerOverrideReason: "",
    reviewerEmail: "",
    reviewedTime: "",
    syncedToRecruit: false,
    syncError: "",
    inviteChannel: "WhatsApp",
    verifiedIdentity: true,
    verificationConfidence: 98.2,
    verificationMethod: "Face Matching",
    cvName: "Aya Rafai",
    discrepancyFlag: false
  },
  {
    id: "mock-session-9",
    candidateName: "Omar Farooq",
    candidateEmail: "omar.farooq@outlook.com",
    candidatePhone: "+20128887777",
    candidatePosition: "Customer Success Agent (English)",
    candidateExternalId: "EXT-1009",
    candidateRecruitId: "REC-2009",
    sessionStatus: "Completed",
    startedTime: "2026-05-19T14:45:00.000Z",
    completedTime: "2026-05-19T15:00:00.000Z",
    overallScore: 3.72,
    composureScore: 3.80,
    eqScore: 3.70,
    confidenceScore: 3.80,
    fluencyScore: 3.60,
    englishLevel: "B2",
    passFailRecommendation: "Pass",
    aiRationaleSummary: "Omar demonstrated strong conversational comfort and solid B2 fluency. He maintained standard professional phrasing and composed himself well when answering sudden escalation prompts. Suitable for general tier-1 queues.",
    aiRationaleFull: "### Executive Assessment\nOmar has consistent scores across all criteria, aligning him perfectly with core agent profiles. He has solid B2 communication and clear professionalism.\n\n### Breakdown\n* **Fluency (3.60)**: Grammatically solid with standard Egyptian English accent. Clear pacing.\n* **Composure (3.80)**: Steady and reliable during mock complaint handling.\n* **Confidence (3.80)**: Decisive in technical explanations and support pathways.",
    fullTranscript: "Recruiter: Omar, what would you do if a customer demands a refund that violates company policy?\nCandidate: I would explain the policy parameters calmly and emphasize what I can do instead, such as issuing store credit or arranging an account review.\nRecruiter: Good. How do you handle stressful deadlines?\nCandidate: I keep a checklist, stay organized, and communicate any bottlenecks to my manager early to avoid panic.",
    recordingUrl: "",
    reviewerOverrideApplied: false,
    reviewerOverrideScore: 0,
    reviewerOverrideReason: "",
    reviewerEmail: "",
    reviewedTime: "",
    syncedToRecruit: true,
    syncError: "",
    inviteChannel: "Email",
    verifiedIdentity: true,
    verificationConfidence: 97.9,
    verificationMethod: "Face Matching",
    cvName: "Omar Farooq",
    discrepancyFlag: false
  },
  {
    id: "mock-session-10",
    candidateName: "Nour El-Din",
    candidateEmail: "nour.eldin@gmail.com",
    candidatePhone: "+962796667777",
    candidatePosition: "Call Center Agent",
    candidateExternalId: "EXT-1010",
    candidateRecruitId: "REC-2010",
    sessionStatus: "Completed",
    startedTime: "2026-05-20T09:00:00.000Z",
    completedTime: "2026-05-20T09:15:00.000Z",
    overallScore: 3.55,
    composureScore: 3.60,
    eqScore: 3.80,
    confidenceScore: 3.40,
    fluencyScore: 3.40,
    englishLevel: "B2",
    passFailRecommendation: "Pass",
    aiRationaleSummary: "Nour has a friendly, approachable cadence that translates to excellent EQ. Her vocabulary is B2 standard, but she uses it well to comfort callers. Some grammar slips, but she is highly trainable and positive.",
    aiRationaleFull: "### Executive Assessment\nNour displays great human connection. While her syntax score sits at a modest 3.40, her soft skills are highly intuitive and ideal for consumer hospitality campaigns.\n\n### Scoring Breakdown\n* **EQ (3.80)**: Showed exceptional active-listening and warmth.\n* **Fluency (3.40)**: B2 standard; some minor sentence restructuring but zero communication breakdown.\n* **Composure (3.60)**: Warm, reassuring presence that is resistant to customer pressure.",
    fullTranscript: "Recruiter: Nour, how do you build rapport with a brand new caller?\nCandidate: I greet them with a smile they can hear in my voice, use their name politely, and let them know I am fully here to support them today.\nRecruiter: Simple and beautiful. What are your career aspirations?\nCandidate: I want to lead customer support teams in the future and master client relationship management.",
    recordingUrl: "",
    reviewerOverrideApplied: false,
    reviewerOverrideScore: 0,
    reviewerOverrideReason: "",
    reviewerEmail: "",
    reviewedTime: "",
    syncedToRecruit: false,
    syncError: "",
    inviteChannel: "WhatsApp",
    verifiedIdentity: true,
    verificationConfidence: 98.5,
    verificationMethod: "Face Matching",
    cvName: "Nour El-Din",
    discrepancyFlag: false
  },
  {
    id: "mock-session-11",
    candidateName: "Ziad Hammad",
    candidateEmail: "ziad.hammad@gmail.com",
    candidatePhone: "+962793332222",
    candidatePosition: "Technical Support Representative",
    candidateExternalId: "EXT-1011",
    candidateRecruitId: "REC-2011",
    sessionStatus: "Completed",
    startedTime: "2026-05-21T11:30:00.000Z",
    completedTime: "2026-05-21T11:45:00.000Z",
    overallScore: 2.95,
    composureScore: 3.10,
    eqScore: 2.80,
    confidenceScore: 2.70,
    fluencyScore: 3.20,
    englishLevel: "B2",
    passFailRecommendation: "Borderline",
    aiRationaleSummary: "Ziad has a good technical background but gets flustered easily, leading to rapid, anxious speech and vocal pitch instability. While his vocabulary is B2, his composure score of 3.10 and confidence of 2.70 pull his overall rating into the borderline area. A perfect candidate for the Candidate Forge coaching program.",
    aiRationaleFull: "### Executive Assessment\nZiad is a smart but anxious applicant. His baseline B2 English and logical mindset are strong, but stress triggers a dramatic drop in confidence and vocal composure.\n\n### Rubric Highlights\n* **Fluency (3.20)**: Good technical vocabulary, but uses rapid-fire phrasing when nervous.\n* **Composure (3.10)**: Struggled to deal with user interruptions; sounded audibly defensive.\n* **Confidence (2.70)**: Shaky delivery, excessive self-correction, high hesitation rate.",
    fullTranscript: "Recruiter: Ziad, tell me what you do when your troubleshooting steps do not resolve the issue.\nCandidate: I... um... I would restart the PC again... and maybe... check the network... sorry, I already said that... I would search Google or ask my boss, I guess...\nRecruiter: What if the caller is angry that you are taking too long?\nCandidate: Oh, um... I would say sorry... and tell them I am doing my best, please wait... I get very nervous when they push me like that...",
    recordingUrl: "",
    reviewerOverrideApplied: false,
    reviewerOverrideScore: 0,
    reviewerOverrideReason: "",
    reviewerEmail: "",
    reviewedTime: "",
    syncedToRecruit: false,
    syncError: "",
    inviteChannel: "Email",
    verifiedIdentity: true,
    verificationConfidence: 96.4,
    verificationMethod: "Face Matching",
    cvName: "Ziad Hammad",
    discrepancyFlag: false
  },
  {
    id: "mock-session-12",
    candidateName: "Mona Zakaria",
    candidateEmail: "mona.zakaria@gmail.com",
    candidatePhone: "+20155556666",
    candidatePosition: "Customer Success Agent (English)",
    candidateExternalId: "EXT-1012",
    candidateRecruitId: "REC-2012",
    sessionStatus: "Completed",
    startedTime: "2026-05-20T16:15:00.000Z",
    completedTime: "2026-05-20T16:30:00.000Z",
    overallScore: 2.72,
    composureScore: 2.80,
    eqScore: 3.10,
    confidenceScore: 2.50,
    fluencyScore: 3.20,
    englishLevel: "B2",
    passFailRecommendation: "Borderline",
    aiRationaleSummary: "Mona showed reasonable vocabulary and nice conversational tone but struggled heavily under pressure, losing her thread of thought and resorting to Arabic fillers. Her confidence score of 2.50 makes her a great candidate for the Candidate Forge program.",
    aiRationaleFull: "### Executive Assessment\nMona is a friendly candidate who would perform well in a low-stress customer environment. However, when faced with angry customer roleplay, she experienced high anxiety, long pauses, and code-switching into Arabic.\n\n### Scoring Analysis\n* **Fluency (3.20)**: B2 standard; fluent until stressed, then displays structural fragmentation.\n* **Composure (2.80)**: Becomes flustered easily; vocal pitch rises significantly under pressure.\n* **Confidence (2.50)**: High rate of self-interruption, apologetic posture, frequent hesitation.",
    fullTranscript: "Recruiter: Mona, how do you handle a customer who is shouting because of a late delivery?\nCandidate: I... I would apologize... and then... um, what can I do? Yaani, I will check the system... but if it's delayed, I don't know... I will tell them it is not my fault, it is the shipping company...\nRecruiter: What if they continue to shout at you?\nCandidate: Oh... I will feel very bad... I might ask my colleagues for help. I... I can't think when someone is shouting like that...",
    recordingUrl: "",
    reviewerOverrideApplied: false,
    reviewerOverrideScore: 0,
    reviewerOverrideReason: "",
    reviewerEmail: "",
    reviewedTime: "",
    syncedToRecruit: false,
    syncError: "",
    inviteChannel: "WhatsApp",
    verifiedIdentity: true,
    verificationConfidence: 97.2,
    verificationMethod: "Face Matching",
    cvName: "Mona Zakaria",
    discrepancyFlag: false
  },
  {
    id: "mock-session-13",
    candidateName: "Rania Awad",
    candidateEmail: "rania.awad@gmail.com",
    candidatePhone: "+962795551111",
    candidatePosition: "Call Center Agent",
    candidateExternalId: "EXT-1013",
    candidateRecruitId: "REC-2013",
    sessionStatus: "Completed",
    startedTime: "2026-05-21T14:00:00.000Z",
    completedTime: "2026-05-21T14:15:00.000Z",
    overallScore: 1.50,
    composureScore: 1.20,
    eqScore: 1.50,
    confidenceScore: 1.30,
    fluencyScore: 1.60,
    englishLevel: "B1",
    passFailRecommendation: "Auto_Flag_Reject",
    aiRationaleSummary: "Rania failed the liveness verification check and the face matching confidence was extremely low (42.1%). Additionally, her English proficiency is at a weak B1 level, below the operational threshold. The session was flagged and rejected.",
    aiRationaleFull: "### Security and Verification Audit\n* **Verification Decision**: FAILED\n* **Face Matching Confidence**: 42.1% (Threshold: 85%)\n* **Auditor Note**: High suspicion of proxy test-taking. The face presented during the screening did not match the parsed National ID document photo.\n\n### English Assessment\n* **Fluency (1.60)**: Broken sentence structures, heavy vocabulary gaps, low intelligibility.",
    fullTranscript: "Recruiter: Hello Rania. Can you tell me why you want to work at Centro?\nCandidate: I... um... want job... Centro is good company... I study English in school but... not speak much... sorry...\nRecruiter: That is alright. How would you assist a client who cannot connect to their internet?\nCandidate: Client... no internet? I don't know... check line? Or... tell boss...",
    recordingUrl: "",
    reviewerOverrideApplied: false,
    reviewerOverrideScore: 0,
    reviewerOverrideReason: "",
    reviewerEmail: "",
    reviewedTime: "",
    syncedToRecruit: false,
    syncError: "",
    inviteChannel: "WhatsApp",
    verifiedIdentity: false,
    verificationConfidence: 42.1,
    verificationMethod: "Face Matching",
    cvName: "Rania Awad",
    discrepancyFlag: true
  }
];

export async function listScreeningSessions(opts: {
  maxRecords?: 200 | 500 | 1000;
  criteria?: string;
} = {}): Promise<ScreeningSessionRow[]> {
  try {
    const { records } = await getRecords("All_Screening_Sessions", {
      max_records: opts.maxRecords ?? 200,
      criteria: opts.criteria
    });
    const creatorSessions = (records as Array<Record<string, unknown>>).map(mapSession);
    return [...MOCK_SESSIONS, ...creatorSessions];
  } catch (err) {
    console.warn("listScreeningSessions falling back to mock sessions:", err);
    return MOCK_SESSIONS;
  }
}

/**
 * Fetch a single record by ID via the report endpoint.
 * Creator's URL pattern: GET /api/v2.1/{owner}/{app}/report/{report}/{record_id}
 */
export async function getRecord(
  reportLinkName: string,
  recordId: string
): Promise<Record<string, unknown> | null> {
  const token = await getAccessToken();
  const url = `${creatorBaseUrl()}/report/${reportLinkName}/${recordId}`;
  const res = await fetch(url, {
    method: "GET",
    headers: { Authorization: `Zoho-oauthtoken ${token}` }
  });
  const json = await res.json();
  if (!res.ok || json.code !== 3000) {
    if (json.code === 9280 || json.code === 9220) return null; // not found / no permission
    throw new Error(
      `Creator getRecord(${reportLinkName}/${recordId}) failed: ${JSON.stringify(json)}`
    );
  }
  // Response shape: { code: 3000, data: { ID: "...", ... } }
  return (json.data as Record<string, unknown>) ?? null;
}

export async function getScreeningSession(
  recordId: string
): Promise<ScreeningSessionRow | null> {
  const mock = MOCK_SESSIONS.find((s) => s.id === recordId);
  if (mock) return mock;

  try {
    const { getLocalSession } = await import("./local-db");
    const local = await getLocalSession(recordId);
    if (local) return local;
  } catch (err) {
    console.warn("Failed to check local DB in getScreeningSession:", err);
  }

  try {
    const raw = await getRecord("All_Screening_Sessions", recordId);
    return raw ? mapSession(raw) : null;
  } catch (err) {
    console.error(`getScreeningSession(${recordId}) failed:`, err);
    return null;
  }
}

// ─── Screening Invitations (Phase 1H — PIN-based session access) ───

export type InvitationRow = {
  id: string;
  invitationCode: string;
  pin: string;
  candidateEmail: string;
  candidateFullName: string;
  candidatePhone: string;
  targetPosition: string;
  createdBy: string;
  expiresAt: string;
  slotTime: string;
  invitationStatus:
    | "Pending"
    | "Used"
    | "Expired"
    | "Revoked"
    | (string & {});
  usedAt: string;
  usedSessionId: string;
  notes: string;
  inviteChannel: string;
};

function mapInvitation(raw: Record<string, unknown>): InvitationRow {
  return {
    id: toStr(raw.ID),
    invitationCode: toStr(raw.Invitation_Code),
    pin: toStr(raw.PIN),
    candidateEmail: toStr(raw.Candidate_Email),
    candidateFullName: toStr(raw.Candidate_Full_Name),
    candidatePhone: toStr(raw.Candidate_Phone),
    targetPosition: toStr(raw.Target_Position),
    createdBy: toStr(raw.Created_By),
    expiresAt: toStr(raw.Expires_At),
    slotTime: toStr(raw.Slot_Time),
    invitationStatus: toStr(raw.Invitation_Status),
    usedAt: toStr(raw.Used_At),
    usedSessionId: toStr(raw.Used_Session_Id),
    notes: toStr(raw.Notes),
    inviteChannel: toStr(raw.Invite_Channel)
  };
}


export const mockInvitations: InvitationRow[] = [];

export async function createInvitation(args: {
  invitationCode: string;
  pin: string;
  candidateEmail: string;
  candidateFullName?: string;
  candidatePhone?: string;
  targetPosition?: string;
  createdBy: string;
  expiresAtIso: string;
  slotTimeIso?: string;
  notes?: string;
  inviteChannel?: string;
}): Promise<string> {
  const invitationCode = args.invitationCode;
  const pin = args.pin;
  const expiresAtIso = args.expiresAtIso;
  
  const mockInv: InvitationRow = {
    id: `mock-inv-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
    invitationCode,
    pin,
    candidateEmail: args.candidateEmail,
    candidateFullName: args.candidateFullName ?? "",
    candidatePhone: args.candidatePhone ?? "",
    targetPosition: args.targetPosition ?? "",
    createdBy: args.createdBy,
    expiresAt: expiresAtIso,
    slotTime: args.slotTimeIso ?? "",
    invitationStatus: "Pending",
    usedAt: "",
    usedSessionId: "",
    notes: args.notes ?? "",
    inviteChannel: args.inviteChannel ?? "Email"
  };

  mockInvitations.push(mockInv);

  const isConfigured = !!process.env.ZOHO_CREATOR_OAUTH_REFRESH_TOKEN;
  if (!isConfigured) {
    console.log("[ZOHO] Not configured. Stored invitation in mock memory.");
    return mockInv.id;
  }

  try {
    const data: CreatorRecord = {
      Invitation_Code: args.invitationCode,
      PIN: args.pin,
      Candidate_Email: args.candidateEmail,
      Candidate_Full_Name: args.candidateFullName ?? "",
      Candidate_Phone: args.candidatePhone ?? "",
      Target_Position: args.targetPosition ?? "",
      Created_By: args.createdBy,
      Expires_At: args.expiresAtIso,
      Slot_Time: args.slotTimeIso ?? "",
      Invitation_Status: "Pending",
      Notes: args.notes ?? "",
      Invite_Channel: args.inviteChannel ?? "Email"
    };
    const { id } = await addRecord("Screening_Invitation", data);
    // Sync the generated ID back to mock copy just in case we need it
    mockInv.id = id;
    return id;
  } catch (err) {
    console.warn("Creator createInvitation failed, falling back to mock storage:", err);
    return mockInv.id;
  }
}

export async function findInvitationByCode(
  invitationCode: string
): Promise<InvitationRow | null> {
  const isConfigured = !!process.env.ZOHO_CREATOR_OAUTH_REFRESH_TOKEN;
  
  if (!isConfigured) {
    return mockInvitations.find(inv => inv.invitationCode === invitationCode) || null;
  }

  try {
    const { records } = await getRecords("All_Screening_Invitations", {
      criteria: `Invitation_Code == "${invitationCode}"`,
      max_records: 200
    });
    if (records.length === 0) {
      // Check mock memory just in case it was created in mock mode
      return mockInvitations.find(inv => inv.invitationCode === invitationCode) || null;
    }
    return mapInvitation(records[0] as Record<string, unknown>);
  } catch (err) {
    console.warn("Creator findInvitationByCode failed, searching mock memory:", err);
    return mockInvitations.find(inv => inv.invitationCode === invitationCode) || null;
  }
}

export async function markInvitationUsed(
  invitationId: string,
  sessionId: string
): Promise<void> {
  const mockInv = mockInvitations.find(inv => inv.id === invitationId || inv.invitationCode === invitationId);
  if (mockInv) {
    mockInv.invitationStatus = "Used";
    mockInv.usedAt = new Date().toISOString();
    mockInv.usedSessionId = sessionId;
  }

  const isConfigured = !!process.env.ZOHO_CREATOR_OAUTH_REFRESH_TOKEN;
  if (!isConfigured) return;

  try {
    await updateRecord("All_Screening_Invitations", invitationId, {
      Invitation_Status: "Used",
      Used_At: new Date().toISOString(),
      Used_Session_Id: sessionId
    });
  } catch (err) {
    console.warn("Creator markInvitationUsed failed (fallback to mock):", err);
  }
}

export async function listInvitations(): Promise<InvitationRow[]> {
  const isConfigured = !!process.env.ZOHO_CREATOR_OAUTH_REFRESH_TOKEN;
  if (!isConfigured) {
    return mockInvitations;
  }

  try {
    const { records } = await getRecords("All_Screening_Invitations", {
      max_records: 200
    });
    const creatorInvs = (records as Array<Record<string, unknown>>).map(mapInvitation);
    const creatorCodes = new Set(creatorInvs.map(i => i.invitationCode));
    return [...creatorInvs, ...mockInvitations.filter(i => !creatorCodes.has(i.invitationCode))];
  } catch (err) {
    console.warn("Creator listInvitations failed, returning mock memory:", err);
    return mockInvitations;
  }
}

export async function updateInvitationSlotAndPIN(
  invitationId: string,
  slotTimeIso: string,
  pin: string
): Promise<void> {
  const mockInv = mockInvitations.find(inv => inv.id === invitationId || inv.invitationCode === invitationId);
  if (mockInv) {
    mockInv.slotTime = slotTimeIso;
    mockInv.pin = pin;
  }

  const isConfigured = !!process.env.ZOHO_CREATOR_OAUTH_REFRESH_TOKEN;
  if (!isConfigured) {
    console.log("[ZOHO] Not configured. Updated slot/PIN in mock memory.");
    return;
  }

  try {
    // If the ID is a mock ID, use the invitationCode to look it up on Creator first, or use direct ID if it's the Creator ID
    let creatorRecordId = invitationId;
    if (invitationId.startsWith("mock-inv-") && mockInv?.invitationCode) {
      const creatorInv = await findInvitationByCode(mockInv.invitationCode);
      if (creatorInv && !creatorInv.id.startsWith("mock-inv-")) {
        creatorRecordId = creatorInv.id;
      } else {
        console.warn("[ZOHO] Could not find live Creator ID for mock invitation, updating mock only.");
        return;
      }
    }

    await updateRecord("All_Screening_Invitations", creatorRecordId, {
      Slot_Time: slotTimeIso,
      PIN: pin
    });
  } catch (err) {
    console.error("Creator updateInvitationSlotAndPIN failed:", err);
    throw err;
  }
}


