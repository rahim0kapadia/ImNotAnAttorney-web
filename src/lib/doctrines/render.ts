/**
 * TICKET-10: Doctrine spotlight render fragment.
 *
 * Pure-function HTML/markdown renderer used by Intelligence Brief,
 * X-Ray, and Charge Authority Pack. Takes pre-fetched data (from
 * lookup.ts -- service-role Supabase) and emits markdown ready for the
 * IB markdown->HTML pipeline (render.ts in intelligence-brief/).
 *
 * Dependency-free: safe for Deno Edge Function calling sites, though
 * the typical caller is the Node generate-report path which fetches
 * the spotlights in advance and passes them in.
 *
 * Anti-hallucination invariant: every rendered quote is verbatim from
 * cl_opinion_bodies and is paired with its source_url. The renderer
 * never paraphrases, never trims for length beyond the stored
 * quote_text. URL is shown alongside as the verification anchor.
 */

import type { DoctrineSpotlight } from './lookup';
import { DOCTRINE_BY_SLUG } from './taxonomy';

interface RenderOptions {
  /** Heading depth -- ## (h2) for IB top-level, ### (h3) for nested. */
  headingLevel?: 2 | 3 | 4;
  /** Override section title. Default: "Doctrine Spotlight". */
  title?: string;
  /** Limit rendered doctrines (in case caller pre-fetched more). */
  maxDoctrines?: number;
  /** Limit quotes per doctrine. Default: 3. */
  maxQuotesPerDoctrine?: number;
  /** State name for context (e.g. "Florida"). Optional. */
  stateName?: string;
}

/**
 * Render the doctrine spotlight section as markdown.
 *
 * Skips entirely if zero doctrines have spotlights -- caller decides
 * whether to log/surface absence.
 */
export function renderDoctrineSpotlights(
  spotlightsByDoctrine: Map<string, DoctrineSpotlight[]>,
  opts: RenderOptions = {},
): string {
  const heading = '#'.repeat(opts.headingLevel ?? 2);
  const subheading = '#'.repeat((opts.headingLevel ?? 2) + 1);
  const title = opts.title ?? 'Doctrine Spotlight';
  const maxQuotes = opts.maxQuotesPerDoctrine ?? 3;
  const stateLabel = opts.stateName ?? 'your state';

  // Collect doctrines that actually have spotlights.
  const populatedSlugs: string[] = [];
  for (const [slug, quotes] of spotlightsByDoctrine) {
    if (quotes && quotes.length > 0) populatedSlugs.push(slug);
  }
  if (populatedSlugs.length === 0) return '';

  const limited = opts.maxDoctrines
    ? populatedSlugs.slice(0, opts.maxDoctrines)
    : populatedSlugs;

  const lines: string[] = [];
  lines.push(`${heading} ${title}`);
  lines.push('');

  // Lead paragraph (UPL-safe -- describes data, never advises).
  if (limited.length === 1) {
    const slug = limited[0];
    const doctrine = DOCTRINE_BY_SLUG.get(slug);
    const count = (spotlightsByDoctrine.get(slug) ?? []).length;
    if (doctrine) {
      lines.push(
        `The **${doctrine.name}** doctrine has been treated in opinions relevant to ${stateLabel}. ` +
        `${count === 1 ? 'One quote' : `${count} quotes`} most relevant to your charge below.`,
      );
      lines.push('');
    }
  } else {
    lines.push(
      `${limited.length} doctrines relevant to your charge have been treated in opinions in ${stateLabel}. ` +
      `Each section below shows up to ${maxQuotes} verbatim quotes ranked by citation depth.`,
    );
    lines.push('');
  }

  for (const slug of limited) {
    const doctrine = DOCTRINE_BY_SLUG.get(slug);
    const quotes = (spotlightsByDoctrine.get(slug) ?? []).slice(0, maxQuotes);
    if (quotes.length === 0) continue;

    lines.push(`${subheading} ${doctrine?.name ?? slug}`);
    if (doctrine?.description) {
      lines.push('');
      lines.push(`_${doctrine.description}_`);
    }
    lines.push('');

    for (const q of quotes) {
      const venue = q.stateCode ? `${q.stateCode} courts` : 'federal courts';
      // Single-line bullet with quote + source link. The quote_text is
      // verbatim from cl_opinion_bodies -- no paraphrase, no trim.
      const cleanedQuote = q.quoteText
        .replace(/\s+/g, ' ')
        .trim();
      lines.push(
        `- **${venue}, cited ${q.citationCount}x** — "${cleanedQuote}" ` +
        `[[Source]](${q.sourceUrl})`,
      );
    }
    lines.push('');
  }

  // Provenance footer for UPL safety + audit.
  lines.push('---');
  lines.push(
    `_Quotes extracted verbatim from CourtListener opinion bodies. ` +
    `Source URLs link to the originating opinion on courtlistener.com. ` +
    `These quotes describe how courts have treated each doctrine in published opinions; ` +
    `they are not legal advice. Discuss application to your case with your attorney._`,
  );

  return lines.join('\n');
}

/**
 * Compact one-liner summary for the IB front-page case-snapshot widget.
 */
export function renderDoctrineSummary(
  spotlightsByDoctrine: Map<string, DoctrineSpotlight[]>,
  opts: { stateName?: string } = {},
): string {
  const populated: { slug: string; count: number }[] = [];
  let totalQuotes = 0;
  for (const [slug, quotes] of spotlightsByDoctrine) {
    if (quotes && quotes.length > 0) {
      populated.push({ slug, count: quotes.length });
      totalQuotes += quotes.length;
    }
  }
  if (populated.length === 0) return '';

  const names = populated
    .slice(0, 3)
    .map((p) => DOCTRINE_BY_SLUG.get(p.slug)?.name ?? p.slug)
    .join(', ');
  const more = populated.length > 3 ? `, +${populated.length - 3} more` : '';
  const stateLabel = opts.stateName ?? 'your state';

  return `${populated.length} doctrines (${names}${more}) found in ${totalQuotes} opinions relevant to ${stateLabel}.`;
}
