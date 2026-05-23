import fs from "fs/promises";
import path from "path";
import { MOCK_SESSIONS, type ScreeningSessionRow } from "./zoho-creator";

const DB_DIR = path.join(process.cwd(), "data");
const DB_FILE = path.join(DB_DIR, "sessions.json");

async function ensureDb() {
  try {
    await fs.mkdir(DB_DIR, { recursive: true });
    try {
      await fs.access(DB_FILE);
    } catch {
      await fs.writeFile(DB_FILE, JSON.stringify([], null, 2), "utf-8");
    }
  } catch (err) {
    console.error("Local DB setup error:", err);
  }
}

export async function listLocalSessions(): Promise<ScreeningSessionRow[]> {
  await ensureDb();
  try {
    const raw = await fs.readFile(DB_FILE, "utf-8");
    return JSON.parse(raw) as ScreeningSessionRow[];
  } catch (err) {
    console.error("Failed to read local DB:", err);
    return [];
  }
}

export async function saveLocalSession(session: ScreeningSessionRow): Promise<void> {
  await ensureDb();
  const sessions = await listLocalSessions();
  const index = sessions.findIndex((s) => s.id === session.id);
  if (index >= 0) {
    sessions[index] = session;
  } else {
    sessions.push(session);
  }
  try {
    await fs.writeFile(DB_FILE, JSON.stringify(sessions, null, 2), "utf-8");
  } catch (err) {
    console.error("Failed to write to local DB:", err);
  }
}

export async function getLocalSession(id: string): Promise<ScreeningSessionRow | null> {
  const mock = MOCK_SESSIONS.find((s) => s.id === id);
  if (mock) return mock;

  const sessions = await listLocalSessions();
  return sessions.find((s) => s.id === id) || null;
}
