"use client";

import { useEffect, useRef } from "react";
import { motion, useInView, useMotionValue, useReducedMotion, animate } from "framer-motion";
import { AnimatedCounter } from "./AnimatedCounter";

interface AnimatedScoreArcProps {
  score: number;
  maxScore?: number;
  size?: number;
}

function getScoreColor(score: number): string {
  if (score <= 20) return "#ef4444"; // red
  if (score <= 40) return "#f97316"; // orange
  if (score <= 60) return "#eab308"; // yellow
  if (score <= 80) return "#22c55e"; // green
  return "#10b981"; // emerald
}

export function AnimatedScoreArc({ score, maxScore = 100, size = 200 }: AnimatedScoreArcProps) {
  const ref = useRef<SVGSVGElement>(null);
  const isInView = useInView(ref, { once: true, amount: 0.5 });
  const progress = useMotionValue(0);

  const strokeWidth = 12;
  const radius = (size - strokeWidth) / 2;
  const circumference = 2 * Math.PI * radius;
  const normalizedScore = Math.min(score / maxScore, 1);

  const shouldReduce = useReducedMotion();

  useEffect(() => {
    if (!isInView || shouldReduce) return;
    const controls = animate(progress, normalizedScore, {
      duration: 1.8,
      ease: "easeOut",
    });
    return () => controls.stop();
  }, [isInView, normalizedScore, progress, shouldReduce]);

  const color = getScoreColor(score);

  return (
    <div className="relative inline-flex items-center justify-center" style={{ width: size, height: size }}>
      <svg
        ref={ref}
        width={size}
        height={size}
        viewBox={`0 0 ${size} ${size}`}
        className="-rotate-90"
      >
        {/* Background circle */}
        <circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          fill="none"
          stroke="#27272a"
          strokeWidth={strokeWidth}
        />
        {/* Animated progress circle */}
        {shouldReduce ? (
          <circle
            cx={size / 2}
            cy={size / 2}
            r={radius}
            fill="none"
            stroke={color}
            strokeWidth={strokeWidth}
            strokeLinecap="round"
            strokeDasharray={circumference}
            strokeDashoffset={circumference * (1 - normalizedScore)}
          />
        ) : (
          <motion.circle
            cx={size / 2}
            cy={size / 2}
            r={radius}
            fill="none"
            stroke={color}
            strokeWidth={strokeWidth}
            strokeLinecap="round"
            strokeDasharray={circumference}
            style={{
              strokeDashoffset: progress.get() === 0
                ? circumference
                : undefined,
            }}
            initial={{ strokeDashoffset: circumference }}
            animate={isInView ? { strokeDashoffset: circumference * (1 - normalizedScore) } : {}}
            transition={{ duration: 1.8, ease: "easeOut" }}
          />
        )}
      </svg>
      {/* Center score */}
      <div className="absolute inset-0 flex flex-col items-center justify-center">
        <AnimatedCounter
          target={score}
          duration={1.8}
          className="text-4xl font-bold"
          suffix=""
        />
        <span className="text-sm text-zinc-500">/ {maxScore}</span>
      </div>
    </div>
  );
}
