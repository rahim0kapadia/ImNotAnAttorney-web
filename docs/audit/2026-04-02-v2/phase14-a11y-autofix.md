# Phase 14, A11y Autofix Patches

**Date:** 2026-04-02
**Source audits:** phase3-axe-runtime.md, phase7-jsx-a11y-static.md
**Note:** phase2-accesslint.md was not present in the audit directory at report time. Those findings are not covered here, re-run AccessLint and append findings.
**Standards:** WCAG 2.1 Level AA
**Scope:** All real violations from Layers 3 and 7. False positives (F-05 checkout wrapping labels) excluded.

---

## Summary

| ID | Description | File | Severity | Category | WCAG |
|----|-------------|------|----------|----------|------|
| AX-01 | Duplicate `<main>`, services page | `src/app/services/page.tsx:325` | MODERATE | AUTO-FIX | 1.3.6 |
| AX-02 | Duplicate `<main>`, playbooks page | `src/app/playbooks/page.tsx:120` | MODERATE | AUTO-FIX | 1.3.6 |
| AX-03 | Duplicate `<main>`, score page | `src/app/score/page.tsx:1037` | MODERATE | AUTO-FIX | 1.3.6 |
| AX-04 | Duplicate `<main>`, start page (3 instances) | `src/app/start/page.tsx:44,119,364` | MODERATE | AUTO-FIX | 1.3.6 |
| AX-05 | Scrollable region not keyboard accessible | `src/app/sample/page.tsx:176,300,607` | SERIOUS | AUTO-FIX | 2.1.1 |
| AX-06 | Links in text block rely on color only | `src/app/research/defense-score-data/page.tsx` | SERIOUS | AUTO-FIX | 1.4.1 |
| F01-A | Missing htmlFor/id, my-cases login email | `src/app/my-cases/login/page.tsx:80` | SERIOUS | AUTO-FIX | 1.3.1 |
| F01-B | Missing htmlFor/id, partner login email | `src/app/partner/login/page.tsx:83` | SERIOUS | AUTO-FIX | 1.3.1 |
| F01-C | Missing htmlFor/id, intake checkbox group (arrest circumstances) | `src/app/intake/page.tsx:1091` | SERIOUS | AUTO-FIX | 1.3.1 |
| F01-D | Missing htmlFor/id, intake checkbox group (evidence type) | `src/app/intake/page.tsx:1228` | SERIOUS | AUTO-FIX | 1.3.1 |
| F01-E | Missing htmlFor/id, admin partner form (7 fields) | `src/app/admin/partners/page.tsx:452–526` | SERIOUS | AUTO-FIX | 1.3.1 |
| F01-F | Missing htmlFor/id, partner dashboard payment form (3 conditional fields) | `src/app/partner/dashboard/page.tsx:346–401` | SERIOUS | AUTO-FIX | 1.3.1 |
| F02-A | autoFocus on public login, my-cases | `src/app/my-cases/login/page.tsx:87` | SERIOUS | HUMAN-REVIEW | 3.2.1 |
| F02-B | autoFocus on public login, partner | `src/app/partner/login/page.tsx:90` | SERIOUS | HUMAN-REVIEW | 3.2.1 |
| F03-A | autoFocus on admin, demand password gate | `src/app/admin/demand/page.tsx:266` | MODERATE | HUMAN-REVIEW | 3.2.1 |
| F03-B | autoFocus on admin, inbox password gate | `src/app/admin/inbox/page.tsx:189` | MODERATE | HUMAN-REVIEW | 3.2.1 |
| F03-C | autoFocus on admin, inbox reply textarea | `src/app/admin/inbox/page.tsx:391` | MODERATE | HUMAN-REVIEW | 3.2.1 |
| F03-D | autoFocus on admin, OperatorShell password gate | `src/components/OperatorShell.tsx:104` | MODERATE | HUMAN-REVIEW | 3.2.1 |
| F04 | Non-interactive `<span>` with onClick, no keyboard handler | `src/components/IntakeChargeSelector.tsx:171` | MODERATE | AUTO-FIX | 2.1.1 |

---

## CRITICAL / SERIOUS, Fix First

---

### Fix AX-05: Scrollable table regions not keyboard accessible

**File:** `C:\Users\email\projects\ImNotAnAttorney-web\src\app\sample\page.tsx` lines 176, 300, 607
**Category:** AUTO-FIX
**WCAG:** 2.1.1 Keyboard
**Root cause:** Three `<div className="mt-4 overflow-x-auto">` wrappers contain tables that can overflow horizontally. WCAG requires scrollable regions be reachable via keyboard (Tab key). Adding `tabIndex={0}` and a `role="region"` with `aria-label` makes each independently focusable and announced by screen readers.

**Old (line 176):**
```tsx
<div className="mt-4 overflow-x-auto">
  <table className="w-full text-sm">
```

