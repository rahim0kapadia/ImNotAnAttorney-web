# Handoff: Homepage Multi-Charge Redesign QA
Date: 2026-03-27 evening

## Task
QA the live homepage at https://imnotanattorney.com after the multi-charge redesign deployment. 7 commits landed (a19ddcf → 2bcd842) covering: 8 charge types in selector, HomepageHero client component, Playbook Catalog grid, diversified testimonials, DUI hardcode removal. Need to verify 6 items on the live site.

## Approach
Use Playwright MCP (headless browser) to navigate, click, screenshot, and evaluate DOM on the live homepage. Never puppeteer or screen-capture-mcp.

## Files Modified
- `C:\Users\email\.claude\settings.json`, added `"enabledMcpjsonServers": ["playwright"]` to fix Playwright MCP not connecting. External linter also added `enforce-procedure-read.js` and `track-procedure-read.js` hooks.

## What Didn't Work
- **Puppeteer MCP was used by mistake**, Playwright MCP was configured in `~/.claude/.mcp.json` but wasn't appearing in deferred tools. Root cause: needed explicit `enabledMcpjsonServers` entry in settings.json. Puppeteer got partial results (screenshot confirmed 8 buttons render correctly, default CTA shows "Start Your Case Research, $197") but click tests failed on selector syntax.
- **Lesson:** When a configured MCP server doesn't appear in deferred tools, check `enabledMcpjsonServers` in settings.json. Don't silently fall back to a different tool.

## Partial Results (from puppeteer, before we stopped)
- 8 charge type buttons confirmed visible: DUI, Drug Possession, Drug Trafficking, Probation Violation, White Collar, Sex Offense, Federal Criminal, Self-Defense
- Default CTA: "Start Your Case Research, $197" + "Browse all Defense Playbooks, $97 each"
- These need re-verification with Playwright

## Remaining Steps
1. Verify Playwright MCP tools appear in deferred tools (should work after session restart)
2. Navigate to https://imnotanattorney.com
3. Verify: 8 charge type buttons visible in selector
4. Verify: Clicking a charge updates CTA text + href dynamically (click each of the 8)
5. Verify: Playbook Catalog grid shows 8 cards with checkout links (scroll down)
6. Verify: Testimonials include probation violation (Linda M.) + family buyer (Maria G.)
7. Verify: No DUI hardcodes in hero, final CTA, value anchor, or lead capture (full page text scan)
8. Verify: Schema JSON-LD knowsAbout has all 8 charge types (evaluate DOM script)

## Verification
- Use Playwright MCP `browser_navigate`, `browser_screenshot`, `browser_click`, `browser_evaluate` tools
- For text scan: evaluate JS to get full page innerText, search for "DUI" outside expected contexts
- For schema: `document.querySelectorAll('script[type="application/ld+json"]')` and parse knowsAbout
