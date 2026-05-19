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
    Verification_Method: args.verification?.method ?? "Skipped"
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
    verificationMethod: toStr(raw.Verification_Method)
  };
}

export async function listScreeningSessions(opts: {
  maxRecords?: 200 | 500 | 1000;
  criteria?: string;
} = {}): Promise<ScreeningSessionRow[]> {
  const { records } = await getRecords("All_Screening_Sessions", {
    max_records: opts.maxRecords ?? 200,
    criteria: opts.criteria
  });
  return (records as Array<Record<string, unknown>>).map(mapSession);
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
  const raw = await getRecord("All_Screening_Sessions", recordId);
  return raw ? mapSession(raw) : null;
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
  invitationStatus:
    | "Pending"
    | "Used"
    | "Expired"
    | "Revoked"
    | (string & {});
  usedAt: string;
  usedSessionId: string;
  notes: string;
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
    invitationStatus: toStr(raw.Invitation_Status),
    usedAt: toStr(raw.Used_At),
    usedSessionId: toStr(raw.Used_Session_Id),
    notes: toStr(raw.Notes)
  };
}

export async function createInvitation(args: {
  invitationCode: string;
  pin: string;
  candidateEmail: string;
  candidateFullName?: string;
  candidatePhone?: string;
  targetPosition?: string;
  createdBy: string;
  expiresAtIso: string;
  notes?: string;
}): Promise<string> {
  const data: CreatorRecord = {
    Invitation_Code: args.invitationCode,
    PIN: args.pin,
    Candidate_Email: args.candidateEmail,
    Candidate_Full_Name: args.candidateFullName ?? "",
    Candidate_Phone: args.candidatePhone ?? "",
    Target_Position: args.targetPosition ?? "",
    Created_By: args.createdBy,
    Expires_At: args.expiresAtIso,
    Invitation_Status: "Pending",
    Notes: args.notes ?? ""
  };
  const { id } = await addRecord("Screening_Invitation", data);
  return id;
}

export async function findInvitationByCode(
  invitationCode: string
): Promise<InvitationRow | null> {
  const { records } = await getRecords("All_Screening_Invitations", {
    criteria: `Invitation_Code == "${invitationCode}"`,
    max_records: 200
  });
  if (records.length === 0) return null;
  return mapInvitation(records[0] as Record<string, unknown>);
}

export async function markInvitationUsed(
  invitationId: string,
  sessionId: string
): Promise<void> {
  await updateRecord("All_Screening_Invitations", invitationId, {
    Invitation_Status: "Used",
    Used_At: new Date().toISOString(),
    Used_Session_Id: sessionId
  });
}

export async function listInvitations(): Promise<InvitationRow[]> {
  const { records } = await getRecords("All_Screening_Invitations", {
    max_records: 200
  });
  return (records as Array<Record<string, unknown>>).map(mapInvitation);
}

