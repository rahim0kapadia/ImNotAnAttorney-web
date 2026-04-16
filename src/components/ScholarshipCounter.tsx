'use client';

import { useEffect, useState } from 'react';
import { AnimatedCounter } from '@/components/motion/AnimatedCounter';

interface CounterData {
  total: number;
  fulfilled: number;
  waitlist: number;
  month: number;
  monthLabel: string;
}

export function ScholarshipCounter({ className = '' }: { className?: string }) {
  const [data, setData] = useState<CounterData | null>(null);

  useEffect(() => {
    fetch('/api/scholarships/counter')
      .then((r) => r.json())
      .then(setData)
      .catch(() => {}); // Silent fail, counter is progressive enhancement
  }, []);

  // Reserve layout space even when hidden to prevent CLS
  if (!data || data.total === 0) {
    return <div className={className} style={{ minHeight: '4rem' }} aria-hidden="true" />;
  }

  // A11y: single labelled announcement via aria-label; animating number is aria-hidden
  // so AT gets ONE clean announcement instead of a rapid-fire count.
  const waitlistSuffix = data.waitlist > 0 ? `, ${data.waitlist} awaiting delivery` : '';
  const monthSuffix = data.month > 0 ? `, ${data.month} funded in ${data.monthLabel}` : '';
  const accessibleLabel = `${data.total} scholarships funded to date${waitlistSuffix}${monthSuffix}`;

  return (
    <div
      role="status"
      aria-live="polite"
      aria-label={accessibleLabel}
      className={`flex flex-col items-center gap-2 ${className}`}
    >
      <div className="flex items-baseline gap-2" aria-hidden="true">
        <AnimatedCounter target={data.total} duration={1.5} className="text-3xl font-bold text-amber-400" />
        <span className="text-lg text-zinc-300">scholarships funded</span>
      </div>
      {data.month > 0 && (
        <p className="text-sm text-zinc-400" aria-hidden="true">
          {data.month} funded in {data.monthLabel}
        </p>
      )}
      {data.waitlist > 0 && (
        <p className="text-xs text-zinc-400" aria-hidden="true">
          {data.waitlist} awaiting delivery
        </p>
      )}
    </div>
  );
}
