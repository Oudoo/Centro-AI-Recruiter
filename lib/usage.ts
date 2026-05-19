// Per-session usage log stored in IndexedDB so we can correlate our app's view of
// consumption with Hume's dashboard. For v1.2 we'll mirror this to a Creator
// Usage_Log form so usage is centralised across recruiters.

const DB_NAME = "centro-ai-recruiter";
const STORE_NAME = "usage_log";
const DB_VERSION = 2;

export type UsageRecord = {
  sessionId: string;
  candidateName: string;
  candidateEmail: string;
  startedAtIso: string;
  endedAtIso: string;
  durationSec: number; // Hume EVI billed-minute proxy = durationSec / 60
  faceFramesSent: number;
  faceFramesAnalyzed: number;
  claudeInputTokens: number;
  claudeOutputTokens: number;
  endReasonKind: string;
  scoringSuccess: boolean;
  // Helpful derived fields (estimates — actual billed numbers come from each vendor):
  estimatedHumeEviMinutes: number;
  estimatedHumeFaceMinutes: number;
};

function openDB(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = (event) => {
      const db = req.result;
      // Recordings store from v1
      if (!db.objectStoreNames.contains("recordings")) {
        db.createObjectStore("recordings");
      }
      // Usage log store added in v2
      if (!db.objectStoreNames.contains(STORE_NAME)) {
        const store = db.createObjectStore(STORE_NAME, { keyPath: "sessionId" });
        store.createIndex("startedAtIso", "startedAtIso");
      }
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

export async function logUsage(record: UsageRecord): Promise<void> {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, "readwrite");
    tx.objectStore(STORE_NAME).put(record);
    tx.oncomplete = () => {
      db.close();
      resolve();
    };
    tx.onerror = () => {
      db.close();
      reject(tx.error);
    };
  });
}

export async function listUsage(): Promise<UsageRecord[]> {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, "readonly");
    const req = tx.objectStore(STORE_NAME).getAll();
    req.onsuccess = () => {
      db.close();
      const list = (req.result as UsageRecord[]) ?? [];
      // newest first
      list.sort((a, b) => b.startedAtIso.localeCompare(a.startedAtIso));
      resolve(list);
    };
    req.onerror = () => {
      db.close();
      reject(req.error);
    };
  });
}

export async function clearUsage(): Promise<void> {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, "readwrite");
    tx.objectStore(STORE_NAME).clear();
    tx.oncomplete = () => {
      db.close();
      resolve();
    };
    tx.onerror = () => {
      db.close();
      reject(tx.error);
    };
  });
}

export type UsageSummary = {
  sessions: number;
  totalDurationSec: number;
  totalHumeEviMinutes: number;
  totalHumeFaceMinutes: number;
  totalClaudeInputTokens: number;
  totalClaudeOutputTokens: number;
  totalFaceFramesAnalyzed: number;
  failures: number;
  byDay: Array<{ day: string; sessions: number; minutes: number }>;
};

export function summarize(records: UsageRecord[]): UsageSummary {
  const byDayMap: Record<string, { sessions: number; minutes: number }> = {};
  let totalDuration = 0;
  let totalEvi = 0;
  let totalFace = 0;
  let totalIn = 0;
  let totalOut = 0;
  let totalFrames = 0;
  let failures = 0;

  for (const r of records) {
    totalDuration += r.durationSec;
    totalEvi += r.estimatedHumeEviMinutes;
    totalFace += r.estimatedHumeFaceMinutes;
    totalIn += r.claudeInputTokens;
    totalOut += r.claudeOutputTokens;
    totalFrames += r.faceFramesAnalyzed;
    if (!r.scoringSuccess) failures++;
    const day = r.startedAtIso.slice(0, 10);
    if (!byDayMap[day]) byDayMap[day] = { sessions: 0, minutes: 0 };
    byDayMap[day].sessions += 1;
    byDayMap[day].minutes += r.durationSec / 60;
  }

  const byDay = Object.entries(byDayMap)
    .map(([day, v]) => ({ day, sessions: v.sessions, minutes: v.minutes }))
    .sort((a, b) => b.day.localeCompare(a.day));

  return {
    sessions: records.length,
    totalDurationSec: totalDuration,
    totalHumeEviMinutes: totalEvi,
    totalHumeFaceMinutes: totalFace,
    totalClaudeInputTokens: totalIn,
    totalClaudeOutputTokens: totalOut,
    totalFaceFramesAnalyzed: totalFrames,
    failures,
    byDay
  };
}
