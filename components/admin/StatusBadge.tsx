type Props = {
  recommendation: string;
  overall: number;
  size?: "sm" | "md";
};

export function StatusBadge({ recommendation, overall, size = "sm" }: Props) {
  const isPass = recommendation === "Pass";
  const isReject = recommendation === "Auto_Flag_Reject";
  const style = isPass
    ? "bg-emerald-100 text-emerald-800 ring-emerald-300"
    : isReject
      ? "bg-rose-100 text-rose-800 ring-rose-300"
      : "bg-amber-100 text-amber-800 ring-amber-300";

  const padding = size === "md" ? "px-3 py-1.5 text-sm" : "px-2 py-0.5 text-xs";

  return (
    <span
      className={`inline-flex items-center gap-1.5 rounded-full ring-1 font-semibold ${padding} ${style}`}
      title={`Overall ${overall.toFixed(2)} · ${recommendation.replace("_", " ")}`}
    >
      {isPass && <span className="w-1.5 h-1.5 rounded-full bg-emerald-500" />}
      {isReject && <span className="w-1.5 h-1.5 rounded-full bg-rose-500" />}
      {!isPass && !isReject && (
        <span className="w-1.5 h-1.5 rounded-full bg-amber-500" />
      )}
      {recommendation.replace("_", " ")}
    </span>
  );
}

export function ScoreCell({ value }: { value: number }) {
  const color =
    value >= 4
      ? "text-emerald-700"
      : value >= 3
        ? "text-sky-700"
        : value >= 2
          ? "text-amber-700"
          : "text-rose-700";
  return (
    <span className={`font-semibold tabular-nums ${color}`}>
      {value.toFixed(2)}
    </span>
  );
}