**New (line 176):**
```tsx
<div className="mt-4 overflow-x-auto" tabIndex={0} role="region" aria-label="Defense milestone assessment table">
  <table className="w-full text-sm">
```

**Old (line 300):**
```tsx
<div className="mt-4 overflow-x-auto">
  <p className="text-sm font-semibold text-zinc-300">
    What the prosecution must prove (elements):
  </p>
```

**New (line 300):**
```tsx
<div className="mt-4 overflow-x-auto" tabIndex={0} role="region" aria-label="Prosecution elements table">
  <p className="text-sm font-semibold text-zinc-300">
    What the prosecution must prove (elements):
  </p>
```

**Old (line 607):**
```tsx
<div className="mt-4 overflow-x-auto">
  <table className="w-full text-sm">
    <thead>
      <tr className="border-b border-zinc-700 text-left text-zinc-400">
        <th className="pb-2 pr-4">Day</th>
```

**New (line 607):**
```tsx
<div className="mt-4 overflow-x-auto" tabIndex={0} role="region" aria-label="7-day action plan table">
  <table className="w-full text-sm">
    <thead>
      <tr className="border-b border-zinc-700 text-left text-zinc-400">
        <th className="pb-2 pr-4">Day</th>
```

---

### Fix AX-06: Links in text body rely on color alone

**File:** `C:\Users\email\projects\ImNotAnAttorney-web\src\app\research\defense-score-data\page.tsx`
**Category:** AUTO-FIX
**WCAG:** 1.4.1 Use of Color
**Root cause:** Links styled `className="text-amber-400 hover:underline"` only show underline on hover. When embedded in body-text paragraphs (`<p>` blocks), users who cannot perceive color difference cannot distinguish them from surrounding text at rest. Fix: add `underline` to the static class list. The hover variant can stay for visual polish but the static underline is required.

**Note:** The standalone link at line 169 (`<Link href="/score" className="text-amber-400 hover:underline">Defense Milestone Score</Link>`) sits inside a `<p className="mt-4 text-lg text-zinc-400">` body paragraph, this is the WCAG 1.4.1 trigger. The 5 body-paragraph links below all follow the same pattern.

**Old (all 5 occurrences, use replace_all):**
```tsx
className="text-amber-400 hover:underline"
```

**New:**
```tsx
className="text-amber-400 underline hover:no-underline"
```

**Judgment note:** `underline` by default + `hover:no-underline` (underline disappears on hover, replaced by color change) is a common accessible link pattern that passes 1.4.1 without cluttering the rest state. Alternatively `underline decoration-amber-400/60` gives a subtler baseline underline. Either satisfies WCAG. The patch above is the minimal change.

---

### Fix F01-A: Missing htmlFor/id, my-cases login email label

**File:** `C:\Users\email\projects\ImNotAnAttorney-web\src\app\my-cases\login\page.tsx` line 80
**Category:** AUTO-FIX
**WCAG:** 1.3.1 Info and Relationships, 4.1.2 Name, Role, Value

**Old:**
```tsx
            <label className="block text-sm text-zinc-400 mb-1">Email address</label>
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="you@example.com"
              required
              autoFocus
              className="w-full px-4 py-3 bg-zinc-800 rounded-lg border border-zinc-700 text-white mb-4"
            />
```

**New:**
```tsx
            <label htmlFor="my-cases-email" className="block text-sm text-zinc-400 mb-1">Email address</label>
            <input
              id="my-cases-email"
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="you@example.com"
              required
              autoFocus
              className="w-full px-4 py-3 bg-zinc-800 rounded-lg border border-zinc-700 text-white mb-4"
            />
```

---

### Fix F01-B: Missing htmlFor/id, partner login email label

**File:** `C:\Users\email\projects\ImNotAnAttorney-web\src\app\partner\login\page.tsx` line 83
**Category:** AUTO-FIX
**WCAG:** 1.3.1 Info and Relationships, 4.1.2 Name, Role, Value

**Old:**
```tsx
            <label className="block text-sm text-zinc-400 mb-1">Email address</label>
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="you@example.com"
              required
              autoFocus
              className="w-full px-4 py-3 bg-zinc-800 rounded-lg border border-zinc-700 text-white mb-4"
            />
```

**New:**
```tsx
            <label htmlFor="partner-login-email" className="block text-sm text-zinc-400 mb-1">Email address</label>
            <input
              id="partner-login-email"
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="you@example.com"
              required
              autoFocus
              className="w-full px-4 py-3 bg-zinc-800 rounded-lg border border-zinc-700 text-white mb-4"
            />
```

---

### Fix F01-C: Intake checkbox group, "How did law enforcement get involved?"

