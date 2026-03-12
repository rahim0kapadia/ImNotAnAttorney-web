"use client";

import { useEffect, useRef, useState } from "react";
import { useInView, useMotionValue, useReducedMotion, animate } from "framer-motion";

interface AnimatedCounterProps {
  target: number;
  /** Text to show after the number (e.g., "%" or "+") */
  suffix?: string;
  /** Text to show before the number (e.g., "$") */
  prefix?: string;
  /** Animation duration in seconds */
  duration?: number;
  className?: string;
}

export function AnimatedCounter({
  target,
  suffix = "",
  prefix = "",
  duration = 1.5,
  className,
}: AnimatedCounterProps) {
  const ref = useRef<HTMLSpanElement>(null);
  const isInView = useInView(ref, { once: true, amount: 0.5 });
  const shouldReduce = useReducedMotion();
  const motionValue = useMotionValue(0);
  const [displayValue, setDisplayValue] = useState(target);

  useEffect(() => {
    if (!isInView || shouldReduce) return;

    setDisplayValue(0);
    const controls = animate(motionValue, target, {
      duration,
      ease: "easeOut",
      onUpdate: (v) => setDisplayValue(Math.round(v)),
    });

    return () => controls.stop();
  }, [isInView, target, duration, motionValue, shouldReduce]);

  return (
    <span ref={ref} className={className}>
      {prefix}
      {displayValue.toLocaleString()}
      {suffix}
    </span>
  );
}
