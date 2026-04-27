# Bondsman Modes — Phase 0 Elite Design

**Date:** 2026-04-17
**Supersedes Phase 0 deliverable fields in:** [2026-04-17-bondsman-checkin-toggle-amendments.md](2026-04-17-bondsman-checkin-toggle-amendments.md) (Amendment 7 list) and [2026-04-17-bondsman-checkin-toggle.md](2026-04-17-bondsman-checkin-toggle.md) (§ "Phase 0 — Elite Design Session" and § "OG Preview Copy"/"Bridge Page Copy")
**Status:** design only — no code, schema, or route changes this session
**Experts triangulated (cached):** April Dunford, Peep Laja, Sabri Suby, Atticus (INAA voice)

---

## How to read this doc

- **Amendments win on conflict.** Base plan's `/checkin/{CODE}` bridge + `/{reminders-path}/{CODE}` scaffold are replaced by the architecture below (per Amendment 3 + Amendment 8).
- **One client URL per mode.** Bondsman sends one URL, ever. Dashboard surfaces one URL. No two-button UI.
- **`/prep/{token}` OG is out of scope** for bondsman previews (Amendment 3).
- **Amendment 9 decision:** **A — new `/checkin/{CODE}/page.tsx` signup page.** Rationale in § 10.
- **Discount framing rewrite (Amendment 6) applies to BOTH modes**, not just referral mode — § 9.

---

## 1. URL shape for Check-in mode entry page

**Decision: `/checkin/{CODE}`**

Candidates considered:

| Candidate | Pros | Cons |
|---|---|---|
| **`/checkin/{CODE}`** | Short. Unambiguous. Speakable at jail-desk ("slash check-in"). URL IS the category signal. Parallel to existing `/prep/{token}` vocabulary without collision. | None material. |
| `/court-check-in/{CODE}` | More literal. | Hyphenated. Harder to speak. Longer in SMS preview line. |
| `/my-check-in/{CODE}` | Possessive, warm. | "My-" reads as a claim, not a service. Dunford: path is category, not personal pronoun. |
| `/daily-check-in/{CODE}` | Describes cadence. | Over-promises cadence (Phase 1 cron is not necessarily daily for every bondsman). |

**Why `/checkin/{CODE}` (expert cascade):**

- **Dunford (5-component canvas, market-category):** URL path is category-carrying. In the defendant's head at 3AM the path answers "what is this?" before the page loads. `/checkin/` is a product-category noun; `/r/ACME/...` is an industry-insider affiliate artifact. Choosing the product-category name forecloses the "is this spam?" reflex that kills unfurls in iMessage.
- **Laja (B2B Message Layers, Clarity first):** Clarity beats clever. Single unhyphenated word. No mental decompression needed.
- **Suby (Godfather Offer):** Must survive a one-sentence spoken handoff at the bondsman's desk ("Go to imnotanattorney.com slash check-in slash your code"). `/checkin/{CODE}` is the shortest path that carries full meaning.
- **Atticus (crisis-buyer filter):** Spouse reading the SMS at 3AM sees "imnotanattorney.com/checkin/ACME" and knows in under one second what the link is for. Passes.

**Cascade check (5-node):**

- **Us:** one new route tree, path lives long-term even as we add `/checkin/{CODE}/weekly`, `/checkin/{CODE}/county-rules` variants.
- **Bondsman:** one URL, reads as a service they're handing the client.
- **Defendant / spouse:** URL itself tells them the page is a check-in sign-up before they tap.
- **Downstream (indemnitors, family):** printed QR code on bail packet carries the same unambiguous path.
- **Ecosystem:** legal-tech category gets a clean convention other vendors can adopt without extraction.
- **Future-us:** attorney-partner, recovery-coach modes can fork parallel paths (`/consult/{CODE}`, etc.) without competing with `/checkin/`.

---

## 2. URL shape for Referral mode entry page

**Decision: `/court-date/{CODE}`**

Candidates considered:

| Candidate | Pros | Cons |
|---|---|---|
| **`/court-date/{CODE}`** | Mirrors the defendant's lived reality. Speakable. Hyphen is a natural phrase break, not a word-boundary hack. Describes the hook (court-date reminders) without over-promising compliance. | Slightly longer than `/ready/`. |
| `/referral/{CODE}` | Literal. | Industry-insider. Reads as an affiliate artifact. Fails Dunford category-signal test and Laja clarity test. |
| `/ready/{CODE}` | Short. | Vague. "Ready for what?" — fails clarity at 3AM. |
| `/my-court-date/{CODE}` | Possessive warmth. | Same "my-" issue as § 1. Path should be the category, not a claim. |
| `/reminders/{CODE}` | Describes function. | Too narrow — the page is a full product-funnel entry, not just a reminders signup. |
| `/prep/{CODE}` | Short. | Collides with `/prep/{token}` (per-client token-gated page). Bondsman + defendant would both see `/prep/...` URLs meaning two different things. Hard no. |

**Why `/court-date/{CODE}`:**

- **Dunford:** "court date" is the universal category the defendant already thinks in. Path names the thing, not the internal mechanism.
- **Laja:** spoken aloud ("slash court date"), the hyphen is heard as a natural pause. Zero ambiguity.
- **Suby:** the Godfather Offer here is "we handle your court date." Path carries the offer frame.
- **Atticus:** defendant-first. "Your court date" is what the arrestee is lying awake thinking about at 3AM. URL meets them where their attention already is.

**Cascade check — Dunford "not a half-version" test for Referral mode:**

Referral mode must be a real offer in its own right, not "Check-in minus check-ins." `/court-date/{CODE}` names an offer (court-date reminders + hearing prep + product funnel) that stands alone. Bondsmen who won't run check-ins (liability posture, simpler operation, non-Captira shops) get a URL that reads every bit as legitimate as `/checkin/`. Defendants get a real category-native page, not a stripped-down variant. No half-version.

- **Us:** parallel path, zero naming collision with `/prep/{token}` or `/r/{CODE}`.
- **Bondsman (referral mode):** hands over a URL that describes a service, not a lesser mode.
- **Defendant:** URL speaks to their actual concern. Same hook they'd be Googling on their own.
- **Downstream:** printed QR carries a category, not an affiliate slug.
- **Ecosystem:** bail-bond industry gets a mode-native URL pattern that matches how the industry splits.
- **Future-us:** `/court-date/{CODE}/prep`, `/court-date/{CODE}/county-rules` all slot without rearchitecture.

---

## 3. OG preview copy — Check-in mode entry

Calls `renderOgImage()` from locked [src/lib/og-template.tsx](src/lib/og-template.tsx). Template untouched.

```
category: Court Check-In
title:    Referred by
          {partnerName}.
subtitle: Daily check-ins, court date reminders, and what to expect at your hearing.
alt:      "Court check-in referred by {partnerName} — ImNotAnAttorney"
```

Notes:

- `{partnerName}` interpolates the bondsman's `name` (fallback to `company` if name empty).
- UPL-safe: subtitle names services we actually deliver (check-ins, reminders, hearing prep description). No "we'll make sure you don't miss court." No legal outcome claims.
- Crisis-buyer filter: 3AM spouse sees "Court Check-In" tag + partner name + three concrete service nouns. Passes.
- Brand voice: anonymous-by-necessity compatible — no founder name needed on OG. Partner name is the trust anchor, by design.

---

## 4. OG preview copy — Referral mode entry

```
category: Court Prep
title:    Referred by
          {partnerName}.
subtitle: Court date reminders and what to expect at your hearing.
alt:      "Court prep referred by {partnerName} — ImNotAnAttorney"
```

Notes:

- Category differs ("Court Prep" vs "Court Check-In") so unfurls signal the mode pre-tap.
- Subtitle drops the check-in noun so there's no implied promise of a compliance workflow the bondsman doesn't run.
- UPL-safe. No outcome claims. Named deliverables only.
- Parallel title construction keeps the partner-name trust anchor consistent across modes.

---

## 5. Check-in signup page copy

**Route:** `/checkin/[code]/page.tsx` (NEW — per Amendment 8 blast radius)

**Server component.** Looks up partner by `code`. If not found or not approved → redirect `/`. Middleware sets referral cookie on `/checkin/*` prefix (per Amendment 8).

### Page copy