**File:** `C:\Users\email\projects\ImNotAnAttorney-web\src\app\intake\page.tsx` line 1091
**Category:** AUTO-FIX
**WCAG:** 1.3.1 Info and Relationships
**Root cause:** A bare `<label>` is used as a section heading above a list of checkboxes. The label is not associated to any single control (no `htmlFor`, no wrapping `<input>`). The correct pattern for a checkbox group heading is `<fieldset>` + `<legend>`.

**Old:**
```tsx
                <div className="mt-4">
                  <label className={labelClass}>How did law enforcement get involved?</label>
                  <div className="mt-2 space-y-2">
                    {arrestCircumstances.map((circ) => (
                      <label key={circ} className="flex items-center gap-3 text-sm text-zinc-400">
                        <input type="checkbox" checked={(form.arrestCircumstances as string[]).includes(circ)}
                          onChange={(e) => {
                            const curr = form.arrestCircumstances as string[];
                            setField("arrestCircumstances",
                              e.target.checked ? [...curr, circ] : curr.filter((c) => c !== circ));
                          }}
                          className="h-4 w-4 rounded border-zinc-600 bg-zinc-800 text-amber-500 focus:ring-amber-500" />
                        {circ}
                      </label>
                    ))}
                  </div>
                </div>
```

**New:**
```tsx
                <fieldset className="mt-4 border-0 p-0 m-0">
                  <legend className={labelClass}>How did law enforcement get involved?</legend>
                  <div className="mt-2 space-y-2">
                    {arrestCircumstances.map((circ) => (
                      <label key={circ} className="flex items-center gap-3 text-sm text-zinc-400">
                        <input type="checkbox" checked={(form.arrestCircumstances as string[]).includes(circ)}
                          onChange={(e) => {
                            const curr = form.arrestCircumstances as string[];
                            setField("arrestCircumstances",
                              e.target.checked ? [...curr, circ] : curr.filter((c) => c !== circ));
                          }}
                          className="h-4 w-4 rounded border-zinc-600 bg-zinc-800 text-amber-500 focus:ring-amber-500" />
                        {circ}
                      </label>
                    ))}
                  </div>
                </fieldset>
```

---

### Fix F01-D: Intake checkbox group, "What kind of evidence is involved?"

**File:** `C:\Users\email\projects\ImNotAnAttorney-web\src\app\intake\page.tsx` line 1228
**Category:** AUTO-FIX
**WCAG:** 1.3.1 Info and Relationships

**Old:**
```tsx
                <div className="mt-4">
                  <label className={labelClass}>What kind of evidence is involved? (select all that apply)</label>
                  <div className="mt-2 space-y-2">
                    {evidenceTypeOptions.map((ev) => (
                      <label key={ev} className="flex items-center gap-3 text-sm text-zinc-400">
                        <input type="checkbox" checked={(form.evidenceType as string[]).includes(ev)}
                          onChange={(e) => {
                            const curr = form.evidenceType as string[];
                            setField("evidenceType",
                              e.target.checked ? [...curr, ev] : curr.filter((c) => c !== ev));
                          }}
                          className="h-4 w-4 rounded border-zinc-600 bg-zinc-800 text-amber-500 focus:ring-amber-500" />
                        {ev}
                      </label>
                    ))}
                  </div>
                </div>
```

**New:**
```tsx
                <fieldset className="mt-4 border-0 p-0 m-0">
                  <legend className={labelClass}>What kind of evidence is involved? (select all that apply)</legend>
                  <div className="mt-2 space-y-2">
                    {evidenceTypeOptions.map((ev) => (
                      <label key={ev} className="flex items-center gap-3 text-sm text-zinc-400">
                        <input type="checkbox" checked={(form.evidenceType as string[]).includes(ev)}
                          onChange={(e) => {
                            const curr = form.evidenceType as string[];
                            setField("evidenceType",
                              e.target.checked ? [...curr, ev] : curr.filter((c) => c !== ev));
                          }}
                          className="h-4 w-4 rounded border-zinc-600 bg-zinc-800 text-amber-500 focus:ring-amber-500" />
                        {ev}
                      </label>
                    ))}
                  </div>
                </fieldset>
```

---

### Fix F01-E: Admin partner create form, 7 unlabeled fields

**File:** `C:\Users\email\projects\ImNotAnAttorney-web\src\app\admin\partners\page.tsx` lines 452–526
**Category:** AUTO-FIX
**WCAG:** 1.3.1 Info and Relationships, 4.1.2 Name, Role, Value
**Note:** Admin-only page. Low user impact but still a real violation.

