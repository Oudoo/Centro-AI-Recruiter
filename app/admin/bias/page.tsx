"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import type { ScreeningSessionRow } from "@/lib/zoho-creator";
import { activeRubric } from "@/lib/rubric";

// Auto-flag threshold: any segment whose pass rate deviates by MORE than this
// percentage-point amount from the overall pass rate gets a warning banner.
const DIVERGENCE_THRESHOLD_PCT = 15;

// Don't flag tiny segments — statistical noise overwhelms signal under this n.
const MIN_SAMPLE_SIZE = 10;

type SegmentBreakdown = {
  key: string;
  label: string;
  count: number;
  passes: number;
  passRate: number; // percentage 0-100
  divergence: number; // signed difference from overall passRate
  avgScore: number;
};

function bucketHour(iso: string): string {
  if (!iso) return "Unknown";
  try {
    const h = new Date(iso).getHours();
    if (h < 6) return "Night (00-06)";
    if (h < 12) return "Morning (06-12)";
    if (h < 18) return "Afternoon (12-18)";
    return "Evening (18-00)";
  } catch {
    return "Unknown";
  }
}

function bucketWeekday(iso: string): string {
  if (!iso) return "Unknown";
  try {
    return new Date(iso).toLocaleString("en-GB", { weekday: "long" });
  } catch {
    return "Unknown";
  }
}

function aggregate(
  sessions: ScreeningSessionRow[],
  keyFn: (s: ScreeningSessionRow) => string,
  overallPassRate: number
): SegmentBreakdown[] {
  const buckets: Record<string, { sessions: ScreeningSessionRow[]; passes: number; totalScore: number }> = {};
  for (const s of sessions) {
    const key = keyFn(s) || "Unknown";
    if (!buckets[key]) buckets[key] = { sessions: [], passes: 0, totalScore: 0 };
    buckets[key].sessions.push(s);
    if (s.passFailRecommendation === "Pass") buckets[key].passes++;
    buckets[key].totalScore += s.overallScore;
  }

  return Object.entries(buckets)
    .map(([key, v]) => {
      const passRate = v.sessions.length > 0 ? (v.passes / v.sessions.length) * 100 : 0;
      return {
        key,
        label: key,
        count: v.sessions.length,
        passes: v.passes,
        passRate,
        divergence: passRate - overallPassRate,
        avgScore: v.sessions.length > 0 ? v.totalScore / v.sessions.length : 0
      };
    })
    .sort((a, b) => b.count - a.count);
}

function distHistogram(
  sessions: ScreeningSessionRow[]
): Array<{ bin: string; count: number; range: string }> {
  const bins: Array<{ bin: string; count: number; range: string; min: number; max: number }> = [
    { bin: "0.00–0.99", count: 0, range: "Auto-reject zone", min: 0, max: 1 },
    { bin: "1.00–1.49", count: 0, range: "Reject zone", min: 1, max: 1.5 },
    { bin: "1.50–1.99", count: 0, range: "Borderline (low)", min: 1.5, max: 2 },
    { bin: "2.00–2.49", count: 0, range: "Borderline", min: 2, max: 2.5 },
    { bin: "2.50–2.99", count: 0, range: "Borderline", min: 2.5, max: 3 },
    { bin: "3.00–3.49", count: 0, range: "Pass-ready", min: 3, max: 3.5 },
    { bin: "3.50–3.99", count: 0, range: "Strong pass", min: 3.5, max: 4 },
    { bin: "4.00–4.49", count: 0, range: "Strong pass", min: 4, max: 4.5 },
    { bin: "4.50–5.00", count: 0, range: "Exceptional", min: 4.5, max: 5.01 }
  ];
  for (const s of sessions) {
    for (const b of bins) {
      if (s.overallScore >= b.min && s.overallScore < b.max) {
        b.count++;
        break;
      }
    }
  }
  return bins.map(({ bin, count, range }) => ({ bin, count, range }));
}

