"use client";

import { useEffect, useState } from "react";
import { useParams, useRouter, useSearchParams } from "next/navigation";
import { BrandHeader } from "@/components/BrandHeader";
import { HumeWidget, type SessionData, type EndReason } from "@/components/HumeWidget";
import { NetworkStatus } from "@/components/NetworkStatus";
import { saveRecording } from "@/lib/recording";
import { logUsage } from "@/lib/usage";

export default function ScreenPage() {
  const params = useParams();
  const search = useSearchParams();
  const router = useRouter();
  const sessionId = (params.sessionId as string) ?? "";
  const candidateName = search.get("name") ?? "Candidate";
  const candidateEmail = search.get("email") ?? "";

  const [accessToken, setAccessToken] = useState<string | null>(null);
  const [configId, setConfigId] = useState<string | null>(null);
  const [scoring, setScoring] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetch("/api/hume-token", { method: "POST" })
      .then((r) => r.json())
      .then((data) => {
        if (data.error) {
          setError(data.error);
          return;
        }
        setAccessToken(data.accessToken);
        setConfigId(data.configId);
      })
      .catch((err) => setError(String(err)));
  }, []);

  const handleSessionEnd = async (data: SessionData, endReason: EndReason) => {
    setScoring(true);

    // Persist the video recording to IndexedDB so it survives navigation and refresh.
    // For v1.2 this same hook will also POST to /api/upload → Zoho WorkDrive.
    let recordingMeta: { sizeBytes: number; mimeType: string } | null = null;
    if (data.recordingBlob) {
      try {
        await saveRecording(sessionId, data.recordingBlob);
        recordingMeta = {
          sizeBytes: data.recordingBlob.size,
          mimeType: data.recordingMimeType ?? "video/webm"
        };
      } catch (err) {
        console.error("Failed to save recording locally:", err);
      }
    }

    sessionStorage.setItem(
      `centro-session-${sessionId}`,
      JSON.stringify({
        candidateName,
        candidateEmail,
        startedAtIso: new Date(Date.now() - data.durationSec * 1000).toISOString(),
        endedAtIso: new Date().toISOString(),
        endReason,
        transcript: data.transcript,
        durationSec: data.durationSec,
        cameraStatus: data.cameraStatus,
        faceFrameCount: data.faceFrames.length,
        recording: recordingMeta
      })
    );

    if (data.transcript.trim().length < 20) {
      setError(
        `No usable speech was captured. End reason: ${endReason.kind}${
          endReason.kind !== "user_ended" ? ` — ${endReason.detail}` : ""
        }`
      );
      setScoring(false);
      return;
    }

    const startedAtIso = new Date(Date.now() - data.durationSec * 1000).toISOString();
    const endedAtIso = new Date().toISOString();

    try {
      // Read identity-verification outcome saved by /verify/[sessionId]
      const verifRaw = sessionStorage.getItem(`centro-verification-${sessionId}`);
      const verification = verifRaw ? JSON.parse(verifRaw) : null;

      const res = await fetch("/api/score", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          candidateName,
          candidateEmail,
          transcript: data.transcript,
          prosodyTimeline: data.prosodyTimeline,
          faceFrames: data.faceFrames.map((f) => ({
            timeOffsetMs: f.timeOffsetMs,
            base64Jpeg: f.base64Jpeg
          })),
          durationSec: data.durationSec,
          endReason,
          verification
        })
      });
      const json = await res.json();
      if (json.error) {
        setError(json.error);
        setScoring(false);
        return;
      }

      // Persist usage row for the admin dashboard
      try {
        await logUsage({
          sessionId,
          candidateName,
          candidateEmail,
          startedAtIso,
          endedAtIso,
          durationSec: data.durationSec,
          faceFramesSent: data.faceFrames.length,
          faceFramesAnalyzed: json.faceFramesAnalyzed ?? 0,
          claudeInputTokens: json.claudeInputTokens ?? 0,
          claudeOutputTokens: json.claudeOutputTokens ?? 0,
          endReasonKind: endReason.kind,
          scoringSuccess: true,
          estimatedHumeEviMinutes: data.durationSec / 60,
          estimatedHumeFaceMinutes: data.durationSec / 60 // face stream is roughly co-extensive with the call
        });
      } catch (logErr) {
        console.error("Could not log usage:", logErr);
      }

      sessionStorage.setItem(`centro-score-${sessionId}`, JSON.stringify(json));

      // Phase 1B: kick off WorkDrive upload in the background. We navigate to
      // results immediately and let the upload land asynchronously — the results
      // page polls sessionStorage for the WorkDrive URL.
      if (data.recordingBlob && json.creatorRecordId) {
        const uploadForm = new FormData();
        uploadForm.append("file", data.recordingBlob, `recording.webm`);
        uploadForm.append("sessionId", sessionId);
        uploadForm.append("creatorRecordId", json.creatorRecordId);
        uploadForm.append("candidateName", candidateName);

        sessionStorage.setItem(
          `centro-workdrive-${sessionId}`,
          JSON.stringify({ status: "uploading", startedAt: Date.now() })
        );

        fetch("/api/upload-recording", { method: "POST", body: uploadForm })
          .then((r) => r.json())
          .then((up) => {
            sessionStorage.setItem(
              `centro-workdrive-${sessionId}`,
              JSON.stringify(
                up.error
                  ? { status: "failed", error: up.error }
                  : {
                      status: "uploaded",
                      url: up.workdrivePermalink,
                      fileId: up.workdriveFileId,
                      filename: up.filename,
                      sizeBytes: up.sizeBytes
                    }
              )
            );
          })
          .catch((err) => {
            sessionStorage.setItem(
              `centro-workdrive-${sessionId}`,
              JSON.stringify({ status: "failed", error: String(err) })
            );
          });
      }

      router.push(`/results/${sessionId}`);
    } catch (err) {
      setError(String(err));
      setScoring(false);
    }
  };

  if (error) {
    return (
      <>
        <BrandHeader />
        <main className="mx-auto max-w-2xl px-6 py-16">
          <h1 className="text-2xl font-bold text-rose-700">Something went wrong</h1>
          <pre className="mt-4 p-4 bg-rose-50 border border-rose-200 rounded text-sm text-rose-900 whitespace-pre-wrap">
            {error}
          </pre>
          <button onClick={() => router.push("/")} className="mt-6 centro-btn">
            Back to start
          </button>
        </main>
      </>
    );
  }

  if (scoring) {
    return (
      <>
        <BrandHeader subtitle="Scoring..." />
        <main className="mx-auto max-w-2xl px-6 py-24 text-center">
          <div className="inline-block w-16 h-16 border-4 border-centro-primary/20 border-t-centro-primary rounded-full animate-spin" />
          <h2 className="mt-8 text-xl font-medium">Scoring your screening</h2>
          <p className="mt-2 text-centro-ink/60">
            Analyzing voice prosody, facial expressions, and conversation against the
            rubric. This takes about 30-60 seconds.
          </p>
        </main>
      </>
    );
  }

  if (!accessToken || !configId) {
    return (
      <>
        <BrandHeader />
        <main className="mx-auto max-w-2xl px-6 py-24 text-center">
          <div className="inline-block w-12 h-12 border-4 border-centro-primary/20 border-t-centro-primary rounded-full animate-spin" />
          <p className="mt-6 text-centro-ink/60">Preparing your session...</p>
        </main>
      </>
    );
  }

  return (
    <>
      <BrandHeader subtitle="Session in progress" />
      <div className="mx-auto max-w-3xl px-6 pt-3 flex justify-end">
        <NetworkStatus pingIntervalMs={3000} />
      </div>
      <main className="mx-auto max-w-3xl px-6">
        <HumeWidget
          accessToken={accessToken}
          configId={configId}
          candidateName={candidateName}
          cameraEnabled={true}
          onEnd={handleSessionEnd}
        />

        <div className="mt-4 p-6 bg-gray-50 rounded-lg border border-gray-200">
          <h3 className="text-sm font-semibold uppercase tracking-wide text-centro-ink/70 mb-3">
            Read-aloud prompt (Segment 2)
          </h3>
          <p className="text-lg leading-relaxed">
            Centro CDX has been serving global brands for over fifteen years across
            customer service, technical support, and back-office operations. Our agents
            handle thousands of customer interactions every day with empathy, speed, and
            accuracy.
          </p>
        </div>

        <div className="mt-6 mb-32 p-5 bg-amber-50 rounded-lg border border-amber-200 text-sm text-amber-900">
          <strong>Tip:</strong> wait until Maya finishes speaking before you respond.
          Your <strong>full session is being recorded on video</strong> (camera + mic)
          for recruiter review and emotion analysis. The red "REC" badge confirms
          recording is active.
        </div>
      </main>
    </>
  );
}
