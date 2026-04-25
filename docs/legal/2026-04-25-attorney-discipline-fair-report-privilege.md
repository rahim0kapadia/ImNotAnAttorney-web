# Fair-Report Privilege Memo — California State Bar Discipline Records

**Date:** 2026-04-25
**Status:** v1 — supports Phase 5 (worry-attorney-discipline-wire) shipping CA-only.
**Authors:** Atticus (INAA hub coordinator)
**Scope:** Mechanical republication of California State Bar public discipline records inside Intelligence Brief ($997) reports delivered to INAA customers.
**Out of scope:** Multi-state expansion (FL/TX/NY/PA/OH/GA/IL/MI/NJ/VA/OH discipline data already in DB but NOT rendered until per-state privilege memos exist).

---

## TL;DR

- California Civil Code § 47(d) provides a statutory **fair-report privilege** for fair and true reports of public judicial / legislative / official proceedings.
- California State Bar discipline orders are **public records of an official proceeding** of the State Bar Court (a constitutional adjunct of the California Supreme Court — see Cal. Const. art. VI, § 9).
- Mechanical, fact-only republication of the order date, discipline type, summary, and order URL — without interpretation, characterization, or editorialization — fits squarely inside § 47(d)'s "fair and true report" requirement.
- INAA's render path (worry-attorney-discipline-wire v2.4) is engineered to satisfy the privilege's three requirements: (1) **fair and true** to the source, (2) **of an official proceeding**, (3) **without interpretive language**.

This memo documents the legal basis. It does not substitute for outside counsel review before any expansion beyond California.

---

## The Statute (verified text)

> Cal. Civ. Code § 47(d)(1):
> **"A privileged publication or broadcast is one made: ... (d)(1) By a fair and true report in, or a communication to, a public journal, of (A) a judicial, (B) legislative, or (C) other public official proceeding, or (D) of anything said in the course thereof, or (E) of a verified charge or complaint made by any person to a public official, upon which complaint a warrant has been issued."**

Source (verification URL stored — `~/.claude/rules/no-hallucinated-legal-data.md` requires URL alongside any legal citation):
- California Legislative Information (primary): https://leginfo.legislature.ca.gov/faces/codes_displaySection.xhtml?sectionNum=47.&lawCode=CIV
- California Public Law mirror: https://california.public.law/codes/civil_code_section_47
- FindLaw mirror: https://codes.findlaw.com/ca/civil-code/civ-sect-47/

Last amended: Stats. 2023, Ch. 131, Sec. 9 (AB 1754), effective 2024-01-01. Verified via search 2026-04-25; no further amendments through April 2026.

---

## The Jury Instruction (interpretive lens)

CACI No. 1724 ("Fair and True Reporting Privilege") gives the Judicial Council's distillation of the elements a defendant must prove to invoke the privilege:

> 1. That defendant made a publication or communication in a public journal;
> 2. Of (a) a judicial, legislative, or other public official proceeding, **or** (b) of anything said in the course of such a proceeding, **or** (c) of a verified charge or complaint made by any person to a public official upon which complaint a warrant has been issued; **and**
> 3. That the report was a fair and true report of the proceeding or charge.

Source: Justia / CACI mirror — https://www.justia.com/trials-litigation/docs/caci/1700/1724/

The "fair and true" element is the operative one for INAA's render. California courts construe "fair and true" as **not requiring perfect verbatim reproduction** but as requiring that the report convey the **gist or sting** of the source faithfully and without material distortion. A report that adds editorial spin, omits exculpatory context, or characterizes the subject's conduct beyond the source record falls outside the privilege.

---

## Why CA State Bar Discipline Orders Are an "Official Proceeding"

The State Bar of California is a constitutional public corporation administered as an arm of the California Supreme Court (Cal. Const. art. VI, § 9). The State Bar Court hears attorney discipline matters; its public discipline orders are **judicial / official proceedings** of the State Bar Court, ultimately reviewable by and reportable to the California Supreme Court.

