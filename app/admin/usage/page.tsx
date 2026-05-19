"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { BrandHeader } from "@/components/BrandHeader";
import {
  listUsage,
  summarize,
  clearUsage,
  type UsageRecord,
  type UsageSummary
} from "@/lib/usage";

function formatDuration(sec: number): string {
  const h = Math.floor(sec / 3600);
  const m = Math.floor((sec % 3600) / 60);
  const s = Math.round(sec % 60);
  if (h > 0) return `${h}h ${m}m ${s}s`;
  if (m > 0) return `${m}m ${s}s`;
  return `${s}s`;
}

function formatTokens(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(2)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}k`;
  return String(n);
}

export default function UsageDashboard() {
  const router = useRouter();
  const [records, setRecords] = useState<UsageRecord[] | null>(null);
  const [summary, setSummary] = useState<UsageSummary | null>(null);

  const load = async () => {
    const list = await listUsage();
    setRecords(list);
    setSummary(summarize(list));
  };

  useEffect(() => {
    void load();
  }, []);

  if (!records || !summary) {
    return (
      <>
        <BrandHeader subtitle="Usage dashboard" />
        <main className="mx-auto max-w-5xl px-6 py-16 text-center">
          <p className="text-centro-ink/60">Loading...</p>
        </main>
      </>
    );
  }

  return (
    <>
      <BrandHeader subtitle="Usage dashboard" />
      <main className="mx-auto max-w-5xl px-6 py-10">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h1 className="text-3xl font-bold text-centro-primary">
              Vendor usage tracker
            </h1>
            <p className="text-sm text-centro-ink/65 mt-1">
              In-app log of what each screening session consumed. Cross-check against
              Hume Platform → Usage and Anthropic Console → Usage for billed numbers —
              this dashboard mirrors what we asked the vendors to do.
            </p>
          </div>
          <button
            onClick={() => router.push("/")}
            className="text-sm text-centro-primary hover:underline"
          >
            ← Back to landing
          </button>
        </div>

        {/* Summary tiles */}
        <section className="mt-8 grid grid-cols-2 md:grid-cols-4 gap-3">
          <SummaryTile label="Sessions" value={summary.sessions.toString()} />
          <SummaryTile
            label="Total session time"
            value={formatDuration(summary.totalDurationSec)}
            sub="Voice + face streamed concurrently"
          />
          <SummaryTile
            label="Hume EVI minutes (est.)"
            value={summary.totalHumeEviMinutes.toFixed(2)}
            sub="Voice agent meter"
          />
          <SummaryTile
            label="Hume face minutes (est.)"
            value={summary.totalHumeFaceMinutes.toFixed(2)}
            sub="Expression Measurement meter"
          />
          <SummaryTile
            label="Face frames analyzed"
            value={summary.totalFaceFramesAnalyzed.toString()}
            sub="Across all sessions"
          />
          <SummaryTile
            label="Claude input tokens"
            value={formatTokens(summary.totalClaudeInputTokens)}
            sub="Scoring prompts"
          />
          <SummaryTile
            label="Claude output tokens"
            value={formatTokens(summary.totalClaudeOutputTokens)}
            sub="Scoring responses"
          />
          <SummaryTile
            label="Failed sessions"
            value={summary.failures.toString()}
            tone={summary.failures > 0 ? "warn" : undefined}
          />
        </section>

        {/* Per-day breakdown */}
        {summary.byDay.length > 0 && (
          <section className="mt-8">
            <h2 className="text-base font-semibold text-centro-primary mb-3">
              Daily activity
            </h2>
            <div className="rounded-lg border border-gray-200 overflow-hidden">
              <table className="w-full text-sm">
                <thead className="bg-gray-50 text-centro-ink/70">
                  <tr>
                    <th className="px-4 py-2.5 text-left">Day</th>
                    <th className="px-4 py-2.5 text-right">Sessions</th>
                    <th className="px-4 py-2.5 text-right">Total minutes</th>
                  </tr>
                </thead>
                <tbody>
                  {summary.byDay.map((d) => (
                    <tr key={d.day} className="border-t border-gray-100">
                      <td className="px-4 py-2.5 font-medium tabular-nums">{d.day}</td>
                      <td className="px-4 py-2.5 text-right tabular-nums">
                        {d.sessions}
                      </td>
                      <td className="px-4 py-2.5 text-right tabular-nums">
                        {d.minutes.toFixed(2)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>
        )}

        {/* Per-session table */}
        <section className="mt-8">
          <div className="flex items-baseline justify-between mb-3">
            <h2 className="text-base font-semibold text-centro-primary">
              Per-session log ({records.length})
            </h2>
            {records.length > 0 && (
              <button
                onClick={async () => {
                  if (!confirm("Clear all usage logs? This cannot be undone.")) return;
                  await clearUsage();
                  await load();
                }}
                className="text-xs text-rose-600 hover:underline"
              >
                Clear all
              </button>
            )}
          </div>

          {records.length === 0 ? (
            <p className="text-sm text-centro-ink/60 py-8 text-center bg-gray-50 rounded-lg border border-gray-200">
              No sessions logged yet. Run a screening from{" "}
              <a href="/" className="text-centro-primary hover:underline">
                the landing page
              </a>
              .
            </p>
          ) : (
            <div className="rounded-lg border border-gray-200 overflow-x-auto">
              <table className="w-full text-xs">
                <thead className="bg-gray-50 text-centro-ink/70">
                  <tr>
                    <th className="px-3 py-2.5 text-left">Started</th>
                    <th className="px-3 py-2.5 text-left">Candidate</th>
                    <th className="px-3 py-2.5 text-right">Duration</th>
                    <th className="px-3 py-2.5 text-right">Face sent</th>
                    <th className="px-3 py-2.5 text-right">Face analyzed</th>
                    <th className="px-3 py-2.5 text-right">Claude in</th>
                    <th className="px-3 py-2.5 text-right">Claude out</th>
                    <th className="px-3 py-2.5 text-left">End reason</th>
                  </tr>
                </thead>
                <tbody>
                  {records.map((r) => (
                    <tr key={r.sessionId} className="border-t border-gray-100">
                      <td className="px-3 py-2 tabular-nums">
                        {r.startedAtIso.replace("T", " ").slice(0, 16)}
                      </td>
                      <td className="px-3 py-2 font-medium">{r.candidateName}</td>
                      <td className="px-3 py-2 text-right tabular-nums">
                        {formatDuration(r.durationSec)}
                      </td>
                      <td className="px-3 py-2 text-right tabular-nums">
                        {r.faceFramesSent}
                      </td>
                      <td className="px-3 py-2 text-right tabular-nums">
                        {r.faceFramesAnalyzed}
                      </td>
                      <td className="px-3 py-2 text-right tabular-nums">
                        {formatTokens(r.claudeInputTokens)}
                      </td>
                      <td className="px-3 py-2 text-right tabular-nums">
                        {formatTokens(r.claudeOutputTokens)}
                      </td>
                      <td className="px-3 py-2">
                        <span
                          className={`px-2 py-0.5 rounded text-[10px] font-medium ${
                            r.endReasonKind === "user_ended"
                              ? "bg-emerald-100 text-emerald-800"
                              : "bg-amber-100 text-amber-800"
                          }`}
                        >
                          {r.endReasonKind}
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </section>

        <section className="mt-8 rounded-lg border border-centro-primary/20 bg-centro-primary/[0.03] p-5 text-sm text-centro-ink/85">
          <h3 className="font-semibold text-centro-primary mb-1">
            Where to verify the actual billed numbers
          </h3>
          <ul className="text-xs space-y-1 list-disc list-inside leading-relaxed">
            <li>
              <strong>Hume EVI minutes</strong> →{" "}
              <a
                href="https://platform.hume.ai"
                target="_blank"
                rel="noreferrer"
                className="text-centro-primary hover:underline"
              >
                platform.hume.ai
              </a>{" "}
              → Settings → Usage (or Billing)
            </li>
            <li>
              <strong>Hume Expression Measurement minutes</strong> → same place, split
              by feature
            </li>
            <li>
              <strong>Claude tokens / cost</strong> →{" "}
              <a
                href="https://console.anthropic.com/usage"
                target="_blank"
                rel="noreferrer"
                className="text-centro-primary hover:underline"
              >
                console.anthropic.com/usage
              </a>
            </li>
          </ul>
        </section>
      </main>
    </>
  );
}

function SummaryTile({
  label,
  value,
  sub,
  tone
}: {
  label: string;
  value: string;
  sub?: string;
  tone?: "warn";
}) {
  return (
    <div
      className={`rounded-lg border p-4 ${
        tone === "warn"
          ? "bg-amber-50 border-amber-200"
          : "bg-white border-gray-200"
      }`}
    >
      <p className="text-xs uppercase tracking-wider text-centro-ink/60 font-medium">
        {label}
      </p>
      <p className="text-2xl font-bold text-centro-primary tabular-nums mt-1">
        {value}
      </p>
      {sub && <p className="text-[10px] text-centro-ink/55 mt-1">{sub}</p>}
    </div>
  );
}
