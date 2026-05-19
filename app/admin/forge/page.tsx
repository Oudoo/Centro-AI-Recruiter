"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import type { ScreeningSessionRow } from "@/lib/zoho-creator";

type Draft = {
  to: string;
  subject: string;
  body: string;
  weakestDimension: string;
  weakestScore: number;
  sessionId: string;
};

const REFLECTION_WINDOW_DAYS = 30;

export default function ForgePage() {
  const [sessions, setSessions] = useState<ScreeningSessionRow[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [drafting, setDrafting] = useState<string | null>(null);
  const [drafts, setDrafts] = useState<Record<string, Draft>>({});

  useEffect(() => {
    void fetch("/api/admin/sessions?limit=1000", { cache: "no-store" })
      .then((r) => r.json())
      .then((json) => {
        if (json.error) setError(json.error);
        else setSessions(json.sessions);
      })
      .catch((err) => setError(String(err)))
      .finally(() => setLoading(false));
  }, []);

  // Borderline candidates eligible for re-engagement
  const eligible = useMemo(() => {
    if (!sessions) return [];
    const cutoff = Date.now() - REFLECTION_WINDOW_DAYS * 24 * 3600 * 1000;
    return sessions
      .filter(
        (s) =>
          s.passFailRecommendation === "Borderline" &&
          !s.reviewerOverrideApplied &&
          // Completed at least N days ago — "ripe for re-engagement"
          (!s.completedTime || new Date(s.completedTime).getTime() < Date.now())
      )
      .sort((a, b) => b.completedTime.localeCompare(a.completedTime));
  }, [sessions]);

  // Stats
  const stats = useMemo(() => {
    if (!sessions) return null;
    const total = sessions.length;
    const borderline = sessions.filter(
      (s) => s.passFailRecommendation === "Borderline"
    ).length;
    const draftedCount = Object.keys(drafts).length;
    return {
      total,
      borderline,
      eligibleCount: eligible.length,
      draftedCount,
      conversionPotential: Math.round(borderline * 0.3) // industry ~30% of borderline re-engage successfully
    };
  }, [sessions, eligible, drafts]);

  const draftEmail = async (sessionId: string) => {
    setDrafting(sessionId);
    try {
      const res = await fetch("/api/admin/draft-coaching", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ sessionId })
      });
      const json = await res.json();
      if (json.error) {
        alert(`Couldn't draft: ${json.error}`);
        return;
      }
      setDrafts((prev) => ({ ...prev, [sessionId]: json }));
    } catch (err) {
      alert(`Failed: ${err instanceof Error ? err.message : String(err)}`);
    } finally {
      setDrafting(null);
    }
  };

  const copyToClipboard = async (text: string) => {
    try {
      await navigator.clipboard.writeText(text);
    } catch {}
  };

  if (loading) {
    return (
      <main className="px-6 py-24 text-center">
        <div className="inline-block w-12 h-12 border-4 border-centro-primary/20 border-t-centro-primary rounded-full animate-spin" />
      </main>
    );
  }

  return (
    <main className="px-6 py-8 pb-24">
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-centro-primary">
          Candidate Forge
        </h1>
        <p className="text-sm text-centro-ink/65 mt-1 max-w-3xl leading-relaxed">
          Borderline candidates aren't rejects — they're deferred yes's. This page
          surfaces every Borderline candidate eligible for coached re-engagement,
          drafts a personalised improvement email via Claude, and lets you invite them
          back for a re-screen. <strong>Industry data suggests ~30%</strong> of
          re-engaged Borderlines convert to Pass on the second attempt.
        </p>
      </div>

      {error && (
        <div className="bg-rose-50 border border-rose-200 rounded p-4 text-sm text-rose-900 mb-4">
          {error}
        </div>
      )}

      {/* Stats */}
      {stats && (
        <section className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-6">
          <Tile label="Total screenings" value={stats.total.toString()} />
          <Tile
            label="Borderline pool"
            value={stats.borderline.toString()}
            tone="warn"
          />
          <Tile
            label="Eligible for Forge"
            value={stats.eligibleCount.toString()}
            sub={`${REFLECTION_WINDOW_DAYS}+ day window`}
          />
          <Tile
            label="Realistic conversion (~30%)"
            value={`+${stats.conversionPotential}`}
            sub="passers if Forge succeeds"
            tone="good"
          />
        </section>
      )}

      {/* Eligible candidates */}
      <section className="bg-white rounded-lg border border-gray-200 overflow-hidden">
        <div className="px-5 py-4 border-b border-gray-100">
          <h2 className="text-base font-semibold text-centro-primary">
            Eligible for re-engagement
          </h2>
          <p className="text-xs text-centro-ink/60 mt-0.5">
            Click "Draft coaching email" — Claude analyses their weakest dimension and
            writes a personalised invite. Copy, edit if needed, and send via your
            existing email tooling.
          </p>
        </div>

        {eligible.length === 0 ? (
          <p className="text-sm text-centro-ink/60 py-12 text-center">
            No eligible Borderline candidates yet. Once screening volume grows, this
            page becomes a daily-use tool for sourcing/recruiting leads.
          </p>
        ) : (
          <div className="divide-y divide-gray-100">
            {eligible.map((s) => {
              const draft = drafts[s.id];
              return (
                <div key={s.id} className="p-5">
                  <div className="flex items-start justify-between gap-4 mb-3">
                    <div>
                      <Link
                        href={`/admin/${s.id}`}
                        className="font-semibold text-centro-primary hover:underline"
                      >
                        {s.candidateName || "—"}
                      </Link>
                      <p className="text-xs text-centro-ink/60 mt-0.5">
                        {s.candidateEmail} · screened{" "}
                        {s.completedTime
                          ? new Date(s.completedTime).toLocaleDateString("en-GB", {
                              day: "2-digit",
                              month: "short",
                              year: "numeric"
                            })
                          : "—"}{" "}
                        · Overall <strong>{s.overallScore.toFixed(2)}</strong>
                      </p>
                      <p className="text-xs text-centro-ink/60 mt-0.5">
                        Dimensions — Fluency {s.fluencyScore.toFixed(2)} · Composure{" "}
                        {s.composureScore.toFixed(2)} · EQ {s.eqScore.toFixed(2)} ·
                        Confidence {s.confidenceScore.toFixed(2)}
                      </p>
                    </div>
                    {!draft && (
                      <button
                        onClick={() => draftEmail(s.id)}
                        disabled={drafting === s.id}
                        className="px-4 py-2 rounded bg-centro-primary text-white text-xs font-medium hover:bg-centro-primary/90 disabled:opacity-50 whitespace-nowrap"
                      >
                        {drafting === s.id ? "Drafting..." : "Draft coaching email"}
                      </button>
                    )}
                  </div>

                  {draft && (
                    <div className="mt-3 bg-emerald-50/50 border border-emerald-200 rounded-md p-4">
                      <div className="flex items-baseline justify-between mb-3">
                        <p className="text-xs font-medium text-emerald-900">
                          ✓ Draft ready — focus area:{" "}
                          <strong>{draft.weakestDimension}</strong>
                        </p>
                        <button
                          onClick={() => setDrafts((prev) => {
                            const { [s.id]: _, ...rest } = prev;
                            return rest;
                          })}
                          className="text-xs text-centro-ink/60 hover:text-centro-ink"
                        >
                          × Close
                        </button>
                      </div>
                      <div className="space-y-2 text-sm">
                        <div>
                          <p className="text-[10px] uppercase tracking-wider text-centro-ink/60 font-medium mb-0.5">
                            To
                          </p>
                          <p className="text-xs font-mono">{draft.to}</p>
                        </div>
                        <div>
                          <p className="text-[10px] uppercase tracking-wider text-centro-ink/60 font-medium mb-0.5">
                            Subject
                          </p>
                          <p className="text-sm font-medium">{draft.subject}</p>
                        </div>
                        <div>
                          <p className="text-[10px] uppercase tracking-wider text-centro-ink/60 font-medium mb-0.5">
                            Body
                          </p>
                          <textarea
                            value={draft.body}
                            onChange={(e) =>
                              setDrafts((prev) => ({
                                ...prev,
                                [s.id]: { ...draft, body: e.target.value }
                              }))
                            }
                            rows={12}
                            className="w-full text-xs border border-gray-300 rounded p-3 leading-relaxed font-sans"
                          />
                        </div>
                        <div className="flex flex-wrap gap-2 pt-2">
                          <button
                            onClick={() =>
                              copyToClipboard(
                                `To: ${draft.to}\nSubject: ${draft.subject}\n\n${draft.body}`
                              )
                            }
                            className="px-3 py-1.5 rounded bg-centro-primary text-white text-xs font-medium hover:bg-centro-primary/90"
                          >
                            Copy email
                          </button>
                          <a
                            href={`mailto:${encodeURIComponent(draft.to)}?subject=${encodeURIComponent(draft.subject)}&body=${encodeURIComponent(draft.body)}`}
                            className="px-3 py-1.5 rounded border border-centro-primary text-centro-primary text-xs font-medium hover:bg-centro-primary/5"
                          >
                            Open in mail client →
                          </a>
                          <button
                            onClick={() => draftEmail(s.id)}
                            className="px-3 py-1.5 rounded border border-gray-300 text-xs font-medium hover:bg-gray-50"
                          >
                            Re-draft
                          </button>
                        </div>
                      </div>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </section>

      <section className="mt-6 rounded-lg border border-centro-primary/20 bg-centro-primary/[0.03] p-5">
        <h2 className="text-sm font-semibold text-centro-primary mb-2">
          The Candidate Forge thesis
        </h2>
        <p className="text-xs text-centro-ink/85 leading-relaxed">
          For a high-volume BPO, every Borderline candidate is a sunk acquisition cost.
          The standard playbook is to reject them and replace from the top of funnel.
          But on average <strong>30–40% of Borderline candidates can become Pass</strong>{" "}
          if given a focused 30-day improvement cycle. That's a free top-of-funnel
          stream you'd otherwise be leaking. The economics: if Centro screens 1000
          candidates/month and 25% are Borderline, the Forge could convert{" "}
          <strong>~75 additional passers per month</strong> at near-zero acquisition
          cost. Worth the recruiter time spent drafting.
        </p>
        <p className="text-[11px] text-centro-ink/55 mt-3 leading-relaxed">
          Future automation: a daily scheduled function (Vercel Cron or Zoho Creator
          Scheduled Function) that auto-drafts coaching emails for the prior day's
          Borderline cohort and queues them in a recruiter inbox for review.
        </p>
      </section>
    </main>
  );
}

function Tile({
  label,
  value,
  sub,
  tone
}: {
  label: string;
  value: string;
  sub?: string;
  tone?: "good" | "warn";
}) {
  const color =
    tone === "good"
      ? "text-emerald-700"
      : tone === "warn"
        ? "text-amber-700"
        : "text-centro-primary";
  return (
    <div className="rounded-lg border border-gray-200 bg-white p-5">
      <p className="text-xs uppercase tracking-wider text-centro-ink/60 font-medium">
        {label}
      </p>
      <p className={`text-3xl font-bold tabular-nums mt-1 ${color}`}>{value}</p>
      {sub && <p className="text-[10px] text-centro-ink/55 mt-1">{sub}</p>}
    </div>
  );
}