export default function BiasAuditPage() {
  const [sessions, setSessions] = useState<ScreeningSessionRow[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  const load = async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/admin/sessions?limit=1000", { cache: "no-store" });
      const json = await res.json();
      if (json.error) setError(json.error);
      else setSessions(json.sessions ?? []);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void load();
  }, []);

  const stats = useMemo(() => {
    if (!sessions || sessions.length === 0) return null;
    const total = sessions.length;
    const passes = sessions.filter((s) => s.passFailRecommendation === "Pass").length;
    const overallPassRate = (passes / total) * 100;
    const overallAvgScore =
      sessions.reduce((sum, s) => sum + s.overallScore, 0) / total;

    const segments = {
      englishLevel: aggregate(sessions, (s) => s.englishLevel.replace("_", " "), overallPassRate),
      position: aggregate(sessions, (s) => s.candidatePosition || "Unspecified", overallPassRate),
      timeOfDay: aggregate(sessions, (s) => bucketHour(s.completedTime), overallPassRate),
      weekday: aggregate(sessions, (s) => bucketWeekday(s.completedTime), overallPassRate),
      inviteChannel: aggregate(sessions, (s) => s.inviteChannel || "Unknown", overallPassRate)
    };

    // Override patterns
    const overrides = sessions.filter((s) => s.reviewerOverrideApplied);
    const overrideRate = (overrides.length / total) * 100;
    const overrideDeltas = overrides.map((s) => s.reviewerOverrideScore - s.overallScore);
    const meanOverrideDelta =
      overrideDeltas.length > 0
        ? overrideDeltas.reduce((a, b) => a + b, 0) / overrideDeltas.length
        : 0;

    const histogram = distHistogram(sessions);

    // Flag alerts
    const alerts: Array<{
      segment: string;
      label: string;
      passRate: number;
      divergence: number;
      count: number;
    }> = [];
    for (const [segmentName, breakdowns] of Object.entries(segments)) {
      for (const b of breakdowns) {
        if (
          b.count >= MIN_SAMPLE_SIZE &&
          Math.abs(b.divergence) > DIVERGENCE_THRESHOLD_PCT
        ) {
          alerts.push({
            segment: segmentName,
            label: b.label,
            passRate: b.passRate,
            divergence: b.divergence,
            count: b.count
          });
        }
      }
    }
    alerts.sort((a, b) => Math.abs(b.divergence) - Math.abs(a.divergence));

    return {
      total,
      passes,
      overallPassRate,
      overallAvgScore,
      segments,
      overrides: overrides.length,
      overrideRate,
      meanOverrideDelta,
      histogram,
      alerts
    };
  }, [sessions]);

  if (loading) {
    return (
      <main className="px-6 py-24 text-center">
        <div className="inline-block w-12 h-12 border-4 border-centro-primary/20 border-t-centro-primary rounded-full animate-spin" />
        <p className="mt-4 text-sm text-centro-ink/60">Loading bias audit...</p>
      </main>
    );
  }

  if (error) {
    return (
      <main className="px-6 py-12 max-w-2xl mx-auto">
        <h1 className="text-2xl font-bold text-rose-700">Couldn't load data</h1>
        <pre className="mt-4 p-4 bg-rose-50 border border-rose-200 rounded text-sm text-rose-900">
          {error}
        </pre>
      </main>
    );
  }

  if (!sessions || sessions.length === 0 || !stats) {
    return (
      <main className="px-6 py-12 max-w-2xl mx-auto text-center">
        <h1 className="text-2xl font-bold text-centro-primary">
          Not enough data for bias analysis yet
        </h1>
        <p className="mt-3 text-sm text-centro-ink/60">
          Need at least a handful of completed screenings before pass-rate divergence
          patterns are meaningful. Run more screenings from the{" "}
          <Link href="/" className="text-centro-primary underline">
            candidate landing page
          </Link>
          .
        </p>
      </main>
    );
  }

  const minSampleNotice = stats.total < 25;

  return (
    <main className="px-6 py-8 pb-24">
      <div className="flex items-baseline justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-centro-primary">
            Bias defensibility audit
          </h1>
          <p className="text-sm text-centro-ink/65 mt-1">
            Pass-rate divergence across candidate segments. Auto-flags any segment whose
            pass rate is more than <strong>{DIVERGENCE_THRESHOLD_PCT}pp</strong> away
            from the overall mean (sample size ≥ {MIN_SAMPLE_SIZE}).
          </p>
        </div>
        <button
          onClick={load}
          className="text-sm text-centro-primary hover:underline"
        >
          ↻ Refresh
        </button>
      </div>

      {minSampleNotice && (
        <div className="bg-amber-50 border border-amber-200 rounded p-4 text-sm text-amber-900 mb-6">
          <strong>Small sample size warning:</strong> only {stats.total} screenings
          analyzed. Bias signal is unreliable below ~25 sessions. Use this view for
          methodology preview, not for regulatory reporting yet.
        </div>
      )}

      {/* Headline stats */}
      <section className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-6">
        <BigStat label="Total screenings" value={stats.total.toString()} />
        <BigStat
          label="Overall pass rate"
          value={`${stats.overallPassRate.toFixed(1)}%`}
          tone="info"
        />
        <BigStat
          label="Overall avg score"
          value={stats.overallAvgScore.toFixed(2)}
          sub={`out of 5.00 · pass ≥ ${activeRubric.passThreshold}`}
        />
        <BigStat
          label="Recruiter override rate"
          value={`${stats.overrideRate.toFixed(1)}%`}
          sub={`${stats.overrides} of ${stats.total} sessions${stats.overrides > 0 ? ` · Δ ${stats.meanOverrideDelta >= 0 ? "+" : ""}${stats.meanOverrideDelta.toFixed(2)}` : ""}`}
          tone={stats.overrideRate > 30 ? "warn" : "info"}
        />
      </section>

      {/* Alerts band */}
      {stats.alerts.length > 0 ? (
        <section className="bg-rose-50 border-2 border-rose-200 rounded-lg p-5 mb-6">
          <h2 className="text-base font-bold text-rose-900 mb-2 flex items-center gap-2">
            <span className="w-2.5 h-2.5 rounded-full bg-rose-600 animate-pulse" />
            {stats.alerts.length} divergence alert{stats.alerts.length === 1 ? "" : "s"}{" "}
            (&gt; {DIVERGENCE_THRESHOLD_PCT}pp from mean)
          </h2>
          <ul className="space-y-1.5 text-sm text-rose-900/90">
            {stats.alerts.map((a, i) => (
              <li key={i} className="flex items-baseline gap-2">
                <span className="inline-block w-1 h-1 rounded-full bg-rose-600 translate-y-[-2px]" />
                <span>
                  <strong>{a.segment.replace(/([A-Z])/g, " $1").toLowerCase().trim()}</strong>
                  {" → "}
                  <strong>"{a.label}"</strong> passes at{" "}
                  <strong>{a.passRate.toFixed(1)}%</strong> ({a.count} screenings),{" "}
                  <strong>{a.divergence >= 0 ? "+" : ""}{a.divergence.toFixed(1)}pp</strong>{" "}
                  vs. overall {stats.overallPassRate.toFixed(1)}%. Investigate.
                </span>
              </li>
            ))}
          </ul>
        </section>
      ) : (
        <section className="bg-emerald-50 border border-emerald-200 rounded-lg p-5 mb-6">
          <h2 className="text-base font-bold text-emerald-900 mb-1 flex items-center gap-2">
            <span className="w-2.5 h-2.5 rounded-full bg-emerald-500" />
            No divergence alerts
          </h2>
          <p className="text-sm text-emerald-900/85">
            All segments with sample size ≥ {MIN_SAMPLE_SIZE} are within{" "}
            ±{DIVERGENCE_THRESHOLD_PCT}pp of the overall pass rate (
            {stats.overallPassRate.toFixed(1)}%).
          </p>
        </section>
      )}

      {/* Score distribution histogram */}
      <section className="bg-white rounded-lg border border-gray-200 p-6 mb-6">
        <h2 className="text-base font-semibold text-centro-primary mb-3">
          Score distribution
        </h2>
        <p className="text-xs text-centro-ink/60 mb-4">
          Look for unnatural clustering. A healthy distribution forms a rough bell.
          Heavy clustering at one threshold (e.g. all 3.0–3.5) suggests the AI is
          gaming the rubric.
        </p>
        <div className="space-y-1.5">
          {stats.histogram.map((b) => {
            const maxCount = Math.max(...stats.histogram.map((x) => x.count), 1);
            const widthPct = (b.count / maxCount) * 100;
            const color = b.bin.startsWith("0") || b.bin.startsWith("1.")
              ? "bg-rose-300"
              : b.bin.startsWith("2") || b.bin.startsWith("3.0")
                ? "bg-amber-300"
                : "bg-emerald-400";
            return (
              <div key={b.bin} className="flex items-center gap-3">
                <div className="w-24 text-xs tabular-nums text-centro-ink/75">
                  {b.bin}
                </div>
                <div className="flex-1 h-6 bg-gray-50 rounded relative overflow-hidden">
                  <div
                    className={`h-full ${color} transition-all`}
                    style={{ width: `${widthPct}%` }}
                  />
                  <span className="absolute right-2 top-0.5 text-xs font-medium tabular-nums">
                    {b.count}
                  </span>
                </div>
                <div className="w-32 text-xs text-centro-ink/55">{b.range}</div>
              </div>
            );
          })}
        </div>
      </section>

      {/* Segment breakdowns */}
      <SegmentSection
        title="By English level"
        explanation="The single dimension that matters most for a BPO CSA role. If one English bucket passes at a wildly different rate than the others, investigate the rubric calibration."
        breakdowns={stats.segments.englishLevel}
        overallPassRate={stats.overallPassRate}
      />
      <SegmentSection
        title="By position"
        explanation="Pass-rate divergence by the role the candidate applied to. Wide spread may indicate the rubric is mis-tuned for some role types."
        breakdowns={stats.segments.position}
        overallPassRate={stats.overallPassRate}
      />
      <SegmentSection
        title="By time of day"
        explanation="If AI scoring varies by time of day, look for model-load issues, mic quality differences (noise vs. quiet hours), or candidate fatigue patterns."
        breakdowns={stats.segments.timeOfDay}
        overallPassRate={stats.overallPassRate}
      />
      <SegmentSection
        title="By day of week"
        explanation="Should be flat across days. Spikes can signal coaching networks (candidates being prepped) or external events."
        breakdowns={stats.segments.weekday}
        overallPassRate={stats.overallPassRate}
      />
      <SegmentSection
        title="By invite channel"
        explanation="WhatsApp / SMS / Email — proxies for how the candidate was sourced. Large gaps may indicate sourcing-channel quality differences."
        breakdowns={stats.segments.inviteChannel}
        overallPassRate={stats.overallPassRate}
      />

      {/* Methodology footer */}
      <section className="mt-8 rounded-lg border border-centro-primary/20 bg-centro-primary/[0.03] p-5 text-sm text-centro-ink/85">
        <h3 className="font-semibold text-centro-primary mb-2">
          How to read this dashboard
        </h3>
        <ul className="space-y-1.5 text-xs leading-relaxed list-disc list-inside">
          <li>
            <strong>Divergence threshold:</strong> any segment whose pass rate is{" "}
            <strong>more than {DIVERGENCE_THRESHOLD_PCT} percentage points</strong>{" "}
            away from the overall mean is flagged.
          </li>
          <li>
            <strong>Minimum sample size:</strong> we only flag segments with at least{" "}
            <strong>{MIN_SAMPLE_SIZE} screenings</strong>. Below that, divergence is
            indistinguishable from statistical noise.
          </li>
          <li>
            <strong>No protected-class attributes</strong> (race, religion, sexual
            orientation, disability) are stored or used here. Bias surfaces indirectly
            through proxies (English level, position, time, channel).
          </li>
          <li>
            <strong>Override patterns matter:</strong> if recruiters consistently
            override the AI in one direction (e.g. +0.5 above the AI), the rubric needs
            re-tuning. Drift {">"}±0.3 sustained across 25+ sessions = recalibration
            event.
          </li>
          <li>
            <strong>Recommended action on alerts:</strong> (1) re-check the rubric
            against the affected segment's actual transcripts, (2) compare with
            recruiter overrides in that segment, (3) if divergence persists after
            recalibration, escalate to Legal / Compliance.
          </li>
        </ul>
      </section>
    </main>
  );
}

