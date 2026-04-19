# Plan: Bundle OG Template Fonts Locally

Branch: worktree-agent-aceeea88
Date: 2026-04-19
Status: approved by caller (plan provided in task brief)

## Goal

Eliminate 200-400ms cold render latency and remove Google Fonts network dependency from every opengraph-image.tsx route by bundling Playfair Display 700 plus Lato 400 plus Lato 700 TTFs locally and reading them once at module scope in src/lib/og-template.tsx.

## Files to modify

- src/lib/og-template.tsx. Swap loadFont() network fetch for fs.readFileSync at module scope.
- package.json and package-lock.json. Only if the fontsource install path is chosen. Skipped because fontsource ships WOFF2 and WOFF, and Satori requires TTF or OTF.

## Files to create

- src/lib/og-fonts/PlayfairDisplay-Bold.ttf. Playfair Display weight 700 static TTF.
- src/lib/og-fonts/Lato-Regular.ttf. Lato weight 400 static TTF.
- src/lib/og-fonts/Lato-Bold.ttf. Lato weight 700 static TTF.
- src/lib/og-fonts/LICENSE-OFL.txt. SIL OFL 1.1 license text stored alongside the fonts as licensed-clean evidence.

## Producer versus consumers

src/lib/og-template.tsx is the single producer. All opengraph-image.tsx routes consume via renderOgImage(). The task brief listed three primary consumers (checkin, court-date, r). A codebase grep shows 30 plus opengraph-image.tsx routes all using the same template. Fixing the producer fixes every route.

## Numbered tasks

1. Fetch TTFs directly from the Google gstatic CDN. This is the same URL that loadFont() resolves to today via the Google Fonts CSS2 API. The improvement is doing the fetch once at build time instead of on every serverless cold render. Playfair Display and Lato are both licensed SIL OFL 1.1.

2. Write the three TTFs to src/lib/og-fonts/.

3. Write LICENSE-OFL.txt to the same directory so the license travels with the fonts.

4. Edit src/lib/og-template.tsx:
   a. Add import fs from node:fs and import path from node:path at the top of the file.
   b. Define a module-scope FONT_DIR constant equal to path.join(process.cwd(), src/lib/og-fonts).
   c. Define three module-scope constants: PLAYFAIR_BOLD, LATO_REGULAR, LATO_BOLD. Each reads its TTF via fs.readFileSync. Wrap each read in a try catch that returns undefined on failure, so a missing file falls back to Georgia or system-ui via the existing fonts array guard logic.
   d. Remove the async loadFont helper function entirely.
   e. Replace the await Promise.all loadFont calls at the top of renderOgImage with references to the three module-scope constants.
   f. Keep the fonts array shape unchanged so the Satori API contract does not change.

5. Type-check by running npx tsc noEmit skipLibCheck and confirm zero errors.

6. Test by running npx vitest run and confirm zero new failures.

7. Preview verification:
   a. Start preview with preview_start.
   b. Curl each of the three primary OG routes using the -w time_total format. Routes: http://localhost:3000/checkin/E2EBOND/opengraph-image, http://localhost:3000/court-date/E2EBOND/opengraph-image, http://localhost:3000/r/E2EBOND/opengraph-image.
   c. Confirm via preview_network that no fonts.googleapis.com or fonts.gstatic.com requests occur during OG render. Absence of those requests is the core win.
   d. Capture one preview_screenshot of an OG image. Verify the title renders in Playfair and the subtitle renders in Lato. If the fonts fall back to Georgia or system-ui, stop and debug before commit.

8. Git add explicit paths only, never -A or dot. Commit with the message perf og bundle fonts locally to eliminate per render Google Fonts fetch. Include the Co-Authored-By line for Claude Opus 4.7 1M context. Stay on the worktree branch. Do not merge to master.

## Invariants

- Do not merge to master.
- The repo .gitignore was reviewed and contains no entry that matches src/lib/og-fonts/*.ttf. Font files will be tracked normally.
- SIL OFL 1.1 permits redistribution when the license file ships alongside. LICENSE-OFL.txt covers this.
- Approximate bundle size impact: Playfair 700 around 170KB plus Lato 400 around 60KB plus Lato 700 around 60KB. Total added to the repo is around 290KB. This is a one time cost paid once; per render savings compound across every OG request for the lifetime of the product.

## Rollback

Single producer edit plus three font files plus one license file. Git reset hard on the worktree branch fully restores prior behavior. No database migrations, no API contract changes, no env var changes.
