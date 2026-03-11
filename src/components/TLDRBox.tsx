/**
 * TLDRBox — Amber-bordered callout for AI-extractable direct answers.
 *
 * Used in MDX blog posts via <TLDRBox> tags. Provides a structured,
 * visually distinct summary that AI assistants can extract as a
 * direct answer to the post's core question.
 */
export function TLDRBox({ children }: { children: React.ReactNode }) {
  return (
    <div className="not-prose mb-8 rounded-lg border border-amber-500/30 bg-amber-500/5 p-4">
      <p className="mb-2 text-xs font-bold uppercase tracking-wider text-amber-400">
        TL;DR
      </p>
      <div className="text-sm leading-relaxed text-zinc-300">{children}</div>
    </div>
  );
}