function BigStat({
  label,
  value,
  sub,
  tone
}: {
  label: string;
  value: string;
  sub?: string;
  tone?: "info" | "warn" | "good";
}) {
  const color =
    tone === "warn"
      ? "text-rose-700"
      : tone === "good"
        ? "text-emerald-700"
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

function SegmentSection({
  title,
  explanation,
  breakdowns,
  overallPassRate
}: {
  title: string;
  explanation: string;
  breakdowns: SegmentBreakdown[];
  overallPassRate: number;
}) {
  if (breakdowns.length === 0) return null;
  return (
    <section className="bg-white rounded-lg border border-gray-200 p-6 mb-4">
      <h2 className="text-base font-semibold text-centro-primary">{title}</h2>
      <p className="text-xs text-centro-ink/60 mt-1 mb-4">{explanation}</p>
      <div className="space-y-2">
        {breakdowns.map((b) => {
          const flagged =
            b.count >= MIN_SAMPLE_SIZE && Math.abs(b.divergence) > DIVERGENCE_THRESHOLD_PCT;
          const undersample = b.count < MIN_SAMPLE_SIZE;
          // pass rate bar
          const widthPct = b.passRate;
          // overlay marker for overall pass rate
          return (
            <div
              key={b.key}
              className={`flex items-center gap-3 p-2 rounded ${
                flagged ? "bg-rose-50 ring-1 ring-rose-200" : ""
              }`}
            >
              <div className="w-44 text-sm">
                <p className="font-medium truncate">{b.label}</p>
                <p className="text-[10px] text-centro-ink/55">
                  {b.count} screening{b.count === 1 ? "" : "s"}
                  {undersample && (
                    <span className="text-amber-600 ml-1">(small n)</span>
                  )}
                </p>
              </div>
              <div className="flex-1 h-7 bg-gray-100 rounded relative overflow-hidden">
                <div
                  className={`h-full transition-all ${
                    flagged
                      ? "bg-rose-400"
                      : b.passRate >= 50
                        ? "bg-emerald-400"
                        : b.passRate >= 30
                          ? "bg-sky-400"
                          : "bg-amber-400"
                  }`}
                  style={{ width: `${Math.max(2, widthPct)}%` }}
                />
                {/* Overall pass rate marker */}
                <div
                  className="absolute top-0 bottom-0 w-0.5 bg-centro-ink/40"
                  style={{ left: `${overallPassRate}%` }}
                  title={`Overall ${overallPassRate.toFixed(1)}%`}
                />
                <span className="absolute right-2 top-1 text-xs font-semibold tabular-nums">
                  {b.passRate.toFixed(1)}%
                </span>
              </div>
              <div className="w-28 text-right text-xs tabular-nums">
                <span
                  className={
                    Math.abs(b.divergence) > DIVERGENCE_THRESHOLD_PCT
                      ? "text-rose-700 font-semibold"
                      : "text-centro-ink/65"
                  }
                >
                  {b.divergence >= 0 ? "+" : ""}
                  {b.divergence.toFixed(1)}pp
                </span>
                <p className="text-[10px] text-centro-ink/55">vs. mean</p>
              </div>
              <div className="w-16 text-right text-xs">
                <span className="font-medium tabular-nums text-centro-primary">
                  {b.avgScore.toFixed(2)}
                </span>
                <p className="text-[10px] text-centro-ink/55">avg score</p>
              </div>
            </div>
          );
        })}
      </div>
    </section>
  );
}