```
Eyebrow (small, uppercase, amber):
  COURT CHECK-IN

Headline (display font, 3xl-4xl):
  Set up your court check-in.

Subheadline (lg, zinc-300):
  {partnerName} sent you here. Once you sign up, you'll get court-date reminders,
  check-in prompts between now and your hearing, and a walkthrough of what to
  expect in the courtroom.

Form section heading (visually hidden, sr-only):
  Your information

Field labels (re-use CourtReminderForm field set):
  First name *
  Mobile phone *         (helper: "We text your check-in prompts and reminders here.")
  Email *                (helper: "Backup channel and your prep link.")
  Court date *           (helper: "The next hearing on your case.")
  County and state *     (helper: "e.g. Pinellas County, Florida.")
  Charge type *          (existing <select> of CHARGE_DISPLAY_NAMES)

Consent (required checkbox):
  I agree to text and email from ImNotAnAttorney about my court date and check-ins.
  Message/data rates may apply. Reply STOP to opt out. Privacy policy.

Submit button:
  Start My Check-Ins

Legal footer (zinc-400, text-sm):
  ImNotAnAttorney provides information and questions, not legal advice.

Discount note (amber, small, below CTA):
  Because {partnerName} sent you, you save 10% on case analysis if you want it later.
  Applied automatically at checkout.
```

### Post-submit redirect message

Server action creates `court_reminders` row + token, fires welcome email (existing flow), then redirects to `/r/{CODE}` (the existing trust-build bridge — carries the quiz → product funnel). The handoff is silent on the server, but the first screen the client sees on `/r/{CODE}` stands in for a confirmation.

To avoid a "did it work?" flash, render a tiny confirmation toast or inline banner at the top of `/r/{CODE}` for one navigation cycle, using a `?fromCheckin=1` query param:

```
Banner (zinc-800, green-400 accent, auto-dismisses after 6s or on scroll):
  You're in. Check your phone for a confirmation text.
  Next up: 2-minute walkthrough of your case below.
```

(If the `/r/{CODE}` implementation session decides a banner is out of scope, the alternative is a dedicated `/checkin/[code]/done` confirmation screen before redirecting. Either is acceptable; this doc prefers the banner to keep the funnel short.)

### UPL / crisis-buyer audit on signup copy

- Headline names the service, not an outcome. Pass.
- Subheadline deliverables are real (reminders, check-in prompts, hearing walkthrough). Pass.
- Submit button is imperative-present ("Start"), matches anxiety-reducing action framing (Covello, Fogg). Pass.
- Discount note is relational ("because {partnerName} sent you") not transactional. Matches Amendment 6. Pass.
- Footer restates UPL posture. Pass.

---

## 6. Trust-build bridge copy — Referral mode

**Decision: reuse existing [BridgePage.tsx](src/components/BridgePage.tsx) as-is for Referral mode** — with one line replaced (the discount line) per Amendment 6. **That same line change applies to Check-in mode's post-signup bridge render too.** It is NOT a referral-mode-only change.

Rationale:

- BridgePage is partner-name-anchored trust transfer (Brunson bridge framework). Content is mode-agnostic by design — "they see a lot of people go through what you're going through. The ones who do best are the ones who show up to their attorney prepared with the right questions." That holds for every bondsman, check-in or referral.
- CTA "Take Back Control of Your Case" → `/r/{promoCode}/quiz` works for both modes. The quiz is the universal funnel entry.
- Adding a mode-specific bridge variant inflates blast radius for no reader benefit. Laja: single high-clarity page beats a forked half-twins pair.
- Duplication is exactly the kind of thing Dunford flags as diluting the product — "we do court prep" is the category, not "we do referral-mode court prep vs check-in-mode court prep."

### The one line that changes (both modes)

Current discount line on BridgePage (lines 57-59):

```tsx
<p className="text-amber-400 font-bold text-lg mb-6">
  Their code <span className="font-mono">{promoCode}</span> saves you 10%.
</p>
```

Replace with:

```
Because {partnerName} sent you, you save 10% at checkout.
Applied automatically — no code to remember.
```

Bold-amber on the first line, zinc-400 text-sm on the second. Keep visual weight so the incentive lands, but drop the `{promoCode}` monospace artifact (which is what makes it read transactional).

### Pseudocode for the replacement fragment

```
<p className="text-amber-400 font-bold text-lg mb-2">
  Because {displayName} sent you, you save 10% at checkout.
</p>
<p className="text-zinc-400 text-sm mb-6">
  Applied automatically — no code to remember.
</p>
```

(Implementation session renders `displayName` the same way line 23 already computes it — with or without company/city — so the relational framing inherits the same personalization as the headline.)

---

## 7. Dashboard copy swaps — Referral-mode bondsmen

### 7a. `CreativeAssets.tsx` template #6 replacement (Verbal One-Liner)

