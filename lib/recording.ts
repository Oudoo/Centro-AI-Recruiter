// IndexedDB wrapper for storing session recordings client-side.
// Blobs are too large for sessionStorage (5MB cap); IndexedDB has no practical limit
// for typical webcam recordings (~20-30 MB per 5-min session).
//
// For v1.2 we'll add an /api/upload route that POSTs the Blob to Zoho WorkDrive — the
// API surface here (saveRecording / loadRecording / deleteRecording) won't change.

const DB_NAME = "centro-ai-recruiter";
const STORE_NAME = "recordings";
const DB_VERSION = 2;

function openDB(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(STORE_NAME)) {
        db.createObjectStore(STORE_NAME);
      }
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => {
      // If the version is still wrong (e.g. browser has a higher version from
      // a previous dev session), delete the DB and retry once.
      console.warn("IndexedDB open failed, attempting recovery:", req.error);
      const delReq = indexedDB.deleteDatabase(DB_NAME);
      delReq.onsuccess = () => {
        const retry = indexedDB.open(DB_NAME, DB_VERSION);
        retry.onupgradeneeded = () => {
          const db = retry.result;
          if (!db.objectStoreNames.contains(STORE_NAME)) {
            db.createObjectStore(STORE_NAME);
          }
        };
        retry.onsuccess = () => resolve(retry.result);
        retry.onerror = () => reject(retry.error);
      };
      delReq.onerror = () => reject(req.error);
    };
  });
}

export async function saveRecording(sessionId: string, blob: Blob): Promise<void> {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, "readwrite");
    tx.objectStore(STORE_NAME).put(blob, sessionId);
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

export async function loadRecording(sessionId: string): Promise<Blob | null> {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, "readonly");
    const req = tx.objectStore(STORE_NAME).get(sessionId);
    req.onsuccess = () => {
      db.close();
      resolve((req.result as Blob) ?? null);
    };
    req.onerror = () => {
      db.close();
      reject(req.error);
    };
  });
}

export async function deleteRecording(sessionId: string): Promise<void> {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, "readwrite");
    tx.objectStore(STORE_NAME).delete(sessionId);
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

export async function listRecordings(): Promise<string[]> {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, "readonly");
    const req = tx.objectStore(STORE_NAME).getAllKeys();
    req.onsuccess = () => {
      db.close();
      resolve(req.result as string[]);
    };
    req.onerror = () => {
      db.close();
      reject(req.error);
    };
  });
}

export function downloadBlob(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  // Slight delay before revoking so the download completes
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

export function pickSupportedMimeType(): string {
  const candidates = [
    "video/webm;codecs=vp9,opus",
    "video/webm;codecs=vp8,opus",
    "video/webm",
    "video/mp4"
  ];
  for (const c of candidates) {
    if (typeof MediaRecorder !== "undefined" && MediaRecorder.isTypeSupported(c)) {
      return c;
    }
  }
  return "video/webm";
}
