"use client";

import type { DimensionDetail } from "@/lib/claude";

type Props = {
  label: string;
  weight: number;
  description: string;
  rubricLevels: Record<"1" | "2" | "3" | "4" | "5", string>;
  detail: DimensionDetail;
  open: boolean;
  onToggle: () => void;
  anchorId?: string;
};

function colorFor(score: number): string {
  if (score >= 4.0) return "border-emerald-300 bg-emerald-50";
  if (score >= 3.0) return "border-sky-300 bg-sky-50";
  if (score >= 2.0) return "border-amber-300 bg-amber-50";
  return "border-rose-300 bg-rose-50";
}

function scoreTextColor(score: number): string {
  if (score >= 4.0) return "text-emerald-700";
  if (score >= 3.0) return "text-sky-700";
  if (score >= 2.0) return "text-amber-700";
  return "text-rose-700";
}

export function DimensionCard({
  label,
  weight,
  description,
  rubricLevels,
  detail,
  open,
  onToggle,
  anchorId
}: Props) {
  const contribution = detail.score * weight;

  return (
    <div id={anchorId} className={`rounded-lg border-2 ${colorFor(detail.score)} scroll-mt-24`}>
      <button
        onClick={onToggle}
        className="w-full px-6 py-5 flex items-start justify-between text-left hover:bg-black/[0.02] transition-colors"
      >
        <div className="flex-1 pr-4">
          <h3 className="text-base font-semibold text-centro-ink">{label}</h3>
          <p className="text-xs text-centro-ink/60 mt-0.5">
            Weight {Math.round(weight * 100)}% · Contributes{" "}
            <strong>{contribution.toFixed(2)}</strong> to overall
          </p>
          <p className="text-sm text-centro-ink/75 mt-2">{description}</p>
        </div>
        <div className="text-right shrink-0">
          <span className={`text-4xl font-bold tabular-nums ${scoreTextColor(detail.score)}`}>
            {detail.score.toFixed(2)}
          </span>
          <span className="text-base opacity-50 ml-0.5">/5</span>
          <p className="text-xs opacity-60 mt-1">Rubric level {detail.rubricLevel}</p>
          <span className="text-xs text-centro-primary mt-2 inline-block">
            {open ? "Hide details" : "Show details"} ▾
          </span>
        </div>
      </button>

      {open && (
        <div className="px-6 pb-6 space-y-5 border-t border-black/10">
          <section className="pt-5">
            <h4 className="text-xs uppercase tracking-wider font-semibold text-centro-ink/70 mb-2">
              How the AI scored this
            </h4>
            <p className="text-sm text-centro-ink/85 leading-relaxed">
              {detail.reasoning}
            </p>
          </section>

          {detail.evidence && detail.evidence.length > 0 && (
            <section>
              <h4 className="text-xs uppercase tracking-wider font-semibold text-centro-ink/70 mb-2">
                Evidence from your transcript
              </h4>
              <ul className="space-y-2">
                {detail.evidence.map((quote, i) => (
                  <li
                    key={i}
                    className="text-sm bg-white border-l-4 border-centro-primary/40 pl-3 py-2 italic text-centro-ink/85"
                  >
                    "{quote}"
                  </li>
                ))}
              </ul>
            </section>
          )}

          <section>
            <h4 className="text-xs uppercase tracking-wider font-semibold text-centro-ink/70 mb-2">
              To improve to the next level
            </h4>
            <p className="text-sm text-centro-ink/85 leading-relaxed">
              {detail.toImprove}
            </p>
          </section>

          <section>
            <h4 className="text-xs uppercase tracking-wider font-semibold text-centro-ink/70 mb-2">
              Rubric reference (level descriptors)
            </h4>
            <div className="space-y-1.5 text-xs">
              {(["5", "4", "3", "2", "1"] as const).map((level) => {
                const isAchieved = parseInt(level) === detail.rubricLevel;
                return (
                  <div
                    key={level}
                    className={`flex gap-3 px-3 py-2 rounded ${
                      isAchieved
                        ? "bg-white ring-2 ring-centro-primary/40 font-medium"
                        : "bg-white/60"
                    }`}
                  >
                    <span
                      className={`font-bold tabular-nums ${
                        isAchieved ? "text-centro-primary" : "text-centro-ink/40"
                      }`}
                    >
                      {level}
                    </span>
                    <span
                      className={isAchieved ? "text-centro-ink" : "text-centro-ink/60"}
                    >
                      {rubricLevels[level]}
                      {isAchieved && (
                        <span className="ml-2 text-centro-primary text-xs">
                          ← your level
                        </span>
                      )}
                    </span>
                  </div>
                );
              })}
            </div>
          </section>
        </div>
      )}
    </div>
  );
}