Current (lines 42-45): `"After you tell them about check-ins, say: ..."` — assumes check-in conversation.

**Referral-mode replacement:**

```
label:    "Verbal One-Liner (at the bail desk)"
template: |
  When you hand them the bail paperwork, say:

  "Your court date reminders and hearing prep are on this card. Scan the QR or go
  to the link. Because you're our client, 10% off is built in if you want deeper
  case analysis."

  One sentence of context, one QR hand-off. That's it.
```

**Check-in mode keeps the current template** with only the Amendment 6 rewrite (drop the code, keep the check-in framing):

```
label:    "Verbal One-Liner (for check-ins)"
template: |
  After you tell them about check-ins, say:

  "Your court date reminders and what to expect at your hearing are on this link.
  imnotanattorney.com — because you're our client, 10% off is already built in."

  One sentence. That's it.
```

### 7b. `MessageTemplates.tsx` "Add to your check-in text" replacement

Current (line 17-19): `"Add to your check-in text"` — presupposes a check-in text exists.

**Referral-mode replacement** (swaps in when `partner.check_in_enabled === false`):

```
label:    "After the bail packet hand-off"
template: |
  Hey [name], this is [your name] from [company]. Your court date reminders and
  hearing prep are set up here: {url}. Because you're our client, 10% off any
  case analysis is built in — no code to remember.
```

**Check-in mode keeps the current template** with Amendment 6 rewrite:

```
label:    "Add to your check-in text"
template: |
  Hey [name], this is [your name]. Check-in: [day/time]. Free court date
  reminders and what to expect at your hearing: {url}. Because you're our
  client, 10% off any case analysis is built in.
```

Other MessageTemplates rewrites (Amendment 6, both modes) — § 9 lists the full set.

### 7c. `ClientTracker.tsx` empty-state copy — check-in columns hidden

When `partner.check_in_enabled === false`, hide:

- Summary stat 4 ("Check-Ins" counter tile)
- Table columns: "Check-Ins", "Schedule"
- Colored-dot status on the Name column (green/red/zinc indicators are check-in specific)

Empty-state copy (when `clients.length === 0` and `!check_in_enabled`):

```
No clients yet. When defendants use your link and sign up for court date
reminders, they'll show up here with their court date, reminder progress,
and whether they converted to case analysis.
```

(Replaces the current `"No clients yet. When defendants use your link and sign up for court prep, they'll appear here."`)

Summary-stats grid reflows from `grid-cols-4` to `grid-cols-3` when check-in mode is off. The 3 remaining tiles (Active / This Week / Converted) keep their sizing.

### 7d. Dashboard toggle label + helper text

New section on `/partner/dashboard` settings area (base plan Phase 6):

```
Section heading:
  Client workflow

Radio group legend:
  How do you want your link to work?

Option 1:
  [•] Check-in mode
  Your clients get daily check-in prompts plus court date reminders.
  You see who's checking in, who's not, and missed-check-in alerts land in your inbox.

Option 2:
  [ ] Referral mode
  Your clients get court date reminders and hearing prep — no daily check-in workflow.
  Cleaner compliance posture. You see court dates, reminder progress, and conversions.

Helper text (below radio group, zinc-400):
  You can switch modes later. When you do, your partner link changes:
  • Check-in mode uses imnotanattorney.com/checkin/{YOUR_CODE}
  • Referral mode uses imnotanattorney.com/court-date/{YOUR_CODE}
  The old link keeps working for any QR codes or flyers you already printed,
  but it'll show the new mode's preview. Best practice: reprint your bail-packet
  insert within a week.

Submit button:
  Save Workflow Setting
```

Post-save banner is already specified in base plan § "Rollback Plan" — keep that banner, update copy to match the new URLs.

---

## 8. `PartnerApplicationForm.tsx` radio block copy

Lives in the bondsman-only application (gated by `source === "bondsman"`).