**Old:**
```tsx
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className="block text-sm text-zinc-400 mb-1">
                Name *
              </label>
              <input
                type="text"
                value={formName}
                onChange={(e) => setFormName(e.target.value)}
                required
                className="w-full px-3 py-2 bg-zinc-800 rounded-lg border border-zinc-700 text-white"
              />
            </div>
            <div>
              <label className="block text-sm text-zinc-400 mb-1">
                Company
              </label>
              <input
                type="text"
                value={formCompany}
                onChange={(e) => setFormCompany(e.target.value)}
                className="w-full px-3 py-2 bg-zinc-800 rounded-lg border border-zinc-700 text-white"
              />
            </div>
            <div>
              <label className="block text-sm text-zinc-400 mb-1">
                Email *
              </label>
              <input
                type="email"
                value={formEmail}
                onChange={(e) => setFormEmail(e.target.value)}
                required
                className="w-full px-3 py-2 bg-zinc-800 rounded-lg border border-zinc-700 text-white"
              />
            </div>
            <div>
              <label className="block text-sm text-zinc-400 mb-1">Phone</label>
              <input
                type="tel"
                value={formPhone}
                onChange={(e) => setFormPhone(e.target.value)}
                className="w-full px-3 py-2 bg-zinc-800 rounded-lg border border-zinc-700 text-white"
              />
            </div>
            <div>
              <label className="block text-sm text-zinc-400 mb-1">
                Region
              </label>
              <input
                type="text"
                value={formRegion}
                onChange={(e) => setFormRegion(e.target.value)}
                placeholder="e.g., Maricopa County, AZ"
                className="w-full px-3 py-2 bg-zinc-800 rounded-lg border border-zinc-700 text-white"
              />
            </div>
            <div>
              <label className="block text-sm text-zinc-400 mb-1">
                Promo Code (optional)
              </label>
              <input
                type="text"
                value={formCode}
                onChange={(e) => setFormCode(e.target.value)}
                placeholder="Auto-generated if blank"
                className="w-full px-3 py-2 bg-zinc-800 rounded-lg border border-zinc-700 text-white font-mono"
              />
            </div>
            <div className="md:col-span-2">
              <label className="block text-sm text-zinc-400 mb-1">Notes</label>
              <textarea
                value={formNotes}
                onChange={(e) => setFormNotes(e.target.value)}
                rows={2}
                className="w-full px-3 py-2 bg-zinc-800 rounded-lg border border-zinc-700 text-white"
              />
            </div>
          </div>
```

**New:**
```tsx
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label htmlFor="admin-partner-name" className="block text-sm text-zinc-400 mb-1">
                Name *
              </label>
              <input
                id="admin-partner-name"
                type="text"
                value={formName}
                onChange={(e) => setFormName(e.target.value)}
                required
                className="w-full px-3 py-2 bg-zinc-800 rounded-lg border border-zinc-700 text-white"
              />
            </div>
            <div>
              <label htmlFor="admin-partner-company" className="block text-sm text-zinc-400 mb-1">
                Company
              </label>
              <input
                id="admin-partner-company"
                type="text"
                value={formCompany}
                onChange={(e) => setFormCompany(e.target.value)}
                className="w-full px-3 py-2 bg-zinc-800 rounded-lg border border-zinc-700 text-white"
              />
            </div>
            <div>
              <label htmlFor="admin-partner-email" className="block text-sm text-zinc-400 mb-1">
                Email *
              </label>
              <input
                id="admin-partner-email"
                type="email"
                value={formEmail}
                onChange={(e) => setFormEmail(e.target.value)}
                required
                className="w-full px-3 py-2 bg-zinc-800 rounded-lg border border-zinc-700 text-white"
              />
            </div>
            <div>
              <label htmlFor="admin-partner-phone" className="block text-sm text-zinc-400 mb-1">Phone</label>
              <input
                id="admin-partner-phone"
                type="tel"
                value={formPhone}
                onChange={(e) => setFormPhone(e.target.value)}
                className="w-full px-3 py-2 bg-zinc-800 rounded-lg border border-zinc-700 text-white"
              />
            </div>
            <div>
              <label htmlFor="admin-partner-region" className="block text-sm text-zinc-400 mb-1">
                Region
              </label>
              <input
                id="admin-partner-region"
                type="text"
                value={formRegion}
                onChange={(e) => setFormRegion(e.target.value)}
                placeholder="e.g., Maricopa County, AZ"
                className="w-full px-3 py-2 bg-zinc-800 rounded-lg border border-zinc-700 text-white"
              />
            </div>
            <div>
              <label htmlFor="admin-partner-code" className="block text-sm text-zinc-400 mb-1">
                Promo Code (optional)
              </label>
              <input
                id="admin-partner-code"
                type="text"
                value={formCode}
                onChange={(e) => setFormCode(e.target.value)}
                placeholder="Auto-generated if blank"
                className="w-full px-3 py-2 bg-zinc-800 rounded-lg border border-zinc-700 text-white font-mono"
              />
            </div>
            <div className="md:col-span-2">
              <label htmlFor="admin-partner-notes" className="block text-sm text-zinc-400 mb-1">Notes</label>
              <textarea
                id="admin-partner-notes"
                value={formNotes}
                onChange={(e) => setFormNotes(e.target.value)}
                rows={2}
                className="w-full px-3 py-2 bg-zinc-800 rounded-lg border border-zinc-700 text-white"
              />
            </div>
          </div>
```

