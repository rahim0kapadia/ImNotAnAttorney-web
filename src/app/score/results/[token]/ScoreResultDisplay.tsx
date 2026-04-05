"use client";

import { AnimatedScoreArc } from "@/components/motion/AnimatedScoreArc";
import { FadeInUp } from "@/components/motion/FadeInUp";

interface ScoreResultDisplayProps {
  score: number;
  band: string;
  observations: string[];
}

const bandColors: Record<string, string> = {
  Critical: "text-red-400",
  Concerning: "text-orange-400",
  Average: "text-yellow-400",
  Adequate: "text-green-400",
  Excellent: "text-emerald-400",
};

export function ScoreResultDisplay({ score, band, observations }: ScoreResultDisplayProps) {
  const textClass = bandColors[band] || "text-amber-400";

  return (
    <div className="mt-8 space-y-6">
      <div className="text-center">
        <div className="mx-auto">
          <AnimatedScoreArc score={score} />
        </div>
        <p className={`mt-4 text-lg font-bold ${textClass}`}>{band}</p>
        <p className="mt-2 text-sm text-zinc-400">
          Someone shared their Defense Milestone Score with you. Here&apos;s what their defense looks like.
        </p>
      </div>

      <div className="space-y-3">
        <h3 className="text-sm font-semibold text-zinc-300">Key findings:</h3>
        {observations.map((obs, i) => (
          <FadeInUp key={i} delay={i * 0.1}>
            <div className="rounded-lg border border-zinc-600 bg-zinc-900/50 p-4">
              <p className="text-sm leading-relaxed text-zinc-300">{obs}</p>
            </div>
          </FadeInUp>
        ))}
      </div>
    </div>
  );
}
