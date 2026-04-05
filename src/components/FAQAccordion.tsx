/**
 * FAQAccordion -- Accessible accordion component for FAQ sections.
 *
 * Renders a list of question/answer pairs as expandable panels. Only one panel
 * can be open at a time (single-expand behavior). Clicking an already-open panel
 * closes it.
 *
 * Accessibility: Uses `aria-expanded` on toggle buttons and `aria-controls` / `role="region"`
 * on answer panels. The +/- indicator is marked `aria-hidden`.
 *
 * This component is generic and reusable -- it accepts any array of { question, answer }
 * objects. It is NOT tied to any specific page's FAQ data.
 *
 * Currently used on: Services page, landing page FAQ section.
 *
 * @param props.items - Array of FAQ items, each with a `question` and `answer` string.
 */
"use client";

import { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";

interface FAQItem {
  question: string;
  answer: string;
}

interface FAQAccordionProps {
  items: FAQItem[];
}

export function FAQAccordion({ items }: FAQAccordionProps) {
  const [openIndex, setOpenIndex] = useState<number | null>(null);

  return (
    <div className="space-y-3">
      {items.map((item, i) => (
        <div
          key={i}
          className="rounded-lg border border-zinc-600 bg-zinc-900/50"
        >
          <button
            id={`faq-question-${i}`}
            onClick={() => setOpenIndex(openIndex === i ? null : i)}
            className="flex w-full items-center justify-between px-6 py-4 text-left"
            aria-expanded={openIndex === i}
            aria-controls={`faq-answer-${i}`}
          >
            <span className="text-base font-semibold text-white">
              {item.question}
            </span>
            <motion.span
              className="ml-4 text-zinc-400"
              aria-hidden="true"
              animate={{ rotate: openIndex === i ? 45 : 0 }}
              transition={{ duration: 0.2 }}
            >
              +
            </motion.span>
          </button>
          <AnimatePresence initial={false}>
            {openIndex === i && (
              <motion.div
                id={`faq-answer-${i}`}
                role="region"
                aria-labelledby={`faq-question-${i}`}
                initial={{ height: 0, opacity: 0 }}
                animate={{ height: "auto", opacity: 1 }}
                exit={{ height: 0, opacity: 0 }}
                transition={{ duration: 0.25, ease: "easeInOut" }}
                className="overflow-hidden"
              >
                <div className="border-t border-zinc-600 px-6 py-4">
                  <p className="text-base leading-relaxed text-zinc-400">
                    {item.answer}
                  </p>
                </div>
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      ))}
    </div>
  );
}
