// Server-side: analyse a batch of webcam frames via Hume's Expression Measurement
// streaming WebSocket. Returns a per-frame emotion timeline.
//
// Diagnostics are verbose in development — every WS event logs so we can debug the
// "no facial expression data captured" path. Look for `hume-face:` prefix in the
// `npm run dev` terminal output.

import WebSocket from "ws";

export type FaceFrame = {
  timeOffsetMs: number;
  base64Jpeg: string;
};

export type FaceEmotionResult = {
  timeOffsetMs: number;
  emotions: Record<string, number>;
  detected: boolean;
};

const STREAM_URL = "wss://api.hume.ai/v0/stream/models";

export async function analyzeFaceFrames(
  frames: FaceFrame[]
): Promise<FaceEmotionResult[]> {
  console.log(`hume-face: analyze called with ${frames.length} frame(s)`);
  if (frames.length === 0) return [];

  const apiKey = process.env.HUME_API_KEY ?? "";
  if (!apiKey) {
    console.error("hume-face: HUME_API_KEY not set in env");
    return [];
  }

  return new Promise<FaceEmotionResult[]>((resolve) => {
    const ws = new WebSocket(STREAM_URL, {
      headers: { "X-Hume-Api-Key": apiKey }
    });

    const results: FaceEmotionResult[] = new Array(frames.length);
    let receivedCount = 0;
    let nextSendIdx = 0;
    let closed = false;

    const timeout = setTimeout(() => {
      if (!closed) {
        console.warn(
          `hume-face: 90s timeout — got ${receivedCount}/${frames.length} responses`
        );
        try { ws.close(); } catch {}
        const cleaned = results.filter((r): r is FaceEmotionResult => !!r);
        resolve(cleaned);
      }
    }, 90_000);

    const finish = () => {
      if (closed) return;
      closed = true;
      clearTimeout(timeout);
      try { ws.close(); } catch {}
      const cleaned = results.filter((r): r is FaceEmotionResult => !!r);
      const detectedCount = cleaned.filter((r) => r.detected).length;
      console.log(
        `hume-face: finish — sent ${nextSendIdx}, received ${receivedCount}, with-face ${detectedCount}`
      );
      resolve(cleaned);
    };

    const sendNext = () => {
      if (nextSendIdx >= frames.length) return;
      const idx = nextSendIdx++;
      const frame = frames[idx];
      const payload = JSON.stringify({
        models: { face: {} },
        payload_id: String(idx),
        data: frame.base64Jpeg
      });
      ws.send(payload, (err) => {
        if (err) console.error(`hume-face: send error frame ${idx}`, err);
      });
    };

    ws.on("open", () => {
      console.log("hume-face: WS open — starting initial burst");
      const INITIAL_BURST = Math.min(4, frames.length);
      for (let i = 0; i < INITIAL_BURST; i++) sendNext();
    });

    ws.on("message", (raw) => {
      try {
        const text = raw.toString();
        const msg = JSON.parse(text);

        // Surface any error envelope from Hume
        if (msg.error || msg.code === "ERROR") {
          console.error("hume-face: error envelope", msg);
        }

        const payloadId = msg.payload_id ? parseInt(msg.payload_id, 10) : NaN;
        const idx = Number.isFinite(payloadId) ? payloadId : receivedCount;
        const facePred = msg.face?.predictions?.[0];

        if (facePred && Array.isArray(facePred.emotions)) {
          const emotionMap: Record<string, number> = {};
          for (const e of facePred.emotions as Array<{
            name: string;
            score: number;
          }>) {
            emotionMap[e.name] = e.score;
          }
          results[idx] = {
            timeOffsetMs: frames[idx]?.timeOffsetMs ?? 0,
            emotions: emotionMap,
            detected: true
          };
        } else {
          // No face detected — keep timeline shape, mark detected=false
          if (msg.face?.warning) {
            console.warn(`hume-face: frame ${idx} warning`, msg.face.warning);
          }
          results[idx] = {
            timeOffsetMs: frames[idx]?.timeOffsetMs ?? 0,
            emotions: {},
            detected: false
          };
        }

        receivedCount++;
        if (receivedCount >= frames.length) {
          finish();
        } else {
          sendNext();
        }
      } catch (err) {
        console.error("hume-face: bad message JSON", err);
      }
    });

    ws.on("error", (err) => {
      console.error("hume-face: socket error", err);
      finish();
    });

    ws.on("close", (code, reason) => {
      console.log(
        `hume-face: WS close code=${code} reason=${reason?.toString() || "(none)"}`
      );
      finish();
    });
  });
}

export type AggregatedEmotion = {
  name: string;
  avg: number;
  max: number;
  maxAtMs: number;
  samples: number;
};

export function aggregateFaceTimeline(
  timeline: FaceEmotionResult[]
): AggregatedEmotion[] {
  const sums: Record<string, { total: number; count: number; max: number; maxAt: number }> = {};
  for (const point of timeline) {
    if (!point.detected) continue;
    for (const [name, score] of Object.entries(point.emotions)) {
      if (!sums[name]) sums[name] = { total: 0, count: 0, max: 0, maxAt: 0 };
      sums[name].total += score;
      sums[name].count += 1;
      if (score > sums[name].max) {
        sums[name].max = score;
        sums[name].maxAt = point.timeOffsetMs;
      }
    }
  }
  return Object.entries(sums)
    .map(([name, v]) => ({
      name,
      avg: v.total / v.count,
      max: v.max,
      maxAtMs: v.maxAt,
      samples: v.count
    }))
    .sort((a, b) => b.avg - a.avg);
}