---

### Fix F01-F: Partner dashboard payment form, 3 conditional fields

**File:** `C:\Users\email\projects\ImNotAnAttorney-web\src\app\partner\dashboard\page.tsx` lines 346–401
**Category:** AUTO-FIX
**WCAG:** 1.3.1 Info and Relationships, 4.1.2 Name, Role, Value
**Note:** The payment method `<select>` and all three conditional fields (Zelle, Venmo, Check address) need `htmlFor`/`id` pairs. The conditional fields only render when their `payMethod` value is selected, the `id` is still valid since only one exists in the DOM at a time.

**Old:**
```tsx
            <div>
              <label className="block text-sm text-zinc-400 mb-1">
                Preferred Payment Method
              </label>
              <select
                value={payMethod}
                onChange={(e) => setPayMethod(e.target.value)}
                className="w-full px-4 py-2 bg-zinc-800 rounded-lg border border-zinc-700 text-white"
              >
                <option value="">Select...</option>
                <option value="zelle">Zelle</option>
                <option value="venmo">Venmo</option>
                <option value="check">Check (mailed)</option>
              </select>
            </div>

            {payMethod === "zelle" && (
              <div>
                <label className="block text-sm text-zinc-400 mb-1">
                  Zelle Email or Phone
                </label>
                <input
                  type="text"
                  value={payZelle}
                  onChange={(e) => setPayZelle(e.target.value)}
                  placeholder="your@email.com or (555) 123-4567"
                  className="w-full px-4 py-2 bg-zinc-800 rounded-lg border border-zinc-700 text-white"
                />
              </div>
            )}

            {payMethod === "venmo" && (
              <div>
                <label className="block text-sm text-zinc-400 mb-1">
                  Venmo Handle
                </label>
                <input
                  type="text"
                  value={payVenmo}
                  onChange={(e) => setPayVenmo(e.target.value)}
                  placeholder="@your-venmo"
                  className="w-full px-4 py-2 bg-zinc-800 rounded-lg border border-zinc-700 text-white"
                />
              </div>
            )}

            {payMethod === "check" && (
              <div>
                <label className="block text-sm text-zinc-400 mb-1">
                  Mailing Address
                </label>
                <textarea
                  value={payCheckAddress}
                  onChange={(e) => setPayCheckAddress(e.target.value)}
                  placeholder="Street, City, State, ZIP"
                  rows={3}
                  className="w-full px-4 py-2 bg-zinc-800 rounded-lg border border-zinc-700 text-white"
                />
              </div>
            )}
```

**New:**
```tsx
            <div>
              <label htmlFor="pay-method" className="block text-sm text-zinc-400 mb-1">
                Preferred Payment Method
              </label>
              <select
                id="pay-method"
                value={payMethod}
                onChange={(e) => setPayMethod(e.target.value)}
                className="w-full px-4 py-2 bg-zinc-800 rounded-lg border border-zinc-700 text-white"
              >
                <option value="">Select...</option>
                <option value="zelle">Zelle</option>
                <option value="venmo">Venmo</option>
                <option value="check">Check (mailed)</option>
              </select>
            </div>

            {payMethod === "zelle" && (
              <div>
                <label htmlFor="pay-zelle" className="block text-sm text-zinc-400 mb-1">
                  Zelle Email or Phone
                </label>
                <input
                  id="pay-zelle"
                  type="text"
                  value={payZelle}
                  onChange={(e) => setPayZelle(e.target.value)}
                  placeholder="your@email.com or (555) 123-4567"
                  className="w-full px-4 py-2 bg-zinc-800 rounded-lg border border-zinc-700 text-white"
                />
              </div>
            )}

            {payMethod === "venmo" && (
              <div>
                <label htmlFor="pay-venmo" className="block text-sm text-zinc-400 mb-1">
                  Venmo Handle
                </label>
                <input
                  id="pay-venmo"
                  type="text"
                  value={payVenmo}
                  onChange={(e) => setPayVenmo(e.target.value)}
                  placeholder="@your-venmo"
                  className="w-full px-4 py-2 bg-zinc-800 rounded-lg border border-zinc-700 text-white"
                />
              </div>
            )}

            {payMethod === "check" && (
              <div>
                <label htmlFor="pay-check-address" className="block text-sm text-zinc-400 mb-1">
                  Mailing Address
                </label>
                <textarea
                  id="pay-check-address"
                  value={payCheckAddress}
                  onChange={(e) => setPayCheckAddress(e.target.value)}
                  placeholder="Street, City, State, ZIP"
                  rows={3}
                  className="w-full px-4 py-2 bg-zinc-800 rounded-lg border border-zinc-700 text-white"
                />
              </div>
            )}
```

