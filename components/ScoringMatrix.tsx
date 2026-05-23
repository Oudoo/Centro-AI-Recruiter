"use client";

import { activeRubric } from "@/lib/rubric";
import type { ScoreOutput } from "@/lib/claude";

function gradientFor(score: number): string {
  if (score >= 4.0) return "from-teal-600 to-teal-800";
  if (score >= 3.0) return "from-slate-500 to-slate-700";
  if (score >= 2.0) return "from-stone-500 to-stone-700";
  return "from-rose-600 to-rose-800";
}

function pillFor(score: number): string {
  if (score >= 4.0) return "bg-teal-50 text-teal-900 ring-teal-300";
  if (score >= 3.0) return "bg-slate-50 text-slate-900 ring-slate-300";
  if (score >= 2.0) return "bg-stone-50 text-stone-900 ring-stone-300";
  return "bg-rose-50 text-rose-900 ring-rose-300";
}

function recommendationStyle(rec: ScoreOutput["passFailRecommendation"]): {
  badge: string;
  glow: string;
} {
  if (rec === "Pass")
    return {
      badge: "bg-emerald-600 text-white shadow-emerald-500/40",
      glow: "shadow-emerald-500/20"
    };
  if (rec === "Borderline")
    return {
      badge: "bg-amber-500 text-white shadow-amber-500/40",
      glow: "shadow-amber-500/20"
    };
  return {
    badge: "bg-rose-600 text-white shadow-rose-500/40",
    glow: "shadow-rose-500/20"
  };
}

type Props = {
  score: ScoreOutput;
  onJumpTo: (sectionId: string) => void;
};

export function ScoringMatrix({ score, onJumpTo }: Props) {
  const dims = activeRubric.weightedDimensions;
  const recStyle = recommendationStyle(score.passFailRecommendation);
  const overallPct = Math.round((score.overall / 5) * 100);

  const tiles: Array<{
    id: string;
    label: string;
    value: number;
    weight: number;
  }> = [
    { id: "fluency", label: "Fluency", value: score.fluency.score, weight: dims.fluency.weight },
    { id: "composure", label: "Composure", value: score.composure.score, weight: dims.composure.weight },
    { id: "eq", label: "EQ", value: score.eq.score, weight: dims.eq.weight },
    { id: "confidence", label: "Confidence", value: score.confidence.score, weight: dims.confidence.weight }
  ];

  return (
    <div className={`rounded-2xl overflow-hidden shadow-xl ${recStyle.glow}`}>
      {/* Hero band */}
      <div className="bg-gradient-to-br from-centro-primary to-[#003943] text-white p-8">
        <div className="flex flex-wrap items-start justify-between gap-6">
          <div>
            <p className="text-xs uppercase tracking-widest opacity-70">
              Scoring Matrix
            </p>
            <h2 className="mt-1 text-sm opacity-80">
              Rubric: {score.methodologyVersion}
            </h2>
          </div>
          <span
            className={`inline-flex items-center gap-2 px-5 py-2.5 rounded-full text-base font-bold tracking-wide shadow-lg ${recStyle.badge}`}
          >
            {score.passFailRecommendation === "Pass" && "✓ "}
            {score.passFailRecommendation === "Auto_Flag_Reject" && "⚠ "}
            {score.passFailRecommendation.replace("_", " ").toUpperCase()}
          </span>
        </div>

        <div className="mt-6 grid grid-cols-1 md:grid-cols-3 gap-6 items-center">
          {/* Overall big number */}
          <div className="md:col-span-1">
            <p className="text-xs uppercase tracking-widest opacity-70">Overall</p>
            <div className="flex items-baseline gap-2 mt-1">
              <span className="text-7xl font-black tabular-nums leading-none">
                {score.overall.toFixed(2)}
              </span>
              <span className="text-2xl opacity-60">/5</span>
            </div>
            <p className="mt-2 text-xs opacity-75">{overallPct}% on the rubric</p>
          </div>

          {/* English level */}
          <div className="md:col-span-1">
            <p className="text-xs uppercase tracking-widest opacity-70">
              Mapped English Level
            </p>
            <p className="mt-1 text-3xl font-bold">
              {score.englishLevel.replace("_", " ")}
            </p>
            <p className="mt-2 text-xs opacity-75">
              From fluency {score.fluency.score.toFixed(2)}/5
            </p>
          </div>

          {/* Pass threshold gauge */}
          <div className="md:col-span-1">
            <p className="text-xs uppercase tracking-widest opacity-70">
              vs. Pass Threshold
            </p>
            <div className="mt-2 h-8 rounded-full bg-white/20 overflow-hidden relative">
              <div
                className="h-full bg-gradient-to-r from-white/70 to-white"
                style={{ width: `${overallPct}%` }}
              />
              <div
                className="absolute top-0 bottom-0 w-0.5 bg-rose-300"
                style={{ left: `${(activeRubric.passThreshold / 5) * 100}%` }}
                title={`Pass threshold ${activeRubric.passThreshold}`}
              />
            </div>
            <p className="mt-2 text-xs opacity-75 tabular-nums">
              Pass ≥ {activeRubric.passThreshold.toFixed(2)} ·{" "}
              {score.overall >= activeRubric.passThreshold
                ? `+${(score.overall - activeRubric.passThreshold).toFixed(2)} above`
                : `${(activeRubric.passThreshold - score.overall).toFixed(2)} short`}
            </p>
          </div>
        </div>
      </div>

      {/* Dimension tiles */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-px bg-gray-200">
        {tiles.map((t) => {
          const contribution = t.value * t.weight;
          return (
            <button
              key={t.id}
              onClick={() => onJumpTo(t.id)}
              className={`group bg-gradient-to-br ${gradientFor(
                t.value
              )} text-white p-5 text-left transition-transform hover:scale-[1.02] hover:z-10 relative`}
            >
              <p className="text-xs uppercase tracking-widest opacity-80 font-medium">
                {t.label}
              </p>
              <div className="flex items-baseline gap-1.5 mt-1.5">
                <span className="text-5xl font-black tabular-nums leading-none">
                  {t.value.toFixed(2)}
                </span>
                <span className="text-base opacity-60">/5</span>
              </div>
              <div className="mt-3 text-[10px] uppercase tracking-wider opacity-80 leading-relaxed">
                <span className="block">
                  Weight {Math.round(t.weight * 100)}%
                </span>
                <span className="block font-semibold mt-0.5">
                  Contributes {contribution.toFixed(2)}
                </span>
              </div>
              <p className="absolute bottom-2 right-3 text-[10px] opacity-60 group-hover:opacity-100">
                Open details →
              </p>
            </button>
          );
        })}
      </div>

      {/* Short rationale strip */}
      <div className="bg-white p-5 border-t-2 border-gray-100">
        <p className={`inline-block text-xs font-semibold px-2 py-1 rounded-full ring-1 ${pillFor(score.overall)} mb-2`}>
          Recruiter summary
        </p>
        <p className="text-sm text-centro-ink/90 leading-relaxed">
          {score.shortRationale}
        </p>
      </div>
    </div>
  );
}
