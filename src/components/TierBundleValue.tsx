import { getBundledProducts, getConditionalProducts, formatBundleValue } from '@/lib/product-matrix';

interface Props {
  tierSlug: string;
  /** Compact mode for checkout (no conditional products) */
  compact?: boolean;
  className?: string;
}

export function TierBundleValue({ tierSlug, compact = false, className = '' }: Props) {
  const products = getBundledProducts(tierSlug);
  const conditional = compact ? [] : getConditionalProducts(tierSlug);

  if (products.length === 0 && conditional.length === 0) return null;

  const totalValue = formatBundleValue(tierSlug);
  const headingId = `bundle-${tierSlug}`;
  const conditionalHeadingId = `bundle-${tierSlug}-conditional`;

  return (
    <div className={`rounded-lg border border-zinc-700/50 bg-zinc-800/30 p-4 ${className}`}>
      <p id={headingId} className="text-sm font-medium text-amber-400">
        Includes {totalValue}+ in standalone research
      </p>
      <ul aria-labelledby={headingId} className="mt-2 space-y-1">
        {products.map((p) => (
          <li key={p.slug} className="flex items-center justify-between text-sm">
            <span className="text-zinc-200">{p.name}</span>
            <span className="text-zinc-400">
              <span className="sr-only">, </span>
              {p.priceDisplay} standalone
            </span>
          </li>
        ))}
      </ul>
      {conditional.length > 0 && (
        <>
          <p id={conditionalHeadingId} className="mt-3 text-xs text-zinc-400">
            Plus, based on your charge type:
          </p>
          <ul aria-labelledby={conditionalHeadingId} className="mt-1 space-y-1">
            {conditional.map((p) => (
              <li key={p.slug} className="flex items-center justify-between text-xs">
                <span className="text-zinc-300">{p.name}</span>
                <span className="text-zinc-400">
                  <span className="sr-only">, </span>
                  {p.priceDisplay}
                </span>
              </li>
            ))}
          </ul>
        </>
      )}
    </div>
  );
}
