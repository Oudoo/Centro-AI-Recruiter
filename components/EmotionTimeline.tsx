"use client";

import type { AggregatedEmotion } from "@/lib/hume-face";

const POSITIVE = new Set([
  "Calmness",
  "Joy",
  "Contentment",
  "Satisfaction",
  "Determination",
  "Concentration",
  "Confidence",
  "Interest",
  "Pride",
  "Amusement",
  "Realization",
  "Empathic Pain"
]);

const NEGATIVE = new Set([
  "Anxiety",
  "Distress",
  "Confusion",
  "Fear",
  "Embarrassment",
  "Awkwardness",
  "Anger",
  "Contempt",
  "Disgust",
  "Disappointment",
  "Sadness",
  "Shame",
  "Pain",
  "Tiredness"
]);

function categoryColor(name: string): { bar: string; text: string } {
  if (POSITIVE.has(name)) return { bar: "bg-emerald-400", text: "text-emerald-800" };
  if (NEGATIVE.has(name)) return { bar: "bg-rose-400", text: "text-rose-800" };
  return { bar: "bg-sky-400", text: "text-sky-800" };
}

function formatTime(ms: number): string {
  const totalSec = Math.round(ms / 1000);
  const m = Math.floor(totalSec / 60);
  const s = totalSec % 60;
  return `${m}:${s.toString().padStart(2, "0")}`;
}

type Props = {
  emotions: AggregatedEmotion[];
  frameCount: number;
  framesCaptured: number;
  cameraStatus?: string;
  open: boolean;
  onToggle: () => void;
};

export function EmotionTimeline({
  emotions,
  frameCount,
  framesCaptured,
  cameraStatus,
  open,
  onToggle
}: Props) {
  const positivePresence = emotions
    .filter((e) => POSITIVE.has(e.name))
    .reduce((sum, e) => sum + e.avg, 0);
  const negativePresence = emotions
    .filter((e) => NEGATIVE.has(e.name))
    .reduce((sum, e) => sum + e.avg, 0);

  const empty = emotions.length === 0;
  const visible = open ? emotions.slice(0, 12) : [];
  const maxAvg = empty ? 1 : Math.max(...emotions.map((e) => e.avg));

  return (
    <div className="rounded-lg border border-gray-200 bg-white">
      <button
        onClick={onToggle}
        className="w-full px-6 py-4 flex items-center justify-between text-left hover:bg-gray-50"
      >
        <div>
          <h2 className="text-lg font-semibold text-centro-primary">
            Facial expression analysis
          </h2>
          <p className="text-xs text-centro-ink/60 mt-0.5">
            {framesCaptured} frame{framesCaptured === 1 ? "" : "s"} captured by camera ·{" "}
            {frameCount} analyzed by Hume · {emotions.length} emotions detected
          </p>
        </div>
        <span className="text-xs text-centro-primary">{open ? "Hide" : "Show"} ▾</span>
      </button>

      {open && (
        <div className="px-6 pb-6">
          {empty ? (
            <div className="rounded-md border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900">
              <p className="font-semibold mb-1">No facial expression data this session.</p>
              <ul className="text-xs space-y-0.5 mt-2">
                <li>
                  Camera status: <strong>{cameraStatus ?? "unknown"}</strong>
                </li>
                <li>
                  Frames captured client-side: <strong>{framesCaptured}</strong>
                </li>
                <li>
                  Frames returned with face detection by Hume:{" "}
                  <strong>{frameCount}</strong>
                </li>
              </ul>
              <p className="text-xs mt-3 opacity-80">
                If frames captured &gt; 0 but Hume returned 0, the streaming WebSocket
                rejected our auth or didn't detect a face. Check the dev server console
                for <code className="bg-amber-100 px-1 rounded">hume-face:</code> log
                lines. If frames captured = 0, the camera wasn't granted or the video
                element wasn't ready.
              </p>
            </div>
          ) : (
            <>
              <div className="flex items-center justify-end gap-4 text-xs mb-3">
                <p>
                  <span className="inline-block w-2 h-2 rounded-full bg-emerald-400 mr-1.5 align-middle" />
                  Positive signal: <strong>{positivePresence.toFixed(2)}</strong>
                </p>
                <p>
                  <span className="inline-block w-2 h-2 rounded-full bg-rose-400 mr-1.5 align-middle" />
                  Negative signal: <strong>{negativePresence.toFixed(2)}</strong>
                </p>
              </div>

              <p className="text-xs text-centro-ink/65 mb-4 leading-relaxed">
                Behavioural <em>expression</em> signals — what was visible on the
                candidate's face. Describes observable cues, NOT internal feelings. Use
                as one data point among several.
              </p>

              <div className="space-y-2">
                {visible.map((emotion) => {
                  const widthPct = maxAvg > 0 ? (emotion.avg / maxAvg) * 100 : 0;
                  const colors = categoryColor(emotion.name);
                  return (
                    <div key={emotion.name} className="flex items-center gap-3">
                      <div className="w-36 text-sm font-medium truncate">
                        {emotion.name}
                      </div>
                      <div className="flex-1 h-6 bg-gray-100 rounded overflow-hidden relative">
                        <div
                          className={`h-full ${colors.bar} transition-all`}
                          style={{ width: `${widthPct}%` }}
                        />
                        <span
                          className={`absolute right-2 top-0.5 text-xs font-medium tabular-nums ${colors.text}`}
                        >
                          avg {emotion.avg.toFixed(2)}
                        </span>
                      </div>
                      <div className="w-32 text-xs text-centro-ink/60 text-right tabular-nums">
                        peak {emotion.max.toFixed(2)} @ {formatTime(emotion.maxAtMs)}
                      </div>
                    </div>
                  );
                })}
              </div>
            </>
          )}
        </div>
      )}
    </div>
  );
}
