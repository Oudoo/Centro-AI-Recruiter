"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import type { ScreeningSessionRow } from "@/lib/zoho-creator";
import { StatusBadge, ScoreCell } from "@/components/admin/StatusBadge";
import { InviteModal } from "@/components/admin/InviteModal";

type FilterState = {
  search: string;
  recommendation: "all" | "Pass" | "Borderline" | "Auto_Flag_Reject";
  englishLevel: "all" | string;
  showOnlyOverridable: boolean;
  showOnlyNotSynced: boolean;
};

const DEFAULT_FILTER: FilterState = {
  search: "",
  recommendation: "all",
  englishLevel: "all",
  showOnlyOverridable: false,
  showOnlyNotSynced: false
};

type SortKey =
  | "completedTime"
  | "candidateName"
  | "overallScore"
  | "passFailRecommendation"
  | "englishLevel";

export default function AdminCandidatesPage() {
  const [sessions, setSessions] = useState<ScreeningSessionRow[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<FilterState>(DEFAULT_FILTER);
  const [sortKey, setSortKey] = useState<SortKey>("completedTime");
  const [sortDir, setSortDir] = useState<"asc" | "desc">("desc");
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [inviteOpen, setInviteOpen] = useState(false);
  const [bulkBusy, setBulkBusy] = useState(false);
  const [bulkMessage, setBulkMessage] = useState<string | null>(null);

  const load = async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/admin/sessions?limit=200", { cache: "no-store" });
      const json = await res.json();
      if (json.error) {
        setError(json.error);
      } else {
        setSessions(json.sessions ?? []);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void load();
  }, []);

  const filtered = useMemo(() => {
    if (!sessions) return [];
    const q = filter.search.trim().toLowerCase();
    return sessions
      .filter((s) => {
        if (
          q &&
          !s.candidateName.toLowerCase().includes(q) &&
          !s.candidateEmail.toLowerCase().includes(q) &&
          !s.candidatePosition.toLowerCase().includes(q) &&
          !s.candidateExternalId.toLowerCase().includes(q)
        ) {
          return false;
        }
        if (
          filter.recommendation !== "all" &&
          s.passFailRecommendation !== filter.recommendation
        ) {
          return false;
        }
        if (
          filter.englishLevel !== "all" &&
          s.englishLevel !== filter.englishLevel
        ) {
          return false;
        }
        if (filter.showOnlyOverridable && s.reviewerOverrideApplied) return false;
        if (filter.showOnlyNotSynced && s.syncedToRecruit) return false;
        return true;
      })
      .sort((a, b) => {
        let av: string | number = "";
        let bv: string | number = "";
        switch (sortKey) {
          case "completedTime":
            av = a.completedTime;
            bv = b.completedTime;
            break;
          case "candidateName":
            av = a.candidateName.toLowerCase();
            bv = b.candidateName.toLowerCase();
            break;
          case "overallScore":
            av = a.overallScore;
            bv = b.overallScore;
            break;
          case "passFailRecommendation":
            av = a.passFailRecommendation;
            bv = b.passFailRecommendation;
            break;
          case "englishLevel":
            av = a.englishLevel;
            bv = b.englishLevel;
            break;
        }
        if (av < bv) return sortDir === "asc" ? -1 : 1;
        if (av > bv) return sortDir === "asc" ? 1 : -1;
        return 0;
      });
  }, [sessions, filter, sortKey, sortDir]);

  // KPI summary
  const kpis = useMemo(() => {
    if (!sessions) return null;
    const total = sessions.length;
    const passes = sessions.filter((s) => s.passFailRecommendation === "Pass").length;
    const borderline = sessions.filter(
      (s) => s.passFailRecommendation === "Borderline"
    ).length;
    const rejects = sessions.filter(
      (s) => s.passFailRecommendation === "Auto_Flag_Reject"
    ).length;
    const avgScore =
      total > 0
        ? sessions.reduce((sum, s) => sum + s.overallScore, 0) / total
        : 0;
    const passRate = total > 0 ? (passes / total) * 100 : 0;
    const unsynced = sessions.filter((s) => !s.syncedToRecruit).length;
    const overridden = sessions.filter((s) => s.reviewerOverrideApplied).length;

    // Last 7 days
    const sevenDaysAgo = new Date();
    sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);
    const last7 = sessions.filter(
      (s) => s.completedTime && new Date(s.completedTime) > sevenDaysAgo
    ).length;

    return { total, passes, borderline, rejects, avgScore, passRate, unsynced, overridden, last7 };
  }, [sessions]);

  const englishLevels = useMemo(() => {
    if (!sessions) return [];
    const set = new Set(sessions.map((s) => s.englishLevel).filter(Boolean));
    return Array.from(set).sort();
  }, [sessions]);

  const toggleSort = (key: SortKey) => {
    if (sortKey === key) {
      setSortDir((d) => (d === "asc" ? "desc" : "asc"));
    } else {
      setSortKey(key);
      setSortDir("desc");
    }
  };

  // ─── Bulk actions (Phase 1I) ───
  const runBulk = async (decision: "Approved" | "Rejected") => {
    if (selected.size === 0 || !sessions) return;
    const reason = window.prompt(
      `Reason for bulk ${decision.toLowerCase()} (required, min 10 chars):`,
      decision === "Approved"
        ? "Bulk approved — strong performance across the rubric."
        : "Bulk rejected — insufficient performance for the role."
    );
    if (!reason || reason.trim().length < 10) {
      setBulkMessage("Bulk action cancelled (reason too short).");
      return;
    }
    setBulkBusy(true);
    setBulkMessage(`Applying ${decision} to ${selected.size} session(s)...`);
    try {
      const res = await fetch("/api/admin/sessions/bulk-action", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          ids: Array.from(selected),
          decision,
          reason: reason.trim(),
          reviewerEmail: "mahmoud.hassan@centrocdx.com"
        })
      });
      const json = await res.json();
      if (!res.ok || json.error) {
        setBulkMessage(`Failed: ${json.error ?? "unknown error"}`);
      } else {
        setBulkMessage(
          `${decision} applied to ${json.succeeded}/${json.attempted} session${
            json.attempted === 1 ? "" : "s"
          }${json.failed > 0 ? ` · ${json.failed} failed` : ""}`
        );
        setSelected(new Set());
        await load();
      }
    } catch (err) {
      setBulkMessage(`Failed: ${err instanceof Error ? err.message : String(err)}`);
    } finally {
      setBulkBusy(false);
    }
  };

  const exportCsv = () => {
    if (selected.size === 0 || !sessions) return;
    const selectedRows = sessions.filter((s) => selected.has(s.id));
    const headers = [
      "id",
      "candidate_name",
      "candidate_email",
      "candidate_phone",
      "candidate_position",
      "recruit_id",
      "completed_time",
      "overall_score",
      "composure",
      "eq",
      "confidence",
      "fluency",
      "english_level",
      "recommendation",
      "session_status",
      "reviewer_override_applied",
      "reviewer_override_score",
      "reviewer_email",
      "recording_url",
      "rationale_summary"
    ];
    const esc = (v: string | number) => {
      const s = String(v ?? "");
      return `"${s.replace(/"/g, '""').replace(/\n/g, " ")}"`;
    };
    const rows = selectedRows.map((s) =>
      [
        s.id,
        s.candidateName,
        s.candidateEmail,
        s.candidatePhone,
        s.candidatePosition,
        s.candidateRecruitId,
        s.completedTime,
        s.overallScore.toFixed(2),
        s.composureScore.toFixed(2),
        s.eqScore.toFixed(2),
        s.confidenceScore.toFixed(2),
        s.fluencyScore.toFixed(2),
        s.englishLevel,
        s.passFailRecommendation,
        s.sessionStatus,
        s.reviewerOverrideApplied ? "yes" : "no",
        s.reviewerOverrideScore.toFixed(2),
        s.reviewerEmail,
        s.recordingUrl,
        s.aiRationaleSummary
      ].map(esc).join(",")
    );
    const csv = [headers.join(","), ...rows].join("\n");
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `centro-screenings-${new Date().toISOString().slice(0, 10)}.csv`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    setTimeout(() => URL.revokeObjectURL(url), 1000);
    setBulkMessage(`Exported ${selectedRows.length} session(s) to CSV.`);
  };

  const toggleSelect = (id: string) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const selectAll = () => {
    if (selected.size === filtered.length) {
      setSelected(new Set());
    } else {
      setSelected(new Set(filtered.map((s) => s.id)));
    }
  };

  return (
    <main className="px-6 py-8 pb-24">
      <div className="flex items-baseline justify-between gap-4 mb-6">
        <div>
          <h1 className="text-2xl font-bold text-centro-primary">
            Screened candidates
          </h1>
          <p className="text-sm text-centro-ink/60 mt-1">
            Every completed AI screening, loaded live from Zoho Creator.
          </p>
        </div>
        <div className="flex items-center gap-3">
          <button
            onClick={load}
            disabled={loading}
            className="text-sm text-centro-primary hover:underline disabled:opacity-50"
          >
            {loading ? "Refreshing..." : "↻ Refresh"}
          </button>
          <button
            onClick={() => setInviteOpen(true)}
            className="centro-btn"
          >
            + Invite candidate
          </button>
        </div>
      </div>

      {/* KPI tiles */}
      {kpis && (
        <section className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-6">
          <KpiTile label="Total screenings" value={kpis.total.toString()} />
          <KpiTile
            label="Pass rate"
            value={`${kpis.passRate.toFixed(0)}%`}
            sub={`${kpis.passes} of ${kpis.total}`}
            tone={kpis.passRate >= 40 ? "good" : kpis.passRate >= 20 ? "fair" : "warn"}
          />
          <KpiTile
            label="Avg overall score"
            value={kpis.avgScore.toFixed(2)}
            sub="of 5.00"
          />
          <KpiTile label="Last 7 days" value={kpis.last7.toString()} sub="completed sessions" />
          <KpiTile label="Borderline" value={kpis.borderline.toString()} tone="fair" />
          <KpiTile label="Auto-flag reject" value={kpis.rejects.toString()} tone="warn" />
          <KpiTile
            label="Awaiting Recruit sync"
            value={kpis.unsynced.toString()}
            tone={kpis.unsynced > 0 ? "fair" : "good"}
          />
          <KpiTile label="Manual overrides" value={kpis.overridden.toString()} />
        </section>
      )}

      {/* Filter bar */}
      <section className="bg-white rounded-lg border border-gray-200 p-4 mb-4">
        <div className="grid grid-cols-1 md:grid-cols-12 gap-3 items-end">
          <div className="md:col-span-5">
            <label className="block text-xs font-medium uppercase tracking-wider text-centro-ink/60 mb-1">
              Search
            </label>
            <input
              type="text"
              value={filter.search}
              onChange={(e) => setFilter((f) => ({ ...f, search: e.target.value }))}
              placeholder="Name, email, position, candidate ID..."
              className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm focus:border-centro-primary focus:outline-none focus:ring-1 focus:ring-centro-primary"
            />
          </div>
          <div className="md:col-span-3">
            <label className="block text-xs font-medium uppercase tracking-wider text-centro-ink/60 mb-1">
              Recommendation
            </label>
            <select
              value={filter.recommendation}
              onChange={(e) =>
                setFilter((f) => ({
                  ...f,
                  recommendation: e.target.value as FilterState["recommendation"]
                }))
              }
              className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm focus:border-centro-primary focus:outline-none focus:ring-1 focus:ring-centro-primary"
            >
              <option value="all">All</option>
              <option value="Pass">Pass</option>
              <option value="Borderline">Borderline</option>
              <option value="Auto_Flag_Reject">Auto-flag reject</option>
            </select>
          </div>
          <div className="md:col-span-2">
            <label className="block text-xs font-medium uppercase tracking-wider text-centro-ink/60 mb-1">
              English level
            </label>
            <select
              value={filter.englishLevel}
              onChange={(e) =>
                setFilter((f) => ({ ...f, englishLevel: e.target.value }))
              }
              className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm focus:border-centro-primary focus:outline-none focus:ring-1 focus:ring-centro-primary"
            >
              <option value="all">All</option>
              {englishLevels.map((l) => (
                <option key={l} value={l}>
                  {l.replace("_", " ")}
                </option>
              ))}
            </select>
          </div>
          <div className="md:col-span-2 flex flex-col gap-1">
            <label className="flex items-center gap-2 text-xs text-centro-ink/75 cursor-pointer">
              <input
                type="checkbox"
                checked={filter.showOnlyNotSynced}
                onChange={(e) =>
                  setFilter((f) => ({ ...f, showOnlyNotSynced: e.target.checked }))
                }
                className="rounded text-centro-primary focus:ring-centro-primary"
              />
              Not synced
            </label>
            <label className="flex items-center gap-2 text-xs text-centro-ink/75 cursor-pointer">
              <input
                type="checkbox"
                checked={filter.showOnlyOverridable}
                onChange={(e) =>
                  setFilter((f) => ({
                    ...f,
                    showOnlyOverridable: e.target.checked
                  }))
                }
                className="rounded text-centro-primary focus:ring-centro-primary"
              />
              Not yet overridden
            </label>
          </div>
        </div>
        {selected.size > 0 && (
          <div className="mt-3 pt-3 border-t border-gray-100 flex flex-wrap items-center gap-3 text-sm">
            <span className="font-medium text-centro-primary">
              {selected.size} selected
            </span>
            <button
              disabled={bulkBusy}
              onClick={() => runBulk("Approved")}
              className="px-3 py-1.5 rounded bg-emerald-600 text-white text-xs font-medium hover:bg-emerald-700 disabled:opacity-50"
            >
              Approve for human interview
            </button>
            <button
              disabled={bulkBusy}
              onClick={() => runBulk("Rejected")}
              className="px-3 py-1.5 rounded bg-rose-600 text-white text-xs font-medium hover:bg-rose-700 disabled:opacity-50"
            >
              Reject
            </button>
            <button
              onClick={exportCsv}
              className="px-3 py-1.5 rounded border border-gray-300 text-xs font-medium hover:bg-gray-50"
            >
              Export CSV
            </button>
            <button
              onClick={() => setSelected(new Set())}
              className="ml-auto text-xs text-centro-ink/60 hover:text-centro-ink"
            >
              Clear selection
            </button>
            {bulkMessage && (
              <span className="text-xs text-centro-primary w-full">{bulkMessage}</span>
            )}
          </div>
        )}
      </section>

      <InviteModal
        open={inviteOpen}
        onClose={() => setInviteOpen(false)}
        defaultRecruiterEmail="mahmoud.hassan@centrocdx.com"
      />

      {/* Status messages */}
      {error && (
        <div className="bg-rose-50 border border-rose-200 rounded p-4 text-sm text-rose-900 mb-4">
          <p className="font-semibold mb-1">Couldn't load sessions from Creator</p>
          <p className="font-mono text-xs">{error}</p>
        </div>
      )}
      {!loading && !error && sessions && sessions.length === 0 && (
        <div className="bg-amber-50 border border-amber-200 rounded p-6 text-sm text-amber-900 text-center">
          <p className="font-semibold">No screenings yet.</p>
          <p className="mt-1 opacity-80">
            Run a screening from the{" "}
            <Link href="/" className="underline text-centro-primary">
              candidate landing page
            </Link>{" "}
            and it'll appear here once it completes.
          </p>
        </div>
      )}

      {/* Candidate table */}
      {sessions && sessions.length > 0 && (
        <section className="bg-white rounded-lg border border-gray-200 overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-gray-50 text-centro-ink/70 text-left">
              <tr>
                <th className="px-3 py-3 w-8">
                  <input
                    type="checkbox"
                    checked={filtered.length > 0 && selected.size === filtered.length}
                    onChange={selectAll}
                    className="rounded text-centro-primary focus:ring-centro-primary"
                  />
                </th>
                <SortableHeader
                  label="Candidate"
                  active={sortKey === "candidateName"}
                  dir={sortDir}
                  onClick={() => toggleSort("candidateName")}
                />
                <SortableHeader
                  label="Completed"
                  active={sortKey === "completedTime"}
                  dir={sortDir}
                  onClick={() => toggleSort("completedTime")}
                />
                <SortableHeader
                  label="Overall"
                  active={sortKey === "overallScore"}
                  dir={sortDir}
                  onClick={() => toggleSort("overallScore")}
                  align="right"
                />
                <th className="px-3 py-3 text-right">Composure</th>
                <th className="px-3 py-3 text-right">EQ</th>
                <th className="px-3 py-3 text-right">Confidence</th>
                <th className="px-3 py-3 text-right">Fluency</th>
                <SortableHeader
                  label="English"
                  active={sortKey === "englishLevel"}
                  dir={sortDir}
                  onClick={() => toggleSort("englishLevel")}
                />
                <SortableHeader
                  label="Status"
                  active={sortKey === "passFailRecommendation"}
                  dir={sortDir}
                  onClick={() => toggleSort("passFailRecommendation")}
                />
                <th className="px-3 py-3">Recording</th>
                <th className="px-3 py-3"></th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((s) => (
                <tr
                  key={s.id}
                  className={`border-t border-gray-100 hover:bg-gray-50 ${
                    selected.has(s.id) ? "bg-centro-primary/[0.03]" : ""
                  }`}
                >
                  <td className="px-3 py-2.5">
                    <input
                      type="checkbox"
                      checked={selected.has(s.id)}
                      onChange={() => toggleSelect(s.id)}
                      className="rounded text-centro-primary focus:ring-centro-primary"
                    />
                  </td>
                  <td className="px-3 py-2.5">
                    <Link
                      href={`/admin/${s.id}`}
                      className="font-medium text-centro-primary hover:underline"
                    >
                      {s.candidateName || "—"}
                    </Link>
                    <p className="text-xs text-centro-ink/55">
                      {s.candidateEmail || "—"}
                    </p>
                    <div className="flex flex-wrap gap-1 mt-1">
                      {s.reviewerOverrideApplied && (
                        <span className="text-[10px] font-semibold text-purple-700 bg-purple-50 px-1.5 py-0.5 rounded inline-block">
                          OVERRIDDEN
                        </span>
                      )}
                      {s.discrepancyFlag && (
                        <span className="text-[10px] font-semibold text-rose-700 bg-rose-50 border border-rose-200 px-1.5 py-0.5 rounded inline-block" title={`Name discrepancy flagged! CV: "${s.cvName}" vs ID name.`}>
                          ⚠️ NAME MISMATCH
                        </span>
                      )}
                    </div>
                  </td>
                  <td className="px-3 py-2.5 text-xs text-centro-ink/65 tabular-nums">
                    {s.completedTime
                      ? s.completedTime.replace("T", " ").slice(0, 16)
                      : "—"}
                  </td>
                  <td className="px-3 py-2.5 text-right">
                    <ScoreCell value={s.overallScore} />
                  </td>
                  <td className="px-3 py-2.5 text-right text-xs tabular-nums">
                    {s.composureScore.toFixed(2)}
                  </td>
                  <td className="px-3 py-2.5 text-right text-xs tabular-nums">
                    {s.eqScore.toFixed(2)}
                  </td>
                  <td className="px-3 py-2.5 text-right text-xs tabular-nums">
                    {s.confidenceScore.toFixed(2)}
                  </td>
                  <td className="px-3 py-2.5 text-right text-xs tabular-nums">
                    {s.fluencyScore.toFixed(2)}
                  </td>
                  <td className="px-3 py-2.5 text-xs">
                    {s.englishLevel.replace("_", " ") || "—"}
                  </td>
                  <td className="px-3 py-2.5">
                    <StatusBadge
                      recommendation={s.passFailRecommendation}
                      overall={s.overallScore}
                    />
                  </td>
                  <td className="px-3 py-2.5">
                    {s.recordingUrl ? (
                      <a
                        href={s.recordingUrl}
                        target="_blank"
                        rel="noreferrer"
                        className="text-xs text-centro-primary hover:underline"
                      >
                        Open ↗
                      </a>
                    ) : (
                      <span className="text-xs text-centro-ink/40">—</span>
                    )}
                  </td>
                  <td className="px-3 py-2.5">
                    <Link
                      href={`/admin/${s.id}`}
                      className="text-xs text-centro-primary hover:underline font-medium whitespace-nowrap"
                    >
                      Review →
                    </Link>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </section>
      )}

      {sessions && filtered.length === 0 && sessions.length > 0 && (
        <div className="text-center py-12 text-sm text-centro-ink/60">
          No sessions match the current filters.{" "}
          <button
            onClick={() => setFilter(DEFAULT_FILTER)}
            className="text-centro-primary hover:underline"
          >
            Clear filters
          </button>
        </div>
      )}
    </main>
  );
}

function KpiTile({
  label,
  value,
  sub,
  tone
}: {
  label: string;
  value: string;
  sub?: string;
  tone?: "good" | "fair" | "warn";
}) {
  const valueColor =
    tone === "good"
      ? "text-emerald-700"
      : tone === "fair"
        ? "text-amber-700"
        : tone === "warn"
          ? "text-rose-700"
          : "text-centro-primary";
  return (
    <div className="rounded-lg border border-gray-200 bg-white p-4">
      <p className="text-xs uppercase tracking-wider text-centro-ink/60 font-medium">
        {label}
      </p>
      <p className={`text-2xl font-bold tabular-nums mt-1 ${valueColor}`}>
        {value}
      </p>
      {sub && <p className="text-[10px] text-centro-ink/55 mt-1">{sub}</p>}
    </div>
  );
}

function SortableHeader({
  label,
  active,
  dir,
  onClick,
  align = "left"
}: {
  label: string;
  active: boolean;
  dir: "asc" | "desc";
  onClick: () => void;
  align?: "left" | "right";
}) {
  return (
    <th className={`px-3 py-3 ${align === "right" ? "text-right" : ""}`}>
      <button
        onClick={onClick}
        className={`inline-flex items-center gap-1 hover:text-centro-primary ${
          active ? "text-centro-primary font-semibold" : ""
        }`}
      >
        {label}
        {active && <span className="text-[10px]">{dir === "asc" ? "▲" : "▼"}</span>}
      </button>
    </th>
  );
}
