"use client";

import { activeRubric } from "@/lib/rubric";
import type { ScoreOutput } from "@/lib/claude";

type Props = {
  score: ScoreOutput;
  open: boolean;
  onToggle: () => void;
};

export function MethodologyPanel({ score, open, onToggle }: Props) {
  const dims = [
    { key: "fluency", label: "Fluency", value: score.fluency.score },
    { key: "composure", label: "Composure", value: score.composure.score },
    { key: "eq", label: "EQ", value: score.eq.score },
    { key: "confidence", label: "Confidence", value: score.confidence.score }
  ] as const;

  return (
    <div className="rounded-lg border border-centro-primary/20 bg-centro-primary/[0.03]">
      <button
        onClick={onToggle}
        className="w-full px-6 py-4 flex items-center justify-between text-left hover:bg-centro-primary/[0.05]"
      >
        <h2 className="text-base font-semibold text-centro-primary">
          How was this scored?
        </h2>
        <span className="text-xs text-centro-primary">
          {open ? "Hide" : "Show"} ▾
        </span>
      </button>

      {open && (
        <div className="px-6 pb-6 space-y-5 text-sm text-centro-ink/85">
          <section>
            <p>
              Your screening was scored by <strong>Claude Sonnet 4.6</strong> reading the
              full transcript of your conversation with Maya, plus Hume AI's voice
              prosody and facial expression signals captured during the call. The rubric
              used is the Centro CDX{" "}
              <strong>{activeRubric.rubricName} {activeRubric.version}</strong>, tuned
              for entry-level Customer Service Agent roles in English.
            </p>
          </section>

          <section>
            <h3 className="text-xs uppercase tracking-wider font-semibold text-centro-ink/70 mb-2">
              The formula
            </h3>
            <p className="leading-relaxed">
              Your overall score is the <strong>weighted average</strong> of four
              dimensions. Each dimension is scored 0–5; the dimensions are weighted by
              their importance for BPO Customer Service work.
            </p>

            <div className="mt-3 overflow-hidden rounded border border-centro-primary/20">
              <table className="w-full text-xs">
                <thead className="bg-centro-primary/10 text-centro-primary">
                  <tr>
                    <th className="px-3 py-2 text-left">Dimension</th>
                    <th className="px-3 py-2 text-right">Your score</th>
                    <th className="px-3 py-2 text-right">× Weight</th>
                    <th className="px-3 py-2 text-right">= Contribution</th>
                  </tr>
                </thead>
                <tbody>
                  {dims.map((d) => {
                    const weight =
                      activeRubric.weightedDimensions[
                        d.key as keyof typeof activeRubric.weightedDimensions
                      ].weight;
                    const contribution = d.value * weight;
                    return (
                      <tr key={d.key} className="border-t border-centro-primary/10">
                        <td className="px-3 py-2 font-medium">{d.label}</td>
                        <td className="px-3 py-2 text-right tabular-nums">
                          {d.value.toFixed(2)}
                        </td>
                        <td className="px-3 py-2 text-right tabular-nums">
                          {(weight * 100).toFixed(0)}%
                        </td>
                        <td className="px-3 py-2 text-right tabular-nums font-medium">
                          {contribution.toFixed(2)}
                        </td>
                      </tr>
                    );
                  })}
                  <tr className="border-t-2 border-centro-primary/30 bg-centro-primary/[0.04] font-semibold">
                    <td colSpan={3} className="px-3 py-2 text-right">
                      Overall (sum of contributions)
                    </td>
                    <td className="px-3 py-2 text-right tabular-nums">
                      {score.overall.toFixed(2)}
                    </td>
                  </tr>
                </tbody>
              </table>
            </div>
          </section>

          <section>
            <h3 className="text-xs uppercase tracking-wider font-semibold text-centro-ink/70 mb-2">
              The thresholds
            </h3>
            <ul className="space-y-1 text-xs">
              <li>
                <strong className="text-emerald-700">Pass:</strong> overall ≥{" "}
                {activeRubric.passThreshold.toFixed(2)} — advance to human interview
              </li>
              <li>
                <strong className="text-amber-700">Borderline:</strong>{" "}
                {activeRubric.autoFlagRejectThreshold.toFixed(2)} &lt; overall &lt;{" "}
                {activeRubric.passThreshold.toFixed(2)} — flagged for recruiter review
              </li>
              <li>
                <strong className="text-rose-700">Auto-flag reject:</strong> overall ≤{" "}
                {activeRubric.autoFlagRejectThreshold.toFixed(2)} — recruiter reviews
                before any rejection (never auto-rejected without human eye)
              </li>
            </ul>
          </section>

          <section>
            <h3 className="text-xs uppercase tracking-wider font-semibold text-centro-ink/70 mb-2">
              What the AI evaluates
            </h3>
            <ul className="space-y-1 text-xs list-disc list-inside">
              <li>
                <strong>Transcript content</strong> — what you said, how clearly, with
                what vocabulary and structure
              </li>
              <li>
                <strong>Voice prosody</strong> (via Hume) — emotional signals in your
                voice during each turn
              </li>
              <li>
                <strong>Facial expression</strong> (via Hume Expression Measurement) —
                observable cues sampled every 2.5 seconds during the session
              </li>
              <li>
                <strong>Conversation flow</strong> — empathy moments, escalation
                attempts, composure under the role-play
              </li>
            </ul>
          </section>

          <section>
            <h3 className="text-xs uppercase tracking-wider font-semibold text-centro-ink/70 mb-2">
              Bias safeguards
            </h3>
            <ul className="space-y-1 text-xs list-disc list-inside">
              <li>
                <strong>No accent penalty</strong> — fluency measures intelligibility,
                not accent of origin
              </li>
              <li>
                <strong>No auto-rejection</strong> — recruiter reviews every low score
                before any rejection email is sent
              </li>
              <li>
                <strong>Override always available</strong> — recruiters can override the
                AI score with their own number and rationale
              </li>
              <li>
                <strong>Transparency</strong> — every score is traced to specific
                transcript quotes you can review
              </li>
            </ul>
          </section>
        </div>
      )}
    </div>
  );
}