```
<fieldset className="...">
  <legend className="block text-sm text-zinc-400 mb-2">
    How do you work with clients after bonding? *
  </legend>

  <label className="flex items-start gap-3 cursor-pointer mb-3">
    <input type="radio" name="checkInMode" value="enabled" required />
    <span>
      <strong className="text-white block">I run check-ins.</strong>
      <span className="text-sm text-zinc-400">
        You do daily or scheduled check-ins with clients between bond and court.
        Your clients get check-in prompts, court date reminders, and hearing
        prep. You see who's on track and who isn't.
      </span>
    </span>
  </label>

  <label className="flex items-start gap-3 cursor-pointer">
    <input type="radio" name="checkInMode" value="disabled" required />
    <span>
      <strong className="text-white block">Reminders only.</strong>
      <span className="text-sm text-zinc-400">
        You don't run a check-in workflow. Your clients get court date reminders
        and hearing prep without the daily check-in layer. Cleaner compliance
        posture, simpler operation.
      </span>
    </span>
  </label>

  <p className="text-xs text-zinc-500 mt-2">
    Pick what matches how you already operate. You can switch later in your
    dashboard.
  </p>
</fieldset>
```

Crisis-buyer filter / Atticus voice audit:

- **Dunford "not a half-version":** option 2 copy is affirmatively a real choice ("cleaner compliance posture, simpler operation"), not a lesser variant. Bondsmen whose lawyers told them not to run check-ins hear "yes, this fits you" not "you're the downgrade tier."
- **Suby clarity:** each option labels the operational distinction in one sentence before the helper text. Spoken-aloud test passes.
- **Atticus voice:** professional, specific, non-corporate. No apology for anonymity; the form doesn't lean on the brand DNA here — it leans on the bondsman's own operational reality.

---

## 9. Discount-framing rewrite (Amendment 6) — all client-facing SMS/email/verbal templates, both modes

Rule: the URL carries the code via `{CODE}` path segment. Middleware sets the referral cookie on first visit. Client sees the discount at checkout automatically. No manual code-entry anywhere in client-facing copy.

### 9a. `MessageTemplates.tsx` — full set, both modes

Current three templates (lines 15-31):

```
1. "Add to your check-in text"   (check-in mode — see § 7b for mode-specific rewrites)
2. "Quick share"
3. "For someone else"
```

**Rewrite (Amendment 6, applies to both modes):**

```
1. CHECK-IN MODE — "Add to your check-in text":
   "Hey [name], this is [your name]. Check-in: [day/time]. Free court date
    reminders and what to expect at your hearing: {url}. Because you're our
    client, 10% off any case analysis is built in."

1. REFERRAL MODE — "After the bail packet hand-off":
   "Hey [name], this is [your name] from [company]. Your court date reminders
    and hearing prep are set up here: {url}. Because you're our client, 10% off
    any case analysis is built in — no code to remember."

2. BOTH MODES — "Quick share":
   "Hey [name], free court date reminders and hearing prep for your case: {url}.
    10% off if you ever need deeper analysis — already built into the link."

3. BOTH MODES — "For someone else":
   "Someone dealing with a case? Free court date reminders and what to expect at
    their hearing: {url}. 10% off any analysis if they need it — built in."
```

Replace the trailing `"Replace [name] and [your name] ..."` helper text with:

```
Replace [name] and [your name] when you paste. The link already has your code
in it, so the discount applies automatically — no code to remember or type.
```

### 9b. `CreativeAssets.tsx` — all six templates

Rewritten templates (values only; structure unchanged):

```
1. X (Twitter) Post:
   "Most people walk into court blind. The judge, prosecutor, and your own
    attorney all know each other, you're the only stranger in the room.

    This service digs into your case and gives you the exact questions to
    close that gap.

    10% off is built into the link: {url}"

2. Facebook Post:
   "If you or someone you know is dealing with criminal charges, this changed
    the game for a lot of people I work with.

    They research your case, charges, judge history, everything, and give you
    the specific questions to bring to your attorney. Not legal advice. Better:
    the information that closes the gap between you and everyone else in that
    courtroom.

    10% off comes with the link: {url}"

3. General Social Post:
   "Your attorney works with the judge and prosecutor every week. You meet
    them once.

    ImNotAnAttorney researches your case and gives you the questions that
    level the playing field. 10% off built in: {url}"

4. Intro Email:
   "Subject: Something that might help with your case

    Hey [name],

    I wanted to pass along a resource that's helped a lot of people I work
    with. It's called ImNotAnAttorney — they research your specific charges,
    your judge, and your case details, then generate the exact questions you
    should be asking your attorney.

    It's not legal advice, it's the information that helps you hold your
    attorney accountable and actually understand what's happening with
    your case.

    Here's the link: {url}
    (Because you're our client, 10% off is already built in — no code to
    remember.)

    Worth checking out while everything is still fresh.

    [Your name]"

5. Follow-Up Email:
   "Subject: Following up — that case research tool

    Hey [name],

    Just checking in. I know things are stressful right now, but I wanted to
    remind you about that service I mentioned — ImNotAnAttorney.

    The people I've sent there say it helped them feel way more prepared for
    their attorney meetings. They dig into your specific case and generate
    questions you wouldn't think to ask.

    Link: {url}
    (The 10% off is already in the link.)

    No pressure, but the earlier you get this info the more useful it is.

    [Your name]"

6. Verbal One-Liner — CHECK-IN MODE:
   "After you tell them about check-ins, say:

    'Your court date reminders and what to expect at your hearing are on this
    link. imnotanattorney.com — because you're our client, 10% off is already
    built in.'

    One sentence. That's it."

6. Verbal One-Liner — REFERRAL MODE (see § 7a):
   "When you hand them the bail paperwork, say:

    'Your court date reminders and hearing prep are on this card. Scan the QR
    or go to the link. Because you're our client, 10% off is built in if you
    want deeper case analysis.'

    One sentence of context, one QR hand-off. That's it."
```