---

## MODERATE, Fix After Serious

---

### Fix AX-01: Duplicate `<main>` landmark, services page

**File:** `C:\Users\email\projects\ImNotAnAttorney-web\src\app\services\page.tsx` line 325
**Category:** AUTO-FIX
**WCAG:** 1.3.6 Identify Purpose
**Root cause:** `layout.tsx` renders `<main id="main-content">` wrapping all page children. `ServicesPage` returns a `<main>` as its root element, creating a nested duplicate. Fix: change the page root to `<div>` with the same classes.

**Old:**
```tsx
    <main className="px-4 py-16">
```

**New:**
```tsx
    <div className="px-4 py-16">
```

**Note:** Also change the closing `</main>` at the bottom of the return to `</div>`. Apply the same pattern to AX-02, AX-03, AX-04.

---

### Fix AX-02: Duplicate `<main>` landmark, playbooks page

**File:** `C:\Users\email\projects\ImNotAnAttorney-web\src\app\playbooks\page.tsx` line 120
**Category:** AUTO-FIX
**WCAG:** 1.3.6 Identify Purpose

**Old:**
```tsx
    <main className="min-h-screen bg-zinc-950">
```

**New:**
```tsx
    <div className="min-h-screen bg-zinc-950">
```

---

### Fix AX-03: Duplicate `<main>` landmark, score page

**File:** `C:\Users\email\projects\ImNotAnAttorney-web\src\app\score\page.tsx` line 1037
**Category:** AUTO-FIX
**WCAG:** 1.3.6 Identify Purpose

**Old:**
```tsx
    <main className="px-4 py-16">
```

**New:**
```tsx
    <div className="px-4 py-16">
```

---

### Fix AX-04: Duplicate `<main>` landmarks, start page (3 instances)

**File:** `C:\Users\email\projects\ImNotAnAttorney-web\src\app\start\page.tsx` lines 44, 119, 364
**Category:** AUTO-FIX
**WCAG:** 1.3.6 Identify Purpose
**Note:** Three separate `<main>` elements are in this file: the `CrisisHero` sub-component (line 44), the main page component (line 119), and the Suspense fallback (line 364). All three must be changed to `<div>`.

**Instance 1 (line 44, CrisisHero):**

Old:
```tsx
    <main className="min-h-screen bg-zinc-950">
      <section className="flex min-h-[100dvh] flex-col items-center justify-center px-6 py-16">
```

New:
```tsx
    <div className="min-h-screen bg-zinc-950">
      <section className="flex min-h-[100dvh] flex-col items-center justify-center px-6 py-16">
```

**Instance 2 (line 119, main page return):**

Old:
```tsx
    <main className="min-h-screen bg-zinc-950">
      {/* ------------------------------------------------------------------ */}
```

New:
```tsx
    <div className="min-h-screen bg-zinc-950">
      {/* ------------------------------------------------------------------ */}
```

**Instance 3 (line 364, Suspense fallback):**

Old:
```tsx
        <main className="flex min-h-screen items-center justify-center bg-zinc-950">
          <p className="text-zinc-400">Loading&hellip;</p>
        </main>
```

New:
```tsx
        <div className="flex min-h-screen items-center justify-center bg-zinc-950">
          <p className="text-zinc-400">Loading&hellip;</p>
        </div>
```

---

### Fix F04: Non-interactive `<span>` with onClick, no keyboard handler

**File:** `C:\Users\email\projects\ImNotAnAttorney-web\src\components\IntakeChargeSelector.tsx` line 171
**Category:** AUTO-FIX
**WCAG:** 2.1.1 Keyboard
**Root cause:** A `<span>` uses `onClick` to stop propagation so clicks on the free-text `<input>` don't bubble to the parent radio button. The linter flags `<span>` as a non-interactive element with a click handler and no keyboard equivalent. Replacing with `<div role="presentation">` plus `onKeyDown` mirrors the click behavior and satisfies jsx-a11y. The inner `<input>` already has `aria-label` so no screen reader content is lost.

**Old:**
```tsx
          <span
            className="mt-2 block"
            onClick={(e) => e.stopPropagation()}
          >
            <input
              ref={inputRef}
              type="text"
              value={freeTextValue}
              onChange={handleFreeTextChange}
              placeholder="Describe your charge"
              aria-label="Describe your charge"
              className="w-full rounded-md border border-zinc-700 bg-zinc-950 px-3 py-2 text-sm text-zinc-200 placeholder-zinc-500 focus:border-amber-500 focus:outline-none focus:ring-1 focus:ring-amber-500"
            />
          </span>
```