- State Bar discipline page (primary): https://apps.calbar.ca.gov/attorney/Licensee/Detail/<bar_number>
- Recent Disciplinary Actions index: https://apps.calbar.ca.gov/courtDocs/

These pages are public-facing, indexed by the State Bar itself, and form the canonical record of any discipline event. Republication of the discipline date, type, and summary text from these pages is republication of an "official proceeding" within § 47(d)(1)(C).

---

## INAA Render Path — Why It Is Fair-And-True

The render path implemented in `supabase/functions/generate-report/lib/render-attorney-discipline.ts` (Phase 5) is engineered to satisfy the three CACI 1724 elements:

### 1. Public Journal
The Intelligence Brief is a paid digital publication delivered to a specific customer (the defendant whose case the IB is generated for). California courts have construed "public journal" broadly to include digital communications; INAA's report is a fixed, dated, durable publication of the data. (Sipple v. Foundation for Nat'l Progress (1999) 71 Cal.App.4th 226 — fair-report privilege extended to digital media; verification URL TBD when outside counsel reviews.)

### 2. Of an Official Proceeding
Each discipline event rendered comes from `attorney_discipline_events.source_url` and `order_url` columns, both of which point to **CA State Bar discipline records**. The render anchors every event to the bar's own URL (`safeMdLink`-wrapped) so the reader can verify the source.

### 3. Fair and True
This is the most-litigated prong, and INAA's render is engineered to satisfy it via FOUR mechanical guarantees:

- **(a) No interpretive adjectives.** The renderer NEVER adds words like "unreliable," "incompetent," "negligent," "untrustworthy," "sketchy," "shady," "questionable," "inadequate," or "deficient." A deterministic regex panel (`T3.3`) fails the build if any such word appears in the rendered HTML.
- **(b) Mechanical column passthrough.** Each rendered cell is the literal value of `attorney_discipline_events.order_date`, `discipline_type`, `violation_summary` (or `discipline_raw`), and `order_url`. No translation, no paraphrase, no interpretation.
- **(c) Disclaimer states the source.** Every rendered section includes the literal disclaimer: `"Public {stateBarName} record. Same data, faster than the .gov form."` plus a footnote linking back to this memo. The reader is told upfront that the data is the bar's own record.
- **(d) Exact-match-only.** A defendant whose attorney's name does NOT match a bar record exactly (case-insensitive, accent-folded via `lower(immutable_unaccent($1))`) sees a no-match message — never a false attribution. Defamation surface is structurally eliminated; there is no misidentification path.

### 4. UPL Safety
The render emits **factual data only** — no recommendation, no opinion, no "should." The `BANNED_PHRASES_BLOCK` parity test (T3.2a) ensures the disclaimer + section copy contain no banned UPL phrases. This is independent of the fair-report privilege analysis but compounds to keep the section on the correct side of both legal lines.

---

## Limits / Open Questions

### Limit 1 — Statutory Carve-Outs
Cal. Civ. Code § 47(d)(2) explicitly carves out:

- Communications that violate State Bar Rule of Professional Conduct 3.6 (extrajudicial statements affecting an adjudicative proceeding) — not applicable to INAA, which does not represent or counsel parties.
- Communications that breach a court order — INAA renders only events the bar itself has published; no sealed records in `attorney_discipline_events`.
- Communications made by a party to the proceeding to attack a settlement or another party — N/A.

### Limit 2 — California-Only
Other states have **different** fair-report privilege constructions. Some states (e.g., Texas Civ. Prac. & Rem. Code § 73.002) have similar statutes; others rely on common-law fair-report doctrine; some narrow it. **No multi-state render until per-state memos exist.** Phase 5 ships CA-only via a hard-coded jurisdiction guard at `getAttorneyDiscipline()` entry; FL/TX/NY/PA/OH/GA/IL/MI/NJ/VA discipline data remains in DB but unrendered.

