"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import type { ScreeningSessionRow } from "@/lib/zoho-creator";
import type { RoleMatch } from "../../api/admin/match-jobs/route";
import { ROLE_CATALOG } from "@/lib/role-catalog";

type CandidateMatch = {
  sessionId: string;
  candidateName: string;
  candidateEmail: string;
  overallScore: number;
  englishLevel: string;
  appliedPosition: string;
  matches: RoleMatch[];
};

const TIER_STYLE: Record<RoleMatch["fitTier"], { bg: string; ring: string; text: string }> = {
  strong: { bg: "bg-emerald-50", ring: "ring-emerald-300", text: "text-emerald-900" },
  good: { bg: "bg-sky-50", ring: "ring-sky-300", text: "text-sky-900" },
  stretch: { bg: "bg-amber-50", ring: "ring-amber-300", text: "text-amber-900" },
  "no-fit": { bg: "bg-rose-50", ring: "ring-rose-300", text: "text-rose-900" }
};

export default function RoutingPage() {
  const [sessions, setSessions] = useState<ScreeningSessionRow[] | null>(null);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [matches, setMatches] = useState<CandidateMatch[] | null>(null);
  const [matching, setMatching] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    void fetch("/api/admin/sessions?limit=200", { cache: "no-store" })
      .then((r) => r.json())
      .then((json) => {
        if (json.error) setError(json.error);
        else setSessions(json.sessions);
      })
      .catch((err) => setError(String(err)));
  }, []);

  const eligible = useMemo(() => {
    if (!sessions) return [];
    // Only candidates with completed scoring + recommendation Pass or Borderline
    return sessions.filter(
      (s) =>
        s.overallScore > 0 &&
        (s.passFailRecommendation === "Pass" ||
          s.passFailRecommendation === "Borderline")
    );
  }, [sessions]);

  const runMatch = async () => {
    if (selected.size === 0) return;
    setMatching(true);
    setError(null);
    setMatches(null);
    try {
      const res = await fetch("/api/admin/match-jobs", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ sessionIds: Array.from(selected) })
      });
      const json = await res.json();
      if (json.error) setError(json.error);
      else setMatches(json.results);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setMatching(false);
    }
  };

  const toggle = (id: string) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const selectAll = () => {
    if (selected.size === eligible.length) setSelected(new Set());
    else setSelected(new Set(eligible.map((s) => s.id)));
  };

  return (
    <main className="px-6 py-8 pb-24">
      <div className="flex items-baseline justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-centro-primary">
            Role matching & shortlist
          </h1>
          <p className="text-sm text-centro-ink/65 mt-1">
            Cross-references each candidate's screening profile against{" "}
            {ROLE_CATALOG.length} open Centro roles. Claude ranks fit and surfaces the
            best 2–3 roles per candidate.
          </p>
        </div>
      </div>

      {/* Step 1: Select candidates */}
      {!matches && (
        <section className="bg-white rounded-lg border border-gray-200 p-5 mb-6">
          <div className="flex items-baseline justify-between mb-3">
            <h2 className="text-base font-semibold text-centro-primary">
              Step 1 — Select candidates to route
            </h2>
            <button
              onClick={selectAll}
              className="text-xs text-centro-primary hover:underline"
            >
              {selected.size === eligible.length ? "Deselect all" : "Select all"}
            </button>
          </div>
          <p className="text-xs text-centro-ink/60 mb-3">
            Showing {eligible.length} eligible candidates (Pass or Borderline,
            completed scoring).
          </p>
          {eligible.length === 0 ? (
            <p className="text-sm text-centro-ink/60 py-8 text-center bg-gray-50 rounded">
              No eligible candidates yet. Run more screenings from{" "}
              <Link href="/" className="text-centro-primary underline">
                the landing page
              </Link>
              .
            </p>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-2 max-h-96 overflow-y-auto">
              {eligible.map((s) => (
                <label
                  key={s.id}
                  className={`flex items-center gap-3 p-3 rounded border cursor-pointer transition-colors ${
                    selected.has(s.id)
                      ? "bg-centro-primary/5 border-centro-primary/40"
                      : "bg-white border-gray-200 hover:border-centro-primary/30"
                  }`}
                >
                  <input
                    type="checkbox"
                    checked={selected.has(s.id)}
                    onChange={() => toggle(s.id)}
                    className="rounded text-centro-primary"
                  />
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium truncate">
                      {s.candidateName || "—"}
                    </p>
                    <p className="text-xs text-centro-ink/60 truncate">
                      {s.candidateEmail} · {s.englishLevel.replace("_", " ")} ·{" "}
                      {s.passFailRecommendation}
                    </p>
                  </div>
                  <span
                    className={`text-base font-bold tabular-nums ${
                      s.overallScore >= 4
                        ? "text-emerald-700"
                        : s.overallScore >= 3
                          ? "text-sky-700"
                          : "text-amber-700"
                    }`}
                  >
                    {s.overallScore.toFixed(2)}
                  </span>
                </label>
              ))}
            </div>
          )}
          <button
            onClick={runMatch}
            disabled={selected.size === 0 || matching}
            className="centro-btn mt-4"
          >
            {matching
              ? `Matching ${selected.size}...`
              : `Match ${selected.size || ""} candidate${selected.size === 1 ? "" : "s"} to open roles`}
          </button>
        </section>
      )}

      {/* Catalog reference */}
      {!matches && (
        <section className="bg-gray-50 rounded-lg border border-gray-200 p-5 mb-6">
          <h2 className="text-base font-semibold text-centro-primary mb-3">
            Open roles in the catalog ({ROLE_CATALOG.length})
          </h2>
          <p className="text-xs text-centro-ink/60 mb-3">
            For the demo, the catalog is hardcoded. Production will pull live from Zoho
            Recruit Job Openings once recruit-scope is added to the OAuth client.
          </p>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-2 text-xs">
            {ROLE_CATALOG.map((r) => (
              <div key={r.id} className="bg-white p-3 rounded border border-gray-200">
                <p className="font-semibold text-centro-primary">{r.title}</p>
                <p className="text-centro-ink/65 mt-0.5">
                  {r.shift} · min {r.minEnglishLevel.replace("_", " ")} · score ≥{" "}
                  {r.minOverallScore.toFixed(1)} · {r.monthlySeats} seats/mo
                </p>
                <p className="text-centro-ink/55 mt-1 leading-snug">{r.description}</p>
              </div>
            ))}
          </div>
        </section>
      )}

      {error && (
        <div className="bg-rose-50 border border-rose-200 rounded p-4 text-sm text-rose-900 mb-4">
          <p className="font-semibold mb-1">Match failed</p>
          <pre className="font-mono text-xs">{error}</pre>
        </div>
      )}

      {/* Step 2: Results */}
      {matches && (
        <section>
          <div className="flex items-baseline justify-between mb-4">
            <h2 className="text-base font-semibold text-centro-primary">
              Routing results — {matches.length} candidate
              {matches.length === 1 ? "" : "s"}
            </h2>
            <button
              onClick={() => {
                setMatches(null);
                setSelected(new Set());
              }}
              className="text-sm text-centro-primary hover:underline"
            >
              ← Start over
            </button>
          </div>

          <div className="space-y-4">
            {matches.map((cm) => (
              <div
                key={cm.sessionId}
                className="bg-white rounded-lg border border-gray-200 overflow-hidden"
              >
                <div className="px-5 py-3 bg-gray-50 border-b border-gray-200 flex items-baseline justify-between">
                  <div>
                    <Link
                      href={`/admin/${cm.sessionId}`}
                      className="font-semibold text-centro-primary hover:underline"
                    >
                      {cm.candidateName}
                    </Link>
                    <p className="text-xs text-centro-ink/65 mt-0.5">
                      {cm.candidateEmail} · {cm.englishLevel.replace("_", " ")} ·
                      applied: {cm.appliedPosition || "—"}
                    </p>
                  </div>
                  <span className="text-2xl font-bold text-centro-primary tabular-nums">
                    {cm.overallScore.toFixed(2)}
                  </span>
                </div>

                <div className="divide-y divide-gray-100">
                  {cm.matches.slice(0, 5).map((m) => {
                    const style = TIER_STYLE[m.fitTier];
                    const blocked = !m.meetsEnglishMin || !m.meetsScoreMin;
                    return (
                      <div
                        key={m.roleId}
                        className={`px-5 py-3 flex items-start gap-4 ${style.bg}`}
                      >
                        <div className="w-12 text-center">
                          <p
                            className={`text-2xl font-bold tabular-nums ${style.text}`}
                          >
                            {m.fitScore}
                          </p>
                          <p className={`text-[10px] uppercase ${style.text} opacity-70`}>
                            {m.fitTier.replace("-", " ")}
                          </p>
                        </div>
                        <div className="flex-1">
                          <p className={`font-semibold text-sm ${style.text}`}>
                            {m.title}
                          </p>
                          <p className={`text-xs mt-0.5 ${style.text} opacity-90`}>
                            {m.reasoning}
                          </p>
                          {m.primaryConcern && (
                            <p
                              className={`text-xs mt-1 ${style.text} opacity-75 italic`}
                            >
                              ⚠ {m.primaryConcern}
                            </p>
                          )}
                          {blocked && (
                            <p className="text-xs mt-1 text-rose-700 font-medium">
                              ⨯ Hard gate not met:{" "}
                              {!m.meetsEnglishMin && "English level below minimum"}
                              {!m.meetsEnglishMin && !m.meetsScoreMin && " · "}
                              {!m.meetsScoreMin && "Overall score below minimum"}
                            </p>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            ))}
          </div>
        </section>
      )}
    </main>
  );
}