### 9c. `PartnerApplicationForm.tsx` post-submit success copy

Current (lines 50-54) contains a suggested message with `"use my code at checkout"`:

```tsx
"Hey, I work with a company that researches criminal cases and helps defendants
 prepare the right questions for their attorney. If you use my code at checkout,
 you get 10% off. Check it out: imnotanattorney.com"
```

**Amendment 6 rewrite:**

```
"Hey, I work with a company that researches criminal cases and helps defendants
 prepare the right questions for their attorney. Send clients to your partner
 link (you'll get it in your activation email) — 10% off is built into it, no
 code to remember. Check it out: imnotanattorney.com"
```

Drop the "your promo code activates when you click the link in your email" trailing sentence — still accurate (activation still happens), but the "promo code" framing is now internal. Replace with:

```
Your partner link activates when you click the link in your email.
```

---

## 10. Amendment 9 resolution — A vs B

**Decision: A — new `/checkin/{CODE}/page.tsx` signup page.**

### A (chosen)

- New signup page at `/checkin/[code]/page.tsx`.
- Reuses `CourtReminderForm` component (same fields as `/r/[code]/reminders`).
- Server action submits → creates `court_reminders` row → fires welcome email → redirects to `/r/{CODE}?fromCheckin=1`.
- Existing `/r/[code]/reminders` stays unchanged as the self-serve path (for defendants who arrive without a bondsman link).

### B (rejected)

- Extend `/r/[code]/reminders/page.tsx` with `partner.check_in_enabled` branching.
- Bondsman's "check-in link" URL is `/r/{CODE}/reminders`.
- One page, branch on flag.

### Why A wins — expert cascade

- **Dunford, URL-is-category:** the whole point of Phase 0 is that the URL path carries the mode signal. B collapses that — bondsmen in Check-in mode would hand out `imnotanattorney.com/r/ACME/reminders`, which reads as an affiliate deep-link ("r for referral"), not a service category. Option B undoes the base plan's URL-per-mode thesis in exchange for a marginal DRY win.
- **Laja, clarity at 3AM:** `/checkin/{CODE}` in an iMessage preview passes the glance-test. `/r/ACME/reminders` reads as a deep inner-route, the kind of link people assume is spam when unfurl is missing.
- **Suby, Godfather Offer delivery:** the URL is the first line of the offer. "Slash check-in slash your code" is a Godfather URL. "Slash r slash ACME slash reminders" is a spreadsheet cell.
- **Atticus crisis-buyer filter:** arrestee's spouse at jail-desk hears "go to imnotanattorney.com slash check-in slash A-C-M-E." That works. Spelling out `/r/ACME/reminders` over speakerphone does not.

### DRY cost is real but small

- Two pages share `CourtReminderForm` and the backing API route. The duplication is a 40-line server component + a 10-line server action plus an OG file. Net cost ~60 lines. Tradeoff is fine.
- `/r/{CODE}/reminders` keeps serving the self-serve path and stays available as a fallback for non-bondsman partners and direct-traffic arrivals.

### Cascade check for option A