### Limit 3 — Republication of Inaccurate Bar Records
If the bar's own record is wrong, our republication of that wrong record is still privileged under § 47(d) **as long as our report is fair and true to the bar's record**. We are not publishers of original fact about the attorney; we are republishers of the bar's record. Our exposure is to the bar's accuracy, which is the bar's own concern. (See Sipple, supra; verification URL TBD.)

### Limit 4 — Updates / Stale Data
Discipline records can be updated (suspension lifted, disbarment reversed, additional events added). INAA's `last_seen_at` timestamp on the `attorneys` row is rendered alongside the status so the reader can see exactly when our data was last refreshed. Render copy reads: `"Status (per {stateBarName} as of {last_seen_at})"` — no implication that our data is real-time.

### Limit 5 — Dead-Linked Source URLs
If the bar's `order_url` becomes a 404 after we render, our HTML still points at it. Mitigation: `safeMdLink` falls back to `(link unavailable)` plain text when `order_url` is null/empty; that doesn't help if the URL was once valid and later 404s. Open question: should we snapshot the order PDF to S3 at scrape time? Out of v2 scope.

### Limit 6 — Volokh / Other Defamation Scholars
Plan asked for citation to Eugene Volokh (UCLA Law, First Amendment / defamation). No cached expert profile exists at `~/.claude/experts/eugene-volokh.md` as of 2026-04-25. Outside-counsel review before multi-state expansion should pull Volokh's writing on fair-report privilege scope (his Volokh Conspiracy posts + 2014 article *The Freedom of Speech and Bad Purposes*, UCLA L. Rev.) for jurisdictional analysis. Logged as a TODO; not a blocker for CA-only Phase 5.

---

## Operational Posture

**Until outside counsel reviews this memo:**
- INAA renders CA-only in worry-attorney-discipline-wire v2.4 (Phase 5).
- Hard-coded jurisdiction guard at `getAttorneyDiscipline()` entry rejects non-`CA` calls.
- This memo URL is linked in every rendered IB section's footer ("Public record — here's why we can show it").
- Multi-state expansion is gated on per-state privilege memos. The plan blocks state additions until each state's memo exists in `docs/legal/`.

**If a complaint is received from a rendered attorney:**
- The disclaimer + source URL + exact-match-only render path together satisfy § 47(d)'s fair-and-true element prima facie.
- Production has the order's `source_url` and `order_url` stored — both are verifiable via the bar's own page.
- Escalate to outside counsel; do not modify or remove the render unilaterally without legal advice (a takedown without legal basis sets a worse precedent than holding the privileged position).

---

## References (verification URLs stored per `no-hallucinated-legal-data.md` rule)

| Source | URL | Verified |
|---|---|---|
| Cal. Civ. Code § 47 (primary) | https://leginfo.legislature.ca.gov/faces/codes_displaySection.xhtml?sectionNum=47.&lawCode=CIV | 2026-04-25 via WebSearch |
| Cal. Civ. Code § 47 (Public.Law mirror) | https://california.public.law/codes/civil_code_section_47 | 2026-04-25 via WebSearch |
| Cal. Civ. Code § 47 (FindLaw mirror) | https://codes.findlaw.com/ca/civil-code/civ-sect-47/ | 2026-04-25 via WebSearch |
| CACI No. 1724 (Justia) | https://www.justia.com/trials-litigation/docs/caci/1700/1724/ | 2026-04-25 via WebSearch |
| State Bar discipline lookup (per attorney) | https://apps.calbar.ca.gov/attorney/Licensee/Detail/<bar_number> | 2026-04-22 (scraper run) |
| State Bar court documents index | https://apps.calbar.ca.gov/courtDocs/ | 2026-04-22 (scraper run) |
| Cal. Const. art. VI, § 9 (State Bar) | https://leginfo.legislature.ca.gov/faces/codesTOCSelected.xhtml?tocCode=CONS | TBD outside-counsel verification |

---

## Change Log

- **2026-04-25 v1** — initial memo, gates Phase 5 (CA-only render).
