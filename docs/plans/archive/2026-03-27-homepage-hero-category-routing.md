# Plan: Update HomepageHero for Category-Based Charge Selection

## Context
- **Repo:** ImNotAnAttorney-web
- **Problem:** HomepageHero currently maps TierSlugs directly to playbook checkout URLs. ChargeTypeSelector (Task 11) is being updated to emit category slugs (strings) instead of TierSlugs. HomepageHero must handle these new category slugs.
- **Key files:** `src/components/HomepageHero.tsx`
- **Tech stack:** Next.js 15 App Router, TypeScript, Tailwind CSS
- **Key decisions:** Categories without a matching playbook route to `/start` (generic Case Decoder flow at $197). Categories with a matching playbook route to `/checkout?tier={playbookSlug}`.

## Scope
Single file: `src/components/HomepageHero.tsx`

## Tasks

### Task 1, Add CATEGORY_TO_PLAYBOOK map (above component)
```typescript
const CATEGORY_TO_PLAYBOOK: Record<string, string> = {
  "dui-driving": "dui-first-offense",
  "drug-offenses": "drug-possession",
  "sex-offenses": "sex-offense",
  "federal-specific": "federal-criminal",
  "probation-parole": "probation-violation",
  "fraud-financial": "white-collar",
};
```

### Task 2, Change state type from `TierSlug | null` to `string | null`
```typescript
const [selectedSlug, setSelectedSlug] = useState<string | null>(null);
```

### Task 3, Update CTA logic
```typescript
const playbookSlug = selectedSlug ? CATEGORY_TO_PLAYBOOK[selectedSlug] ?? null : null;

const primaryHref = playbookSlug ? `/checkout?tier=${playbookSlug}` : "/start";
const primaryLabel =
  playbookSlug && TIER_CORE[playbookSlug as TierSlug]
    ? `Get Your ${TIER_CORE[playbookSlug as TierSlug].name}, ${TIER_CORE[playbookSlug as TierSlug].priceDisplay}`
    : `Start Your Case Research, ${TIER_CORE["case-decoder"].priceDisplay}`;

const secondaryHref = selectedSlug ? "/start" : "/playbooks";
const secondaryLabel = selectedSlug
  ? `Need deeper analysis? Case Decoder, ${TIER_CORE["case-decoder"].priceDisplay}`
  : "Browse all Defense Playbooks, $97 each";
```

### Task 4, Verify TypeScript compiles
```bash
npx tsc,noEmit,skipLibCheck
```

### Task 5, Commit
Message: `feat: update HomepageHero for category-based charge selection`

## Notes
- Keep `import type { TierSlug }`, still needed for TIER_CORE lookup cast
- Categories without playbook mapping (violent-crimes, property-crimes, domestic-family, weapons, public-order, other) fall through to `/start`
