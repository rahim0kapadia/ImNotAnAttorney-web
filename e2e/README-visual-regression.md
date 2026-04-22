# OG Visual Regression

## Spec
`e2e/og-preview-visual.spec.ts` — pins byte-accurate snapshots of partner OG images with 5% pixel-ratio tolerance.

## Baselines
Committed PNGs live in `e2e/og-preview-visual.spec.ts-snapshots/`. Do NOT hand-edit.

## First-time baseline generation

After seeding partners (`scripts/seed-e2e-partners.mjs`) and confirming the OG images render correctly against live prod:

```
E2E_SEED_READY=1 npx playwright test e2e/og-preview-visual.spec.ts --update-snapshots
```

Commit the generated PNGs.

## Regenerating after intentional brand changes

Same command. Review the diff in the generated PNGs before committing (`git diff --stat e2e/og-preview-visual.spec.ts-snapshots/`).

## Tuning tolerance

Per-call tolerance override:
```ts
expect(body).toMatchSnapshot("og-r-referral-branded.png", { maxDiffPixelRatio: 0.01 });
```

Global default (5%) lives in `playwright.config.ts`.

## Cross-platform notes

Snapshots are generated on the OS running the test. If CI uses a different OS, baselines may drift on first run. Standard Playwright workaround: add an `updateSnapshots` CI step on the canonical platform, commit the platform-specific files.
