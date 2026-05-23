"use client";

import { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { BrandHeader } from "@/components/BrandHeader";
import { DimensionCard } from "@/components/DimensionCard";
import { MethodologyPanel } from "@/components/MethodologyPanel";
import { EmotionTimeline } from "@/components/EmotionTimeline";
import { ScoringMatrix } from "@/components/ScoringMatrix";
import { activeRubric } from "@/lib/rubric";
import type { ScoreOutput } from "@/lib/claude";
import type { AggregatedEmotion } from "@/lib/hume-face";
import { downloadBlob, loadRecording } from "@/lib/recording";

type ResultsPayload = ScoreOutput & {
  faceAggregated?: AggregatedEmotion[];
  framesCaptured?: number;
  faceFramesAnalyzed?: number;
  durationSec?: number;
};

type SessionMeta = {
  candidateName: string;
  candidateEmail: string;
  transcript: string;
  durationSec: number;
  startedAtIso: string;
  endedAtIso: string;
  endReason?: { kind: string; detail?: string };
  cameraStatus?: "active" | "denied" | "error" | "off";
  faceFrameCount?: number;
  recording?: { sizeBytes: number; mimeType: string } | null;
};

type SectionId =
  | "matrix"
  | "methodology"
  | "fluency"
  | "composure"
  | "eq"
  | "confidence"
  | "emotion"
  | "segments"
  | "rationale"
  | "transcript";

const INITIAL_OPEN: Record<SectionId, boolean> = {
  matrix: true, // always shown
  methodology: false,
  fluency: false,
  composure: false,
  eq: false,
  confidence: false,
  emotion: false,
  segments: false,
  rationale: false,
  transcript: false
};

export default function ResultsPage() {
  const params = useParams();
  const router = useRouter();
  const sessionId = (params.sessionId as string) ?? "";

  const [score, setScore] = useState<ResultsPayload | null>(null);
  const [meta, setMeta] = useState<SessionMeta | null>(null);
  const [recordingBlob, setRecordingBlob] = useState<Blob | null>(null);
  const [workdrive, setWorkdrive] = useState<{
    status: "uploading" | "uploaded" | "failed";
    url?: string;
    fileId?: string;
    filename?: string;
    sizeBytes?: number;
    error?: string;
  } | null>(null);
  const [openMap, setOpenMap] = useState<Record<SectionId, boolean>>(INITIAL_OPEN);

  useEffect(() => {
    const rawScore = sessionStorage.getItem(`centro-score-${sessionId}`);
    const rawMeta = sessionStorage.getItem(`centro-session-${sessionId}`);
    if (rawScore) setScore(JSON.parse(rawScore));
    if (rawMeta) setMeta(JSON.parse(rawMeta));

    void loadRecording(sessionId).then((blob) => {
      if (blob) setRecordingBlob(blob);
    });

    // Poll for WorkDrive upload status every 2s until uploaded/failed
    const checkWorkdrive = () => {
      const raw = sessionStorage.getItem(`centro-workdrive-${sessionId}`);
      if (raw) setWorkdrive(JSON.parse(raw));
    };
    checkWorkdrive();
    const interval = setInterval(() => {
      checkWorkdrive();
      const raw = sessionStorage.getItem(`centro-workdrive-${sessionId}`);
      if (raw) {
        const parsed = JSON.parse(raw);
        if (parsed.status !== "uploading") clearInterval(interval);
      }
    }, 2000);
    return () => clearInterval(interval);
  }, [sessionId]);

  const handleDownloadRecording = () => {
    if (!recordingBlob || !meta) return;
    const ext = recordingBlob.type.includes("mp4") ? "mp4" : "webm";
    const safeName = meta.candidateName.replace(/[^a-z0-9-_]+/gi, "_");
    downloadBlob(recordingBlob, `centro-screening-${safeName}-${sessionId.slice(0, 8)}.${ext}`);
  };

  const toggle = (id: SectionId) => setOpenMap((m) => ({ ...m, [id]: !m[id] }));
  const allOpen =
    openMap.methodology &&
    openMap.fluency &&
    openMap.composure &&
    openMap.eq &&
    openMap.confidence &&
    openMap.emotion &&
    openMap.segments &&
    openMap.rationale &&
    openMap.transcript;
  const setAll = (open: boolean) =>
    setOpenMap({
      matrix: true,
      methodology: open,
      fluency: open,
      composure: open,
      eq: open,
      confidence: open,
      emotion: open,
      segments: open,
      rationale: open,
      transcript: open
    });

  const jumpToDimension = (dimension: string) => {
    const sectionId = dimension as SectionId;
    setOpenMap((m) => ({ ...m, [sectionId]: true }));
    setTimeout(() => {
      const el = document.getElementById(`dim-${sectionId}`);
      if (el) el.scrollIntoView({ behavior: "smooth", block: "start" });
    }, 50);
  };

  if (!score || !meta) {
    return (
      <>
        <BrandHeader />
        <main className="mx-auto max-w-2xl px-6 py-24 text-center">
          <p className="text-centro-ink/60">No results found for this session.</p>
          <button onClick={() => router.push("/")} className="mt-6 centro-btn">
            Back to start
          </button>
        </main>
      </>
    );
  }

  const wasPartial = meta.endReason && meta.endReason.kind !== "user_ended";
  const dims = activeRubric.weightedDimensions;
  const framesCaptured = score.framesCaptured ?? meta.faceFrameCount ?? 0;
  const framesAnalyzed = score.faceFramesAnalyzed ?? 0;

  return (
    <>
      <BrandHeader subtitle="Screening Report" />
      <main className="mx-auto max-w-5xl px-6 py-8 pb-24">
        {/* Candidate strip */}
        <div className="flex flex-wrap items-start justify-between gap-4 mb-6">
          <div>
            <h1 className="text-3xl font-bold text-centro-primary">
              {meta.candidateName}
            </h1>
            <p className="text-sm text-centro-ink/60 mt-1">
              {meta.candidateEmail} ·{" "}
              {Math.floor(meta.durationSec / 60)}m {Math.floor(meta.durationSec % 60)}s
              session
            </p>
            <p className="text-xs text-centro-ink/55 mt-1">
              Camera: <strong>{meta.cameraStatus ?? "unknown"}</strong> · frames
              captured: <strong>{framesCaptured}</strong> · analyzed by Hume:{" "}
              <strong>{framesAnalyzed}</strong>
            </p>
          </div>
          <div className="flex gap-2">
            <button
              onClick={() => setAll(!allOpen)}
              className="rounded-md border-2 border-centro-primary text-centro-primary px-5 py-2 text-sm font-medium hover:bg-centro-primary/5"
            >
              {allOpen ? "Hide all details" : "Show all details"}
            </button>
          </div>
        </div>

        {wasPartial && (
          <div className="mb-4 p-4 rounded-md border border-amber-300 bg-amber-50 text-sm text-amber-900">
            <p className="font-semibold">
              Partial session — scored from incomplete data
            </p>
            <p className="mt-1 opacity-90">
              This session ended unexpectedly ({meta.endReason?.detail ?? "unknown"}).
              Scores reflect only what was captured before the disconnect.
            </p>
          </div>
        )}

        {/* SCORING MATRIX — hero summary */}
        <ScoringMatrix score={score} onJumpTo={jumpToDimension} />

        {/* Recommendation rationale */}
        <div className="mt-4 px-4 py-3 rounded-md bg-gray-50 border border-gray-200 text-xs text-centro-ink/75">
          <strong>Recommendation rationale:</strong> {score.passFailReasoning}
        </div>

        {/* Methodology */}
        <section className="mt-8">
          <MethodologyPanel
            score={score}
            open={openMap.methodology}
            onToggle={() => toggle("methodology")}
          />
        </section>

        {/* Dimension cards */}
        <section className="mt-8 space-y-4">
          <h2 className="text-lg font-semibold text-centro-primary">
            Dimension-by-dimension breakdown
          </h2>
          <p className="text-xs text-centro-ink/60 -mt-2">
            Click any card to expand evidence + improvement guidance. Use the matrix
            tiles above to jump straight to a dimension.
          </p>

          <DimensionCard
            label="Fluency"
            weight={dims.fluency.weight}
            description={dims.fluency.description}
            rubricLevels={dims.fluency.rubric}
            detail={score.fluency}
            open={openMap.fluency}
            onToggle={() => toggle("fluency")}
            anchorId="dim-fluency"
          />
          <DimensionCard
            label="Composure"
            weight={dims.composure.weight}
            description={dims.composure.description}
            rubricLevels={dims.composure.rubric}
            detail={score.composure}
            open={openMap.composure}
            onToggle={() => toggle("composure")}
            anchorId="dim-composure"
          />
          <DimensionCard
            label="Emotional Intelligence (EQ)"
            weight={dims.eq.weight}
            description={dims.eq.description}
            rubricLevels={dims.eq.rubric}
            detail={score.eq}
            open={openMap.eq}
            onToggle={() => toggle("eq")}
            anchorId="dim-eq"
          />
          <DimensionCard
            label="Confidence"
            weight={dims.confidence.weight}
            description={dims.confidence.description}
            rubricLevels={dims.confidence.rubric}
            detail={score.confidence}
            open={openMap.confidence}
            onToggle={() => toggle("confidence")}
            anchorId="dim-confidence"
          />
        </section>

        {/* Facial expression timeline */}
        <section className="mt-8">
          <EmotionTimeline
            emotions={score.faceAggregated ?? []}
            frameCount={framesAnalyzed}
            framesCaptured={framesCaptured}
            cameraStatus={meta.cameraStatus}
            open={openMap.emotion}
            onToggle={() => toggle("emotion")}
          />
        </section>

        {/* Session recording */}
        {recordingBlob && (
          <section className="mt-8 rounded-lg border border-gray-200 bg-white p-6">
            <div className="flex items-baseline justify-between mb-3">
              <h2 className="text-lg font-semibold text-centro-primary">
                Session recording
              </h2>
              <span className="text-xs text-centro-ink/60">
                {meta.recording
                  ? `${(meta.recording.sizeBytes / 1_000_000).toFixed(1)} MB · ${meta.recording.mimeType}`
                  : `${(recordingBlob.size / 1_000_000).toFixed(1)} MB · ${recordingBlob.type || "video/webm"}`}
              </span>
            </div>
            <video
              src={URL.createObjectURL(recordingBlob)}
              controls
              playsInline
              className="w-full rounded-md border border-gray-200"
            />
            <div className="mt-4 flex flex-wrap items-center gap-3">
              <button onClick={handleDownloadRecording} className="centro-btn">
                Download recording
              </button>

              {/* WorkDrive upload status */}
              {workdrive?.status === "uploading" && (
                <span className="inline-flex items-center gap-2 text-xs text-amber-700">
                  <span className="inline-block w-3 h-3 rounded-full border-2 border-amber-500 border-t-transparent animate-spin" />
                  Uploading to Zoho WorkDrive...
                </span>
              )}
              {workdrive?.status === "uploaded" && workdrive.url && (
                <a
                  href={workdrive.url}
                  target="_blank"
                  rel="noreferrer"
                  className="inline-flex items-center gap-2 text-xs text-emerald-700 hover:underline font-medium"
                >
                  <span className="inline-block w-2 h-2 rounded-full bg-emerald-500" />
                  Stored in Zoho WorkDrive — open file ↗
                </a>
              )}
              {workdrive?.status === "failed" && (
                <span className="inline-flex items-center gap-2 text-xs text-rose-700">
                  <span className="inline-block w-2 h-2 rounded-full bg-rose-500" />
                  WorkDrive upload failed: {workdrive.error}
                </span>
              )}
              {!workdrive && (
                <span className="text-xs text-centro-ink/55">
                  Stored locally in your browser (IndexedDB).
                </span>
              )}
            </div>
          </section>
        )}

        {/* Per-segment notes */}
        <section className="mt-8 rounded-lg border border-gray-200 bg-white">
          <button
            onClick={() => toggle("segments")}
            className="w-full px-6 py-4 flex items-center justify-between text-left hover:bg-gray-50"
          >
            <h2 className="text-lg font-semibold text-centro-primary">
              Per-segment notes
            </h2>
            <span className="text-xs text-centro-primary">
              {openMap.segments ? "Hide" : "Show"} ▾
            </span>
          </button>
          {openMap.segments && (
            <div className="border-t border-gray-100 divide-y divide-gray-100">
              {score.perSegmentNotes.map((seg) => (
                <div
                  key={seg.segment}
                  className="px-6 py-4 flex items-start justify-between gap-4"
                >
                  <div className="flex-1">
                    <p className="text-sm font-medium">
                      {seg.segment.replace("_", " ")}
                    </p>
                    <p className="text-sm text-centro-ink/70 mt-1">{seg.note}</p>
                  </div>
                  <span className="text-lg font-semibold tabular-nums text-centro-primary whitespace-nowrap">
                    {seg.score.toFixed(2)}
                  </span>
                </div>
              ))}
            </div>
          )}
        </section>

        {/* Full rationale */}
        <section className="mt-4 rounded-lg border border-gray-200 bg-white">
          <button
            onClick={() => toggle("rationale")}
            className="w-full px-6 py-4 flex items-center justify-between text-left hover:bg-gray-50"
          >
            <h2 className="text-lg font-semibold text-centro-primary">
              Full AI rationale
            </h2>
            <span className="text-xs text-centro-primary">
              {openMap.rationale ? "Hide" : "Show"} ▾
            </span>
          </button>
          {openMap.rationale && (
            <div className="border-t border-gray-100 px-6 py-5">
              <p className="text-sm text-centro-ink/85 whitespace-pre-wrap leading-relaxed">
                {score.fullRationale}
              </p>
            </div>
          )}
        </section>

        {/* Transcript */}
        <section className="mt-4 rounded-lg border border-gray-200 bg-white">
          <button
            onClick={() => toggle("transcript")}
            className="w-full px-6 py-4 flex items-center justify-between text-left hover:bg-gray-50"
          >
            <h2 className="text-lg font-semibold text-centro-primary">
              Full transcript
            </h2>
            <span className="text-xs text-centro-primary">
              {openMap.transcript ? "Hide" : "Show"} ▾
            </span>
          </button>
          {openMap.transcript && (
            <div className="border-t border-gray-100 px-6 py-5">
              <pre className="text-xs text-centro-ink/80 whitespace-pre-wrap font-sans leading-relaxed">
                {meta.transcript}
              </pre>
            </div>
          )}
        </section>

        <div className="mt-12 flex flex-wrap gap-3">
          <button onClick={() => router.push("/")} className="centro-btn">
            New screening
          </button>
          <button
            onClick={() => window.print()}
            className="rounded-md border-2 border-centro-primary text-centro-primary px-6 py-3 font-medium hover:bg-centro-primary/5"
          >
            Print / Save PDF
          </button>
          <button
            onClick={() => router.push("/admin/usage")}
            className="rounded-md border border-gray-300 text-centro-ink/75 px-6 py-3 font-medium hover:bg-gray-50"
          >
            Usage dashboard
          </button>
        </div>

        <p className="mt-10 text-xs text-centro-ink/50 text-center">
          Generated by Claude Sonnet 4.6 against rubric {score.methodologyVersion} +
          Hume Expression Measurement (face) and EVI 2 (voice prosody). Testing-phase
          report — all scores subject to recruiter override before any hiring decision.
        </p>
      </main>
    </>
  );
}
