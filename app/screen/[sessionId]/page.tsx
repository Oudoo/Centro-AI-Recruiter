"use client";

import { useEffect, useState, useCallback } from "react";
import { useParams, useRouter, useSearchParams } from "next/navigation";
import { BrandHeader } from "@/components/BrandHeader";
import { HumeWidget, type SessionData, type EndReason } from "@/components/HumeWidget";
import { NetworkStatus } from "@/components/NetworkStatus";
import { saveRecording } from "@/lib/recording";
import { logUsage } from "@/lib/usage";

type CvUploadResult = {
  parsed: {
    fullName: string;
    email: string;
    phone: string;
    education: Array<{ degree: string; institution: string; year: string }>;
    workExperience: Array<{ company: string; role: string; duration: string; description: string }>;
    skills: string[];
    languages: string[];
    certifications: string[];
  };
  nameSimilarity: number;
  discrepancyFlag: boolean;
} | null;

type ScreenPhase = "screening" | "cv_upload" | "scoring";

export default function ScreenPage() {
  const params = useParams();
  const search = useSearchParams();
  const router = useRouter();
  const sessionId = (params.sessionId as string) ?? "";
  const candidateName = search.get("name") ?? "Candidate";
  const candidateEmail = search.get("email") ?? "";
  const cvName = search.get("cvName") ?? "";

  const [accessToken, setAccessToken] = useState<string | null>(null);
  const [configId, setConfigId] = useState<string | null>(null);
  const [phase, setPhase] = useState<ScreenPhase>("screening");
  const [error, setError] = useState<string | null>(null);

  // Pending screening data (held until CV upload completes)
  const [pendingData, setPendingData] = useState<{ data: SessionData; endReason: EndReason } | null>(null);

  // CV upload state
  const [cvFile, setCvFile] = useState<File | null>(null);
  const [cvUploading, setCvUploading] = useState(false);
  const [cvResult, setCvResult] = useState<CvUploadResult>(null);
  const [cvError, setCvError] = useState<string | null>(null);

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

  // Separate helper for executing score API call & routing
  const executeScoring = useCallback(async (data: SessionData, endReason: EndReason, cvRes: CvUploadResult) => {
    setPhase("scoring");
    const startedAtIso = new Date(Date.now() - data.durationSec * 1000).toISOString();
    const endedAtIso = new Date().toISOString();

    try {
      const verifRaw = sessionStorage.getItem(`centro-verification-${sessionId}`);
      const verification = verifRaw ? JSON.parse(verifRaw) : null;

      const res = await fetch("/api/score", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          candidateName,
          candidateEmail,
          cvName: cvRes?.parsed?.fullName || cvName,
          transcript: data.transcript,
          prosodyTimeline: data.prosodyTimeline,
          faceFrames: data.faceFrames.map((f) => ({
            timeOffsetMs: f.timeOffsetMs,
            base64Jpeg: f.base64Jpeg
          })),
          durationSec: data.durationSec,
          endReason,
          verification,
          cvData: cvRes?.parsed ?? null,
          cvNameSimilarity: cvRes?.nameSimilarity ?? null,
          cvDiscrepancyFlag: cvRes?.discrepancyFlag ?? false
        })
      });
      const json = await res.json();
      if (json.error) {
        setError(json.error);
        return;
      }

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
          estimatedHumeFaceMinutes: data.durationSec / 60
        });
      } catch (logErr) {
        console.error("Could not log usage:", logErr);
      }

      sessionStorage.setItem(`centro-score-${sessionId}`, JSON.stringify(json));

      // WorkDrive upload in background
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
    }
  }, [sessionId, candidateName, candidateEmail, cvName, router]);

  // When the Hume session ends, save recording and transition to CV upload phase (or bypass if already uploaded)
  const handleSessionEnd = useCallback(async (data: SessionData, endReason: EndReason) => {
    // Persist the video recording to IndexedDB
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
      return;
    }

    // Check if CV was already uploaded during verify phase
    const cvRaw = sessionStorage.getItem(`centro-cv-${sessionId}`);
    if (cvRaw) {
      try {
        const parsedCv = JSON.parse(cvRaw);
        setCvResult(parsedCv);
        await executeScoring(data, endReason, parsedCv);
        return;
      } catch (err) {
        console.error("Failed to parse pre-uploaded CV from sessionStorage:", err);
      }
    }

    // Hold the data and show CV upload step
    setPendingData({ data, endReason });
    setPhase("cv_upload");
  }, [sessionId, candidateName, candidateEmail, executeScoring]);

  // Handle CV file selection
  const handleCvFile = (file: File) => {
    const allowed = [
      "application/pdf",
      "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
      "application/msword"
    ];
    if (!allowed.some((t) => file.type.includes(t)) && !file.name.match(/\.(pdf|docx?)$/i)) {
      setCvError("Please upload a PDF or DOCX file.");
      return;
    }
    if (file.size > 10_000_000) {
      setCvError("File is too large (max 10MB).");
      return;
    }
    setCvError(null);
    setCvFile(file);
  };

  // Upload and parse the CV
  const uploadCv = async () => {
    if (!cvFile) return;
    setCvUploading(true);
    setCvError(null);
    try {
      const fd = new FormData();
      fd.append("file", cvFile);
      fd.append("idNameEnglish", candidateName);
      fd.append("sessionId", sessionId);

      const res = await fetch("/api/upload-cv", { method: "POST", body: fd });
      const json = await res.json();
      if (json.error) {
        setCvError(json.error);
        setCvUploading(false);
        return;
      }
      setCvResult({
        parsed: json.parsed,
        nameSimilarity: json.nameSimilarity,
        discrepancyFlag: json.discrepancyFlag
      });
    } catch (err) {
      setCvError(err instanceof Error ? err.message : String(err));
    } finally {
      setCvUploading(false);
    }
  };

  // Proceed to scoring (after CV upload or skip)
  const proceedToScoring = async () => {
    if (!pendingData) return;
    await executeScoring(pendingData.data, pendingData.endReason, cvResult);
  };

  // ── ERROR STATE ──
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

  // ── CV UPLOAD PHASE ──
  if (phase === "cv_upload") {
    return (
      <>
        <BrandHeader subtitle="Upload your CV" />
        <main className="mx-auto max-w-2xl px-6 py-10 pb-24">
          <h1 className="text-2xl font-bold text-centro-primary">
            Almost done — upload your CV
          </h1>
          <p className="mt-3 text-sm text-centro-ink/70 leading-relaxed">
            Upload your CV so we can match it against your verified identity and extract
            your professional details. This data is saved alongside your screening for
            recruiter review.
          </p>

          {/* Drop zone */}
          {!cvResult && (
            <label className="mt-6 block border-2 border-dashed border-gray-300 rounded-lg p-10 text-center cursor-pointer hover:border-centro-primary hover:bg-centro-primary/[0.02] transition-colors">
              <input
                type="file"
                accept=".pdf,.doc,.docx,application/pdf,application/msword,application/vnd.openxmlformats-officedocument.wordprocessingml.document"
                onChange={(e) => {
                  const f = e.target.files?.[0];
                  if (f) handleCvFile(f);
                }}
                className="hidden"
              />
              {cvFile ? (
                <div>
                  <div className="text-3xl text-centro-primary/60 mb-2">📄</div>
                  <p className="font-medium text-centro-primary">{cvFile.name}</p>
                  <p className="text-xs text-centro-ink/55 mt-1">
                    {(cvFile.size / 1_000_000).toFixed(1)} MB · Click to replace
                  </p>
                </div>
              ) : (
                <div>
                  <div className="text-4xl text-centro-primary/40 mb-2">📋</div>
                  <p className="font-medium text-centro-primary">
                    Drop your CV here or click to browse
                  </p>
                  <p className="text-xs text-centro-ink/55 mt-1">PDF or DOCX — under 10MB</p>
                </div>
              )}
            </label>
          )}

          {cvError && (
            <div className="mt-4 p-3 rounded bg-rose-50 border border-rose-200 text-sm text-rose-900">
              {cvError}
            </div>
          )}

          {/* Parsed CV preview */}
          {cvResult && (
            <div className="mt-6 border border-gray-200 bg-gray-50/50 rounded-lg p-5">
              <h3 className="text-xs font-bold text-centro-primary mb-3 uppercase tracking-wider">
                Extracted CV Data (Preview)
              </h3>

              {cvResult.discrepancyFlag && (
                <div className="mb-4 p-3 rounded bg-amber-50 border border-amber-200 text-sm text-amber-900">
                  <strong>⚠ Name discrepancy detected:</strong> CV name "{cvResult.parsed.fullName}" differs
                  from ID name "{candidateName}" (similarity: {cvResult.nameSimilarity.toFixed(0)}%).
                  This has been flagged for recruiter review.
                </div>
              )}

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 text-sm">
                <Field label="Full Name" value={cvResult.parsed.fullName} />
                <Field label="Email" value={cvResult.parsed.email} />
                <Field label="Phone" value={cvResult.parsed.phone} />
                <Field
                  label="Education"
                  value={
                    cvResult.parsed.education.length > 0
                      ? cvResult.parsed.education
                          .map((e) => `${e.degree} — ${e.institution} (${e.year})`)
                          .join("\n")
                      : "Not found"
                  }
                />
                <Field
                  label="Work Experience"
                  value={
                    cvResult.parsed.workExperience.length > 0
                      ? cvResult.parsed.workExperience
                          .map((w) => `${w.role} at ${w.company} (${w.duration})`)
                          .join("\n")
                      : "Not found"
                  }
                />
                <Field
                  label="Skills"
                  value={cvResult.parsed.skills.join(", ") || "Not found"}
                />
                <Field
                  label="Languages"
                  value={cvResult.parsed.languages.join(", ") || "Not found"}
                />
                <Field
                  label="Certifications"
                  value={cvResult.parsed.certifications.join(", ") || "Not found"}
                />
              </div>
            </div>
          )}

          <div className="mt-6 flex flex-wrap gap-3">
            {!cvResult && cvFile && (
              <button
                onClick={uploadCv}
                disabled={cvUploading}
                className="centro-btn"
              >
                {cvUploading ? "Parsing CV..." : "Upload & parse CV →"}
              </button>
            )}

            {cvResult && (
              <button onClick={proceedToScoring} className="centro-btn">
                Continue to scoring →
              </button>
            )}

            <button
              onClick={proceedToScoring}
              className="px-4 py-2 rounded text-sm font-medium text-centro-ink/70 hover:bg-gray-50"
            >
              {cvResult ? "" : "Skip CV upload →"}
            </button>
          </div>

          <p className="mt-6 text-xs text-centro-ink/50">
            <strong>Privacy:</strong> your CV is processed by Claude AI for field extraction
            and is not stored beyond this session unless you proceed.
          </p>
        </main>
      </>
    );
  }

  // ── SCORING PHASE ──
  if (phase === "scoring") {
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

  // ── LOADING TOKEN ──
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

  // ── SCREENING PHASE ──
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

function Field({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <label className="block text-[10px] font-bold text-centro-ink/50 uppercase mb-1">
        {label}
      </label>
      <p className="text-sm text-centro-ink/80 whitespace-pre-line">
        {value || "—"}
      </p>
    </div>
  );
}
