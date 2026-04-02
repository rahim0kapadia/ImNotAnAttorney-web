"use client";

import { useState, useEffect, useCallback } from "react";
import { motion, AnimatePresence } from "framer-motion";

export function RecentPurchaseNotification() {
  const [visible, setVisible] = useState(false);
  const [dismissed, setDismissed] = useState(false);

  const showNotification = useCallback(() => {
    if (dismissed) return;
    setVisible(true);
    const timer = setTimeout(() => setVisible(false), 5000);
    return () => clearTimeout(timer);
  }, [dismissed]);

  useEffect(() => {
    // First appearance after 8 seconds
    const initial = setTimeout(showNotification, 8000);
    // Reappear every 55 seconds
    const interval = setInterval(showNotification, 55000);
    return () => {
      clearTimeout(initial);
      clearInterval(interval);
    };
  }, [showNotification]);

  return (
    <AnimatePresence>
      {visible && !dismissed && (
        <motion.div
          initial={{ opacity: 0, y: 20, x: 0 }}
          animate={{ opacity: 1, y: 0, x: 0 }}
          exit={{ opacity: 0, y: 20 }}
          transition={{ type: "spring" as const, stiffness: 200, damping: 25 }}
          className="fixed bottom-20 left-4 z-30 md:bottom-6"
        >
          <div className="flex items-center gap-3 rounded-lg border border-zinc-700 bg-zinc-800 px-4 py-3 shadow-lg shadow-black/30">
            <span className="relative flex h-2.5 w-2.5">
              <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-amber-400 opacity-75" />
              <span className="relative inline-flex h-2.5 w-2.5 rounded-full bg-amber-400" />
            </span>
            <p className="text-sm text-zinc-300">
              Others are <span className="font-semibold text-white">getting their questions</span> right now
            </p>
            <button
              onClick={() => setDismissed(true)}
              className="ml-2 text-zinc-400 hover:text-zinc-300"
              aria-label="Dismiss"
            >
              <svg className="h-4 w-4" aria-hidden="true" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