- **Us:** +1 route, +1 OG file, +1 API route. Modest. Funnel stays unified after the redirect.
- **Bondsman:** one URL to hand out per mode, matching their posture, with a category-signalling path.
- **Defendant:** URL → OG → page headline → post-signup banner all reinforce "court check-in." Zero cognitive dissonance.
- **Downstream:** printed QR shows `/checkin/{CODE}`, legible even without preview unfurl.
- **Ecosystem:** mode-aware URL convention compatible with future partner types.
- **Future-us:** `/checkin/{CODE}/weekly`, `/checkin/{CODE}/county`, attorney-mode forks all scaffold cleanly.

No escape clause invoked.

---

## 11. Phase 0 sign-off bar

| Gate | Result |
|---|---|
| **Dunford cascade-check — Referral mode creates wins-for-everyone, not a half-version of Check-in** | **PASS.** `/court-date/{CODE}` names a real category (court-date reminders + hearing prep + product funnel). "Reminders only." radio copy affirmatively positions it as a first-class choice for liability-conscious bondsmen. Bridge copy is mode-neutral by design — the product the defendant gets is the same product; only the bondsman's operational posture differs. |
| **Atticus UPL pass — no "we'll make sure you don't miss court" promises, no anti-attorney framing** | **PASS.** OG subtitles name services (reminders, check-in prompts, hearing walkthroughs), not outcomes. Signup page headline is imperative-present ("Set up your court check-in") not outcome-promising. Bridge copy stays on the existing "prepared with the right questions" frame — pro-defendant, not anti-attorney. Discount-framing rewrite removes the transactional "code X saves 10%" artifact and replaces with the relational brand frame. Every verbal/SMS/email template passes the "would an attorney reading this feel attacked" test. |
| **Crisis-buyer filter — 3AM arrestee's spouse does NOT scroll past previews as junk** | **PASS.** Partner name is the trust anchor at the top of both OG previews. Category tags ("Court Check-In", "Court Prep") signal legitimacy pre-tap. URL path carries the same signal in the SMS preview line itself. Subtitle services are concrete nouns the reader recognizes as what they already need at 3AM. |
| **Brand voice — anonymous-by-necessity, legal-system-has-a-file-on-you DNA, defendant-first tone** | **PASS.** OG titles lead with partner name (not our brand), reinforcing the anonymous-by-necessity posture. Bridge copy leans on partner trust, not founder identity. Signup page subheading frames the service in defendant-lived-reality terms ("your next hearing on your case", "the courtroom"). Nothing corporate-adjacent. Nothing apologetic about anonymity. "Legal system has a file on you" DNA is compatible with — not contradicted by — the functional service language on these surfaces. |

---

## 12. Implementation session handoff

Next session should execute Phase 1+ of the base plan with these overrides:

1. **Referral-mode path** in base plan is now `{referral-path} = court-date`.
2. **Check-in mode entry** is a SIGNUP page at `/checkin/[code]/page.tsx`, not a bridge. After submit, redirect to `/r/[code]?fromCheckin=1`.
3. **`/prep/[token]/opengraph-image.tsx`** stays OUT of scope (Amendment 3).
4. **`BridgePage.tsx` discount line rewrite** applies to both modes (§ 6).
5. **All MessageTemplates + CreativeAssets + signup form post-submit copy** rewritten per § 9.
6. **`CourtReminderForm`** is reused by the new `/checkin/[code]/page.tsx` — no new form component.
7. **Post-signup `/r/{CODE}?fromCheckin=1` banner** is nice-to-have; acceptable to skip if it inflates the PR.

Ready-to-paste prompt for the implementation session:

```
Execute Phase 1+ of the bondsman check-in toggle plan.

READ IN ORDER:
  1. C:\Users\email\projects\ImNotAnAttorney-web\docs\plans\2026-04-17-modes-design.md
     (Phase 0 design output — authoritative for URLs, OG copy, page copy,
      discount framing, Amendment 9 decision)
  2. C:\Users\email\projects\ImNotAnAttorney-web\docs\plans\2026-04-17-bondsman-checkin-toggle-amendments.md
     (amendments — authoritative over base plan)
  3. C:\Users\email\projects\ImNotAnAttorney-web\docs\plans\2026-04-17-bondsman-checkin-toggle.md
     (base plan — schema, rollback, ordered tasks, blast radius)

Execute in order: Phase 1 (schema) → 2 (API) → 3 (route scaffold, using the
design doc's URLs and copy) → 4 (client-facing prep) → 5 (signup form) → 6
(dashboard) → 7 (tests) → 8 (deploy). Apply all Amendment 6 rewrites from § 9
of the design doc.
```
