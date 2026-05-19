"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import type { ScreeningSessionRow } from "@/lib/zoho-creator";

// Cost-per-screen baseline for ROI math. These are illustrative — replace with
// Centro's actual blended cost per Hume+Claude+Twilio screen once measured.
const COST_PER_SCREEN_USD = 1.5;
const HUMAN_RECRUITER_COST_PER_CANDIDATE_USD = 4.0; // 30 min × ~$8/hr blended

type ChannelBreakdown = {
  channel: string;
  screens: number;
  passes: number;
  passRate: number;
  avgScore: number;
  totalScreeningCostUsd: number;
  costPerPass: number;
  estimatedHumanHoursSaved: number;
};

export default function SourcingPage() {
  const [sessions, setSessions] = useState<ScreeningSessionRow[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

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

  const data = useMemo(() => {
    if (!sessions || sessions.length === 0) return null;
    const total = sessions.length;
    const overallPasses = sessions.filter(
      (s) => s.passFailRecommendation === "Pass"
    ).length;
    const overallPassRate = (overallPasses / total) * 100;

    const buckets: Record<string, ScreeningSessionRow[]> = {};
    for (const s of sessions) {
      const key = s.inviteChannel || "Unspecified";
      if (!buckets[key]) buckets[key] = [];
      buckets[key].push(s);
    }

    const channels: ChannelBreakdown[] = Object.entries(buckets)
      .map(([channel, list]) => {
        const passes = list.filter((s) => s.passFailRecommendation === "Pass").length;
        const passRate = (passes / list.length) * 100;
        const avgScore =
          list.reduce((sum, s) => sum + s.overallScore, 0) / list.length;
        const totalScreeningCostUsd = list.length * COST_PER_SCREEN_USD;
        const costPerPass =
          passes > 0 ? totalScreeningCostUsd / passes : Number.POSITIVE_INFINITY;
        const estimatedHumanHoursSaved = (list.length * 30) / 60;
        return {
          channel,
          screens: list.length,
          passes,
          passRate,
          avgScore,
          totalScreeningCostUsd,
          costPerPass,
          estimatedHumanHoursSaved
        };
      })
      .sort((a, b) => b.passRate - a.passRate);

    const totalSavedHours = (total * 30) / 60;
    const totalSavedUsd = total * HUMAN_RECRUITER_COST_PER_CANDIDATE_USD;
    const totalSpentUsd = total * COST_PER_SCREEN_USD;

    return {
      total,
      overallPassRate,
      channels,
      totalSavedHours,
      totalSavedUsd,
      totalSpentUsd,
      netSavingsUsd: totalSavedUsd - totalSpentUsd
    };
  }, [sessions]);

  if (loading) {
    return (
      <main className="px-6 py-24 text-center">
        <div className="inline-block w-12 h-12 border-4 border-centro-primary/20 border-t-centro-primary rounded-full animate-spin" />
      </main>
    );
  }

  if (error || !data) {
    return (
      <main className="px-6 py-12 max-w-2xl mx-auto">
        <h1 className="text-2xl font-bold text-centro-primary">Sourcing intelligence</h1>
        <p className="mt-3 text-sm text-centro-ink/65">
          {error ?? "Need at least one screening before sourcing analytics are useful."}
        </p>
      </main>
    );
  }

  return (
    <main className="px-6 py-8 pb-24">
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-centro-primary">
          Sourcing intelligence
        </h1>
        <p className="text-sm text-centro-ink/65 mt-1">
          Pass-rate × source-channel cross-reference, with cost-per-quality-candidate
          math. The data answers "where should we spend our next sourcing dollar?"
        </p>
      </div>

      {/* Top-line ROI */}
      <section className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-8">
        <Tile
          label="Screens run"
          value={data.total.toString()}
          sub="all-time"
        />
        <Tile
          label="Overall pass rate"
          value={`${data.overallPassRate.toFixed(1)}%`}
          tone={data.overallPassRate >= 40 ? "good" : "neutral"}
        />
        <Tile
          label="Recruiter hours saved"
          value={data.totalSavedHours.toFixed(1)}
          sub="hours (vs. 30-min human screens)"
          tone="good"
        />
        <Tile
          label="Estimated net savings"
          value={`$${data.netSavingsUsd.toFixed(0)}`}
          sub={`Saved $${data.totalSavedUsd.toFixed(0)} − spent $${data.totalSpentUsd.toFixed(0)}`}
          tone={data.netSavingsUsd > 0 ? "good" : "warn"}
        />
      </section>

      {/* Channel ROI table */}
      <section className="bg-white rounded-lg border border-gray-200 overflow-hidden mb-6">
        <div className="px-5 py-4 border-b border-gray-100">
          <h2 className="text-base font-semibold text-centro-primary">
            By invite channel
          </h2>
          <p className="text-xs text-centro-ink/60 mt-1">
            <strong>Cost-per-pass</strong> is the key metric: lower = better
            channel-of-origin quality. If WhatsApp pass rate is 50% and SMS is 20% for
            the same screening cost, shift sourcing budget toward whatever feeds
            WhatsApp better (referrals, social).
          </p>
        </div>
        <table className="w-full text-sm">
          <thead className="bg-gray-50 text-centro-ink/70 text-left">
            <tr>
              <th className="px-4 py-2.5">Channel</th>
              <th className="px-4 py-2.5 text-right">Screens</th>
              <th className="px-4 py-2.5 text-right">Passes</th>
              <th className="px-4 py-2.5 text-right">Pass rate</th>
              <th className="px-4 py-2.5 text-right">Avg score</th>
              <th className="px-4 py-2.5 text-right">Screening spend</th>
              <th className="px-4 py-2.5 text-right">Cost / pass</th>
              <th className="px-4 py-2.5 text-right">Hours saved</th>
            </tr>
          </thead>
          <tbody>
            {data.channels.map((c) => {
              const better = c.passRate > data.overallPassRate;
              return (
                <tr key={c.channel} className="border-t border-gray-100">
                  <td className="px-4 py-2.5 font-medium">{c.channel}</td>
                  <td className="px-4 py-2.5 text-right tabular-nums">{c.screens}</td>
                  <td className="px-4 py-2.5 text-right tabular-nums">{c.passes}</td>
                  <td
                    className={`px-4 py-2.5 text-right tabular-nums font-semibold ${
                      better ? "text-emerald-700" : "text-amber-700"
                    }`}
                  >
                    {c.passRate.toFixed(1)}%
                  </td>
                  <td className="px-4 py-2.5 text-right tabular-nums">
                    {c.avgScore.toFixed(2)}
                  </td>
                  <td className="px-4 py-2.5 text-right tabular-nums">
                    ${c.totalScreeningCostUsd.toFixed(2)}
                  </td>
                  <td className="px-4 py-2.5 text-right tabular-nums">
                    {Number.isFinite(c.costPerPass)
                      ? `$${c.costPerPass.toFixed(2)}`
                      : "—"}
                  </td>
                  <td className="px-4 py-2.5 text-right tabular-nums">
                    {c.estimatedHumanHoursSaved.toFixed(1)}h
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </section>

      {/* Methodology */}
      <section className="bg-centro-primary/[0.03] border border-centro-primary/20 rounded-lg p-5">
        <h2 className="text-base font-semibold text-centro-primary mb-2">
          What this dashboard answers
        </h2>
        <ul className="text-xs text-centro-ink/85 space-y-1.5 list-disc list-inside leading-relaxed">
          <li>
            <strong>Which sourcing channel delivers the lowest cost-per-passing-candidate?</strong>{" "}
            That's where to scale up spend.
          </li>
          <li>
            <strong>How many hours of recruiter time is the AI replacing?</strong>{" "}
            Each completed screening ≈ 30 minutes of a human pre-screen call.
          </li>
          <li>
            <strong>Is the AI cost-effective?</strong> Compare "estimated net savings"
            in the headline. Should be strongly positive at production volume.
          </li>
        </ul>
        <p className="mt-3 text-[11px] text-centro-ink/60 leading-relaxed">
          <strong>Assumptions:</strong> $
          {COST_PER_SCREEN_USD.toFixed(2)} blended cost per AI screen (Hume + Claude +
          Anthropic + WorkDrive), 30-min average human pre-screen call at $
          {(HUMAN_RECRUITER_COST_PER_CANDIDATE_USD * 2).toFixed(0)}/hr loaded recruiter
          cost. Adjust constants in <code>app/admin/sourcing/page.tsx</code> as Centro
          measures actuals.
        </p>
      </section>

      <p className="mt-6 text-xs text-centro-ink/55 text-center">
        Once Zoho Recruit OAuth scopes are added,{" "}
        <Link href="/admin/bias" className="text-centro-primary underline">
          /admin/bias
        </Link>{" "}
        will gain Recruit <code>Source</code> segmentation (CareerSite, LinkedIn,
        Referrals, Walk-ins). This page is the cost-flavoured version of that.
      </p>
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
  tone?: "good" | "warn" | "neutral";
}) {
  const color =
    tone === "good"
      ? "text-emerald-700"
      : tone === "warn"
        ? "text-rose-700"
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
