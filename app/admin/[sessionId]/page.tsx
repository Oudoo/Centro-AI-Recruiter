"use client";

import { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import Link from "next/link";
import type { ScreeningSessionRow } from "@/lib/zoho-creator";
import { StatusBadge, ScoreCell } from "@/components/admin/StatusBadge";
import { activeRubric } from "@/lib/rubric";

function scoreColor(s: number): string {
  if (s >= 4.0) return "from-emerald-500 to-emerald-700";
  if (s >= 3.0) return "from-sky-500 to-sky-700";
  if (s >= 2.0) return "from-amber-500 to-amber-700";
  return "from-rose-500 to-rose-700";
}

function pct(s: number): number {
  return Math.round((s / 5) * 100);
}

function fmtDate(iso: string): string {
  if (!iso) return "—";
  try {
    return new Date(iso).toLocaleString("en-GB", {
      day: "2-digit",
      month: "short",
      year: "numeric",
      hour: "2-digit",
      minute: "2-digit"
    });
  } catch {
    return iso.slice(0, 16);
  }
}

export default function CandidateDetailPage() {
  const params = useParams();
  const router = useRouter();
  const sessionId = (params.sessionId as string) ?? "";

  const [session, setSession] = useState<ScreeningSessionRow | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [overrideOpen, setOverrideOpen] = useState(false);

  const load = async () => {
    setLoading(true);
    try {
      const res = await fetch(`/api/admin/sessions/${sessionId}`, { cache: "no-store" });
      const json = await res.json();
      if (json.error) setError(json.error);
      else setSession(json.session);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (sessionId) void load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sessionId]);

  if (loading) {
    return (
      <main className="px-6 py-24 text-center">
        <div className="inline-block w-12 h-12 border-4 border-centro-primary/20 border-t-centro-primary rounded-full animate-spin" />
        <p className="mt-4 text-sm text-centro-ink/60">Loading candidate...</p>
      </main>
    );
  }

  if (error || !session) {
    return (
      <main className="px-6 py-12 max-w-2xl mx-auto">
        <h1 className="text-2xl font-bold text-rose-700">Couldn't load candidate</h1>
        <pre className="mt-4 p-4 bg-rose-50 border border-rose-200 rounded text-sm text-rose-900">
          {error || "Session not found in Creator."}
        </pre>
        <Link
          href="/admin"
          className="mt-6 inline-block text-centro-primary hover:underline"
        >
          ← Back to candidates
        </Link>
      </main>
    );
  }

  const dims = activeRubric.weightedDimensions;
  const dimensions = [
    { key: "fluency", label: "Fluency", value: session.fluencyScore, weight: dims.fluency.weight },
    { key: "composure", label: "Composure", value: session.composureScore, weight: dims.composure.weight },
    { key: "eq", label: "EQ", value: session.eqScore, weight: dims.eq.weight },
    { key: "confidence", label: "Confidence", value: session.confidenceScore, weight: dims.confidence.weight }
  ];

  return (
    <main className="px-6 py-8 pb-24">
      <div className="mb-6">
        <Link
          href="/admin"
          className="text-sm text-centro-primary hover:underline inline-flex items-center gap-1"
        >
          ← Back to candidates
        </Link>
      </div>

      {/* Candidate identity strip */}
      <div className="flex flex-wrap items-start justify-between gap-4 mb-6 bg-white rounded-lg border border-gray-200 p-6">
        <div>
          <h1 className="text-3xl font-bold text-centro-primary">
            {session.candidateName || "Unnamed candidate"}
          </h1>
          <div className="mt-2 grid grid-cols-1 md:grid-cols-2 gap-x-8 gap-y-1 text-sm text-centro-ink/70">
            <p>
              <strong>Email:</strong> {session.candidateEmail || "—"}
            </p>
            <p>
              <strong>Phone:</strong> {session.candidatePhone || "—"}
            </p>
            <p>
              <strong>Position:</strong> {session.candidatePosition || "—"}
            </p>
            <p>
              <strong>Recruit ID:</strong>{" "}
              {session.candidateRecruitId ? (
                <code className="text-xs">{session.candidateRecruitId}</code>
              ) : (
                "—"
              )}
            </p>
            <p>
              <strong>Completed:</strong> {fmtDate(session.completedTime)}
            </p>
            <p>
              <strong>Session status:</strong>{" "}
              <span className="inline-flex items-center gap-1.5">
                <span
                  className={`w-1.5 h-1.5 rounded-full ${
                    session.sessionStatus === "Completed"
                      ? "bg-emerald-500"
                      : "bg-amber-500"
                  }`}
                />
                {session.sessionStatus.replace("_", " ")}
              </span>
            </p>
          </div>
        </div>
        <div className="flex flex-col items-end gap-2 text-right">
          <StatusBadge
            recommendation={session.passFailRecommendation}
            overall={session.overallScore}
            size="md"
          />
          {session.reviewerOverrideApplied && (
            <span className="text-[10px] font-semibold text-purple-700 bg-purple-100 px-2 py-1 rounded">
              ✎ OVERRIDDEN by {session.reviewerEmail || "reviewer"}
            </span>
          )}
          {/* Identity verification badge */}
          {session.verifiedIdentity ? (
            <span
              className="text-[10px] font-semibold text-emerald-800 bg-emerald-100 ring-1 ring-emerald-300 px-2 py-1 rounded"
              title={`Verified via ${session.verificationMethod} at ${session.verificationConfidence.toFixed(1)}% confidence`}
            >
              ✓ ID VERIFIED ({session.verificationConfidence.toFixed(1)}%)
            </span>
          ) : session.verificationMethod && session.verificationMethod !== "Skipped" ? (
            <span
              className="text-[10px] font-semibold text-amber-800 bg-amber-100 ring-1 ring-amber-300 px-2 py-1 rounded"
              title="Verification attempted but did not pass — needs recruiter review"
            >
              ⚠ ID UNVERIFIED — REVIEW NEEDED
            </span>
          ) : (
            <span className="text-[10px] font-medium text-centro-ink/55 bg-gray-100 px-2 py-1 rounded">
              ID verification skipped
            </span>
          )}
        </div>
      </div>

      {/* Overall + recording side-by-side */}
      <div className="grid grid-cols-1 lg:grid-cols-5 gap-4 mb-6">
        {/* Overall score */}
        <div
          className={`lg:col-span-2 rounded-2xl shadow-lg overflow-hidden bg-gradient-to-br ${scoreColor(
            session.overallScore
          )} text-white`}
        >
          <div className="p-6">
            <p className="text-xs uppercase tracking-widest opacity-80">
              Overall Score
            </p>
            <div className="flex items-baseline gap-2 mt-1">
              <span className="text-7xl font-black tabular-nums leading-none">
                {session.overallScore.toFixed(2)}
              </span>
              <span className="text-2xl opacity-60">/5</span>
            </div>
            <p className="mt-2 text-sm opacity-90">
              {pct(session.overallScore)}% on the rubric
            </p>
            <div className="mt-4 h-2 rounded-full bg-white/20 overflow-hidden">
              <div
                className="h-full bg-white/80"
                style={{ width: `${pct(session.overallScore)}%` }}
              />
            </div>
            <p className="mt-2 text-xs opacity-75">
              Pass ≥ {activeRubric.passThreshold.toFixed(2)} ·
              {session.overallScore >= activeRubric.passThreshold
                ? ` +${(session.overallScore - activeRubric.passThreshold).toFixed(2)} above`
                : ` ${(activeRubric.passThreshold - session.overallScore).toFixed(2)} short`}
            </p>
          </div>
          <div className="bg-black/15 px-6 py-3 text-sm">
            <strong>English level:</strong>{" "}
            {session.englishLevel.replace("_", " ") || "—"}
          </div>
        </div>

        {/* Recording */}
        <div className="lg:col-span-3 rounded-lg border border-gray-200 bg-white p-6">
          <h2 className="text-base font-semibold text-centro-primary mb-3">
            Session recording
          </h2>
          {session.recordingUrl ? (
            <>
              <div className="aspect-video rounded-md overflow-hidden bg-black flex items-center justify-center">
                <a
                  href={session.recordingUrl}
                  target="_blank"
                  rel="noreferrer"
                  className="inline-flex flex-col items-center gap-2 text-white/80 hover:text-white"
                >
                  <span className="w-16 h-16 rounded-full bg-white/20 flex items-center justify-center text-2xl">
                    ▶
                  </span>
                  <span className="text-sm">Open in Zoho WorkDrive ↗</span>
                </a>
              </div>
              <p className="mt-3 text-xs text-centro-ink/55 break-all">
                {session.recordingUrl}
              </p>
            </>
          ) : (
            <div className="aspect-video rounded-md bg-gray-50 border border-gray-200 flex items-center justify-center text-sm text-centro-ink/55">
              No recording linked to this session yet.
            </div>
          )}
        </div>
      </div>

      {/* Dimension tiles */}
      <section className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-6">
        {dimensions.map((d) => {
          const contribution = d.value * d.weight;
          return (
            <div
              key={d.key}
              className={`rounded-lg p-5 bg-gradient-to-br ${scoreColor(d.value)} text-white`}
            >
              <p className="text-xs uppercase tracking-widest opacity-80 font-medium">
                {d.label}
              </p>
              <div className="flex items-baseline gap-1.5 mt-1.5">
                <span className="text-5xl font-black tabular-nums leading-none">
                  {d.value.toFixed(2)}
                </span>
                <span className="text-base opacity-60">/5</span>
              </div>
              <p className="mt-3 text-[10px] uppercase tracking-wider opacity-80">
                Weight {Math.round(d.weight * 100)}% · Contributes{" "}
                <strong>{contribution.toFixed(2)}</strong>
              </p>
            </div>
          );
        })}
      </section>

      {/* AI rationale */}
      <section className="bg-white rounded-lg border border-gray-200 p-6 mb-6">
        <h2 className="text-base font-semibold text-centro-primary mb-3">
          AI rationale (recruiter summary)
        </h2>
        <p className="text-sm text-centro-ink/85 leading-relaxed whitespace-pre-wrap">
          {session.aiRationaleSummary || "—"}
        </p>
      </section>

      {/* Existing override (if any) */}
      {session.reviewerOverrideApplied && (
        <section className="bg-purple-50 rounded-lg border border-purple-200 p-6 mb-6">
          <h2 className="text-base font-semibold text-purple-900 mb-3">
            Recruiter override on file
          </h2>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-3 text-sm text-purple-900/90 mb-3">
            <div>
              <strong className="block text-xs uppercase tracking-wider opacity-70">
                Override score
              </strong>
              <span className="text-2xl font-bold tabular-nums">
                {session.reviewerOverrideScore.toFixed(2)}
              </span>
            </div>
            <div>
              <strong className="block text-xs uppercase tracking-wider opacity-70">
                Reviewer
              </strong>
              {session.reviewerEmail || "—"}
            </div>
            <div>
              <strong className="block text-xs uppercase tracking-wider opacity-70">
                Reviewed
              </strong>
              {fmtDate(session.reviewedTime)}
            </div>
          </div>
          <p className="text-sm text-purple-900/85 whitespace-pre-wrap">
            <strong>Reason:</strong> {session.reviewerOverrideReason || "—"}
          </p>
        </section>
      )}

      {/* Action bar */}
      <section className="bg-white rounded-lg border border-gray-200 p-4 mb-6 flex flex-wrap gap-3">
        <button
          onClick={() => setOverrideOpen(true)}
          className="centro-btn"
        >
          {session.reviewerOverrideApplied ? "Edit override" : "Override score"}
        </button>
        <button
          disabled
          className="rounded-md border-2 border-emerald-300 text-emerald-700 px-6 py-3 font-medium opacity-60 cursor-not-allowed"
          title="Phase 1F wiring"
        >
          Approve for human interview
        </button>
        <button
          disabled
          className="rounded-md border-2 border-rose-300 text-rose-700 px-6 py-3 font-medium opacity-60 cursor-not-allowed"
          title="Phase 1F wiring"
        >
          Reject
        </button>
        {session.candidateRecruitId && (
          <a
            href={`https://recruit.zoho.com/recruit/Candidate?recordId=${session.candidateRecruitId}`}
            target="_blank"
            rel="noreferrer"
            className="rounded-md border border-gray-300 text-centro-ink/75 px-6 py-3 font-medium hover:bg-gray-50"
          >
            Open in Recruit ↗
          </a>
        )}
      </section>

      {/* Full AI rationale */}
      {session.aiRationaleFull && (
        <section className="bg-white rounded-lg border border-gray-200 mb-4">
          <details open>
            <summary className="cursor-pointer px-6 py-4 text-base font-semibold text-centro-primary list-none flex items-center justify-between">
              <span>Full AI rationale (narrative)</span>
              <span className="text-xs">▾</span>
            </summary>
            <div className="px-6 pb-6 pt-2 border-t border-gray-100">
              <p className="text-sm text-centro-ink/85 whitespace-pre-wrap leading-relaxed">
                {session.aiRationaleFull}
              </p>
            </div>
          </details>
        </section>
      )}

      {/* Transcript */}
      <section className="bg-white rounded-lg border border-gray-200">
        <details>
          <summary className="cursor-pointer px-6 py-4 text-base font-semibold text-centro-primary list-none flex items-center justify-between">
            <span>
              Full transcript
              {session.fullTranscript && (
                <span className="ml-2 text-xs font-normal text-centro-ink/55">
                  ({session.fullTranscript.split("\n").length} lines ·{" "}
                  {session.fullTranscript.length.toLocaleString()} chars)
                </span>
              )}
            </span>
            <span className="text-xs">▾</span>
          </summary>
          <div className="px-6 pb-6 pt-2 border-t border-gray-100">
            {session.fullTranscript ? (
              <pre className="text-xs text-centro-ink/80 whitespace-pre-wrap font-sans leading-relaxed">
                {session.fullTranscript}
              </pre>
            ) : (
              <p className="text-sm text-centro-ink/55 italic">
                No transcript stored for this session.
              </p>
            )}
          </div>
        </details>
      </section>

      {/* Override modal */}
      {overrideOpen && (
        <OverrideModal
          session={session}
          onClose={() => setOverrideOpen(false)}
          onSaved={() => {
            setOverrideOpen(false);
            void load();
          }}
        />
      )}
    </main>
  );
}

function OverrideModal({
  session,
  onClose,
  onSaved
}: {
  session: ScreeningSessionRow;
  onClose: () => void;
  onSaved: () => void;
}) {
  const [score, setScore] = useState<string>(
    session.reviewerOverrideApplied
      ? session.reviewerOverrideScore.toFixed(2)
      : session.overallScore.toFixed(2)
  );
  const [reason, setReason] = useState(session.reviewerOverrideReason || "");
  const [reviewerEmail, setReviewerEmail] = useState(session.reviewerEmail || "");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const valid =
    /^([0-9]|[1-4]\.[0-9]+|5\.0+|5)$/.test(score) &&
    reason.trim().length >= 10 &&
    /@/.test(reviewerEmail);

  const submit = async () => {
    if (!valid) return;
    setSubmitting(true);
    setError(null);
    try {
      const res = await fetch(`/api/admin/sessions/${session.id}/override`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          newScore: parseFloat(score),
          reason: reason.trim(),
          reviewerEmail: reviewerEmail.trim()
        })
      });
      const json = await res.json();
      if (json.error) {
        setError(json.error);
        return;
      }
      onSaved();
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-black/60 z-50 flex items-center justify-center p-6">
      <div className="bg-white rounded-lg shadow-2xl max-w-xl w-full max-h-[90vh] overflow-y-auto">
        <div className="px-6 py-4 border-b border-gray-100 flex items-center justify-between">
          <h2 className="text-lg font-semibold text-centro-primary">
            {session.reviewerOverrideApplied ? "Edit" : "Apply"} score override
          </h2>
          <button
            onClick={onClose}
            className="text-centro-ink/60 hover:text-centro-ink text-xl"
          >
            ×
          </button>
        </div>
        <div className="px-6 py-5 space-y-4">
          <div className="bg-amber-50 border border-amber-200 rounded p-3 text-xs text-amber-900">
            <strong>AI score:</strong> {session.overallScore.toFixed(2)} ·{" "}
            <strong>Recommendation:</strong>{" "}
            {session.passFailRecommendation.replace("_", " ")}
            <br />
            <span className="opacity-80">
              Your override replaces this for routing decisions. The original AI score
              stays on file for calibration analysis.
            </span>
          </div>

          <div>
            <label className="block text-xs font-medium uppercase tracking-wider text-centro-ink/65 mb-1">
              New overall score (0.00 – 5.00)
            </label>
            <input
              type="text"
              value={score}
              onChange={(e) => setScore(e.target.value)}
              className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm focus:border-centro-primary focus:outline-none focus:ring-1 focus:ring-centro-primary tabular-nums"
            />
          </div>

          <div>
            <label className="block text-xs font-medium uppercase tracking-wider text-centro-ink/65 mb-1">
              Reason (required, min 10 chars — for audit trail)
            </label>
            <textarea
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              rows={4}
              placeholder="Explain why you're overriding the AI score. This is the legal defense if a candidate ever challenges the decision."
              className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm focus:border-centro-primary focus:outline-none focus:ring-1 focus:ring-centro-primary"
            />
          </div>

          <div>
            <label className="block text-xs font-medium uppercase tracking-wider text-centro-ink/65 mb-1">
              Your email (reviewer)
            </label>
            <input
              type="email"
              value={reviewerEmail}
              onChange={(e) => setReviewerEmail(e.target.value)}
              placeholder="recruiter@centrocdx.com"
              className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm focus:border-centro-primary focus:outline-none focus:ring-1 focus:ring-centro-primary"
            />
          </div>

          {error && (
            <div className="bg-rose-50 border border-rose-200 rounded p-3 text-xs text-rose-900">
              {error}
            </div>
          )}
        </div>
        <div className="px-6 py-4 border-t border-gray-100 flex justify-end gap-3">
          <button
            onClick={onClose}
            className="px-4 py-2 rounded text-sm font-medium text-centro-ink/75 hover:bg-gray-50"
          >
            Cancel
          </button>
          <button
            onClick={submit}
            disabled={!valid || submitting}
            className="centro-btn"
          >
            {submitting ? "Saving..." : "Save override"}
          </button>
        </div>
      </div>
    </div>
  );
}