**New:**
```tsx
          <div
            className="mt-2"
            role="presentation"
            onClick={(e) => e.stopPropagation()}
            onKeyDown={(e) => e.stopPropagation()}
          >
            <input
              ref={inputRef}
              type="text"
              value={freeTextValue}
              onChange={handleFreeTextChange}
              placeholder="Describe your charge"
              aria-label="Describe your charge"
              className="w-full rounded-md border border-zinc-700 bg-zinc-950 px-3 py-2 text-sm text-zinc-200 placeholder-zinc-500 focus:border-amber-500 focus:outline-none focus:ring-1 focus:ring-amber-500"
            />
          </div>
```

---

## HUMAN-REVIEW, Require Design Judgment Before Applying

---

### Fix F02-A: autoFocus on public login, my-cases

**File:** `C:\Users\email\projects\ImNotAnAttorney-web\src\app\my-cases\login\page.tsx` line 87
**Category:** HUMAN-REVIEW
**WCAG:** 3.2.1 On Focus
**Issue:** `autoFocus` moves keyboard focus to the email input before the screen reader has announced the page heading ("My Cases") and instructions. Screen reader users may miss the context about what the page is and what magic link authentication means.
**Decision required:** (a) Remove `autoFocus` entirely, users will Tab to the field naturally since it's the first interactive element. (b) Keep the UX enhancement but implement via `useRef` + `useEffect` so focus fires after the render cycle and screen readers finish the initial page announcement. Option (b) is preferred if the product team wants the focus-on-load behavior retained.

**Option A, Remove autoFocus:**
```tsx
            <input
              id="my-cases-email"
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="you@example.com"
              required
              className="w-full px-4 py-3 bg-zinc-800 rounded-lg border border-zinc-700 text-white mb-4"
            />
```

**Option B, useRef + useEffect (preserves focus-on-load):**
```tsx
// Add at top of component, after existing useState calls:
const emailRef = useRef<HTMLInputElement>(null);
useEffect(() => { emailRef.current?.focus(); }, []);

// Replace input:
            <input
              ref={emailRef}
              id="my-cases-email"
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="you@example.com"
              required
              className="w-full px-4 py-3 bg-zinc-800 rounded-lg border border-zinc-700 text-white mb-4"
            />
```

---

### Fix F02-B: autoFocus on public login, partner

**File:** `C:\Users\email\projects\ImNotAnAttorney-web\src\app\partner\login\page.tsx` line 90
**Category:** HUMAN-REVIEW
**WCAG:** 3.2.1 On Focus
**Same decision as F02-A.** Apply whichever option is chosen for F02-A consistently.

**Option A, Remove autoFocus:**
```tsx
            <input
              id="partner-login-email"
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="you@example.com"
              required
              className="w-full px-4 py-3 bg-zinc-800 rounded-lg border border-zinc-700 text-white mb-4"
            />
```

**Option B, useRef + useEffect:**
```tsx
// Add at top of component:
const emailRef = useRef<HTMLInputElement>(null);
useEffect(() => { emailRef.current?.focus(); }, []);

// Replace input:
            <input
              ref={emailRef}
              id="partner-login-email"
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="you@example.com"
              required
              className="w-full px-4 py-3 bg-zinc-800 rounded-lg border border-zinc-700 text-white mb-4"
            />
```

---

### Fix F03-A: autoFocus, admin demand password gate

**File:** `C:\Users\email\projects\ImNotAnAttorney-web\src\app\admin\demand\page.tsx` line 266
**Category:** HUMAN-REVIEW
**WCAG:** 3.2.1 On Focus
**Context:** Admin-only page. The password input is the only interactive element on the gate screen. This is the most benign `autoFocus` case, there is no page content before it for a screen reader to miss. The violation is real but low practical impact. Recommend: leave as-is, suppress with a comment, OR convert to `useEffect` focus for consistency.

**If suppressing (lowest effort):**
```tsx
            {/* eslint-disable-next-line jsx-a11y/no-autofocus */}
            <input
              type="password"
              ...
              autoFocus
            />
```

**If converting to useEffect:**
```tsx
// Add at component top:
const pwRef = useRef<HTMLInputElement>(null);
useEffect(() => { pwRef.current?.focus(); }, []);

// Replace input:
            <input
              ref={pwRef}
              type="password"
              value={passwordInput}
              onChange={(e) => setPasswordInput(e.target.value)}
              placeholder="Admin password"
              className="w-full p-3 rounded bg-zinc-800 border border-zinc-700 text-white mb-4"
            />
```

---

### Fix F03-B: autoFocus, admin inbox password gate

**File:** `C:\Users\email\projects\ImNotAnAttorney-web\src\app\admin\inbox\page.tsx` line 189
**Category:** HUMAN-REVIEW
**WCAG:** 3.2.1 On Focus
**Same rationale as F03-A**, admin-only, password-only screen. Same two options apply.

