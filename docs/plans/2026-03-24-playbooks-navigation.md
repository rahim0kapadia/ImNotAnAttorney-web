# Add Playbooks to Site Navigation

**Context:** Repo: ImNotAnAttorney-web | Problem: /playbooks page exists but has no navigation links | Key files: Header.tsx, Footer.tsx, sitemap.ts | Tech stack: Next.js 15 + TypeScript

## Tasks

1. **Header.tsx** — Add `{ href: "/playbooks", label: "Playbooks" }` between Blog and Services in both desktop and mobile nav arrays.
2. **Footer.tsx** — Replace "Blog Topics" column with "Playbooks" column (View All + 4 charge types). Add Playbooks link to Explore column between Services and Free Resources.
3. **sitemap.ts** — Add `/playbooks` entry (priority 0.9, weekly) after `...playbookEntries` spread.

## Verification

- `npm run build` must pass with no errors.
