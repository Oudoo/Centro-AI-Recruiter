type Props = {
  label: string;
  score: number;
  weight?: number;
  description?: string;
};

function colorFor(score: number): string {
  if (score >= 4.0) return "bg-emerald-50 border-emerald-200 text-emerald-900";
  if (score >= 3.0) return "bg-sky-50 border-sky-200 text-sky-900";
  if (score >= 2.0) return "bg-amber-50 border-amber-200 text-amber-900";
  return "bg-rose-50 border-rose-200 text-rose-900";
}

export function ScoreCard({ label, score, weight, description }: Props) {
  return (
    <div className={`rounded-lg border p-5 ${colorFor(score)}`}>
      <div className="flex items-baseline justify-between">
        <div>
          <h3 className="text-sm uppercase tracking-wider font-medium opacity-70">
            {label}
          </h3>
          {weight !== undefined && (
            <span className="text-xs opacity-60">weight {Math.round(weight * 100)}%</span>
          )}
        </div>
        <span className="text-3xl font-bold tabular-nums">
          {score.toFixed(2)}
          <span className="text-base opacity-50 ml-1">/5</span>
        </span>
      </div>
      {description && <p className="mt-2 text-xs opacity-75">{description}</p>}
    </div>
  );
}