**If converting to useEffect:**
```tsx
// Add at component top:
const pwRef = useRef<HTMLInputElement>(null);
useEffect(() => { pwRef.current?.focus(); }, []);

// Replace input:
            <input
              ref={pwRef}
              type="password"
              value={secretInput}
              onChange={(e) => setSecretInput(e.target.value)}
              placeholder="Password"
              className="w-full rounded-lg border border-zinc-700 bg-zinc-900 px-4 py-3 text-white placeholder-zinc-500 focus:border-amber-500 focus:outline-none"
            />
```

---

### Fix F03-C: autoFocus, admin inbox reply textarea

**File:** `C:\Users\email\projects\ImNotAnAttorney-web\src\app\admin\inbox\page.tsx` line 391
**Category:** HUMAN-REVIEW
**WCAG:** 3.2.1 On Focus
**Context:** This is the highest-impact `autoFocus` instance. The reply textarea opens in a panel mid-page when the user clicks "Reply". `autoFocus` jumps focus into the textarea without the screen reader announcing the panel heading ("Replying to ..."). Fix with `useEffect` triggered by the panel-open state (`replying`), not unconditionally on mount.

**Recommended fix:**
```tsx
// In the component that controls replying state, add:
const replyRef = useRef<HTMLTextAreaElement>(null);
useEffect(() => {
  if (replying) {
    replyRef.current?.focus();
  }
}, [replying]);

// Replace textarea:
                    <textarea
                      ref={replyRef}
                      value={replyText}
                      onChange={(e) => setReplyText(e.target.value)}
                      placeholder="Type your reply..."
                      rows={6}
                      className="w-full rounded-lg border border-zinc-700 bg-zinc-800 px-4 py-3 text-sm text-white placeholder-zinc-500 focus:border-amber-500 focus:outline-none resize-y"
                    />
```

---

### Fix F03-D: autoFocus, OperatorShell password gate

**File:** `C:\Users\email\projects\ImNotAnAttorney-web\src\components\OperatorShell.tsx` line 104
**Category:** HUMAN-REVIEW
**WCAG:** 3.2.1 On Focus
**Same rationale as F03-A**, admin-only password gate, single control on screen.

**If converting to useEffect:**
```tsx
// Add at component top:
const pwRef = useRef<HTMLInputElement>(null);
useEffect(() => { pwRef.current?.focus(); }, []);

// Replace input:
            <input
              ref={pwRef}
              type="password"
              value={passwordInput}
              onChange={(e) => setPasswordInput(e.target.value)}
              placeholder="Password"
              className="w-full rounded-lg border border-zinc-700 bg-zinc-900 px-4 py-3 text-white placeholder-zinc-500 focus:border-amber-500 focus:outline-none"
            />
```

---

## Excluded

### F-05: Checkout wrapping labels (false positives)

**File:** `C:\Users\email\projects\ImNotAnAttorney-web\src\app\checkout\page.tsx` lines 735, 747, 983
**Status:** No fix needed. These are wrapping `<label>` elements containing `<input>` + visible text in child `<div>`/`<span>` nodes. ESLint static analysis cannot see inside the child tree. No WCAG violation exists, the label wraps its control correctly.

Optional suppression if ESLint noise is unwanted:
```tsx
{/* eslint-disable-next-line jsx-a11y/label-has-associated-control */}
<label className="flex cursor-pointer items-center gap-3 ...">
```

---

## Deferred

**phase2-accesslint.md** was not present in `docs/audit/2026-04-02-v2/` at time of this report. The AccessLint findings (required field asterisks, progress bar color-only, footer links) need to be re-audited and appended here when that report is available.

---

## Application Order

Apply in this sequence to minimize re-reads and conflict risk:

1. `src/app/my-cases/login/page.tsx`, F01-A (label) + F02-A choice
2. `src/app/partner/login/page.tsx`, F01-B (label) + F02-B choice
3. `src/app/intake/page.tsx`, F01-C + F01-D (fieldset/legend)
4. `src/components/IntakeChargeSelector.tsx`, F04 (span → div)
5. `src/app/research/defense-score-data/page.tsx`, AX-06 (link underlines)
6. `src/app/sample/page.tsx`, AX-05 (scrollable region tabIndex)
7. `src/app/services/page.tsx`, AX-01 (main → div)
8. `src/app/playbooks/page.tsx`, AX-02 (main → div)
9. `src/app/score/page.tsx`, AX-03 (main → div)
10. `src/app/start/page.tsx`, AX-04 (3x main → div)
11. `src/app/admin/partners/page.tsx`, F01-E (7 field labels)
12. `src/app/partner/dashboard/page.tsx`, F01-F (payment form labels)
13. Admin autoFocus (F03-A/B/C/D), after decision on approach
