# Phase 3: axe-core Runtime Accessibility Audit

**Date:** 2026-04-02
**Site:** https://imnotanattorney.com
**Standards:** WCAG 2.1 Level AA (wcag2a, wcag2aa, wcag21a, wcag21aa, best-practices)
**Tool:** axe-core 4.8.4 via Playwright MCP
**Context:** Post-fix verification — commits 8017e39 and f45536a fixed 13 issues

## Pages Scanned
1. / (Homepage)
2. /services
3. /playbooks
4. /score
5. /start
6. /checkout
7. /dui-checklist
8. /sample
9. /resources
10. /playbook/dui-first-offense
11. /research/defense-score-data
12. /family
13. /intake

## Specific Fix Verification Checklist
- [ ] Zero text-zinc-500 or text-zinc-600 contrast violations
- [ ] No duplicate main landmark on homepage
- [ ] Form labels associated on partner application form
- [ ] Radio semantics on IntakeChargeQuestions

---

## Per-Page Results

<!-- Results appended below as each page is scanned -->

---

### Page 1: `/`

**URL:** https://imnotanattorney.com/
**Violations:** 0 | **Passes:** 41 | **Incomplete:** 1

No violations found.

---

### Page 2: `/services`

**URL:** https://imnotanattorney.com/services
**Violations:** 3 | **Passes:** 38 | **Incomplete:** 0

#### Violations

##### `landmark-main-is-top-level`: Ensures the main landmark is at top level
- **Severity:** MODERATE
- **Nodes:** 1
- **Targets:**
  - `.py-16`
- **Failure:** Fix any of the following:
- **Help:** https://dequeuniversity.com/rules/axe/4.8/landmark-main-is-top-level?application=axeAPI

##### `landmark-no-duplicate-main`: Ensures the document has at most one main landmark
- **Severity:** MODERATE
- **Nodes:** 1
- **Targets:**
  - `#main-content`
- **Failure:** Fix any of the following:
- **Help:** https://dequeuniversity.com/rules/axe/4.8/landmark-no-duplicate-main?application=axeAPI

##### `landmark-unique`: Landmarks should have a unique role or role/label/title (i.e. accessible name) combination
- **Severity:** MODERATE
- **Nodes:** 1
- **Targets:**
  - `#main-content`
- **Failure:** Fix any of the following:
- **Help:** https://dequeuniversity.com/rules/axe/4.8/landmark-unique?application=axeAPI


---

### Page 3: `/playbooks`

**URL:** https://imnotanattorney.com/playbooks
**Violations:** 3 | **Passes:** 34 | **Incomplete:** 0

#### Violations

##### `landmark-main-is-top-level`: Ensures the main landmark is at top level
- **Severity:** MODERATE
- **Nodes:** 1
- **Targets:**
  - `#main-content > main`
- **Failure:** Fix any of the following:
- **Help:** https://dequeuniversity.com/rules/axe/4.8/landmark-main-is-top-level?application=axeAPI

##### `landmark-no-duplicate-main`: Ensures the document has at most one main landmark
- **Severity:** MODERATE
- **Nodes:** 1
- **Targets:**
  - `#main-content`
- **Failure:** Fix any of the following:
- **Help:** https://dequeuniversity.com/rules/axe/4.8/landmark-no-duplicate-main?application=axeAPI

##### `landmark-unique`: Landmarks should have a unique role or role/label/title (i.e. accessible name) combination
- **Severity:** MODERATE
- **Nodes:** 1
- **Targets:**
  - `#main-content`
- **Failure:** Fix any of the following:
- **Help:** https://dequeuniversity.com/rules/axe/4.8/landmark-unique?application=axeAPI


---

### Page 4: `/score`

**URL:** https://imnotanattorney.com/score
**Violations:** 3 | **Passes:** 39 | **Incomplete:** 0

#### Violations

##### `landmark-main-is-top-level`: Ensures the main landmark is at top level
- **Severity:** MODERATE
- **Nodes:** 1
- **Targets:**
  - `.py-16`
- **Failure:** Fix any of the following:
- **Help:** https://dequeuniversity.com/rules/axe/4.8/landmark-main-is-top-level?application=axeAPI

##### `landmark-no-duplicate-main`: Ensures the document has at most one main landmark
- **Severity:** MODERATE
- **Nodes:** 1
- **Targets:**
  - `#main-content`
- **Failure:** Fix any of the following:
- **Help:** https://dequeuniversity.com/rules/axe/4.8/landmark-no-duplicate-main?application=axeAPI

##### `landmark-unique`: Landmarks should have a unique role or role/label/title (i.e. accessible name) combination
- **Severity:** MODERATE
- **Nodes:** 1
- **Targets:**
  - `#main-content`
- **Failure:** Fix any of the following:
- **Help:** https://dequeuniversity.com/rules/axe/4.8/landmark-unique?application=axeAPI


---

### Page 5: `/start`

**URL:** https://imnotanattorney.com/start
**Violations:** 3 | **Passes:** 35 | **Incomplete:** 0

#### Violations

##### `landmark-main-is-top-level`: Ensures the main landmark is at top level
- **Severity:** MODERATE
- **Nodes:** 1
- **Targets:**
  - `#main-content > main`
- **Failure:** Fix any of the following:
- **Help:** https://dequeuniversity.com/rules/axe/4.8/landmark-main-is-top-level?application=axeAPI

##### `landmark-no-duplicate-main`: Ensures the document has at most one main landmark
- **Severity:** MODERATE
- **Nodes:** 1
- **Targets:**
  - `#main-content`
- **Failure:** Fix any of the following:
- **Help:** https://dequeuniversity.com/rules/axe/4.8/landmark-no-duplicate-main?application=axeAPI

##### `landmark-unique`: Landmarks should have a unique role or role/label/title (i.e. accessible name) combination
- **Severity:** MODERATE
- **Nodes:** 1
- **Targets:**
  - `#main-content`
- **Failure:** Fix any of the following:
- **Help:** https://dequeuniversity.com/rules/axe/4.8/landmark-unique?application=axeAPI


---

### Page 6: `/checkout`

**URL:** https://imnotanattorney.com/checkout
**Violations:** 0 | **Passes:** 42 | **Incomplete:** 1

No violations found.

---

### Page 7: `/dui-checklist`

**URL:** https://imnotanattorney.com/dui-checklist
**Violations:** 0 | **Passes:** 38 | **Incomplete:** 0

No violations found.

---

### Page 8: `/sample`

**URL:** https://imnotanattorney.com/sample
**Violations:** 1 | **Passes:** 41 | **Incomplete:** 1

#### Violations

##### `scrollable-region-focusable`: Ensure elements that have scrollable content are accessible by keyboard
- **Severity:** SERIOUS
- **Nodes:** 1
- **Targets:**
  - `section:nth-child(4) > .overflow-x-auto.mt-4`
- **Failure:** Fix any of the following:
- **Help:** https://dequeuniversity.com/rules/axe/4.8/scrollable-region-focusable?application=axeAPI


---

### Page 9: `/resources`

**URL:** https://imnotanattorney.com/resources
**Violations:** 0 | **Passes:** 40 | **Incomplete:** 0

No violations found.

---

### Page 10: `/playbook/dui-first-offense`

**URL:** https://imnotanattorney.com/playbook/dui-first-offense
**Violations:** 0 | **Passes:** 43 | **Incomplete:** 0

No violations found.

---

### Page 11: `/research/defense-score-data`

**URL:** https://imnotanattorney.com/research/defense-score-data
**Violations:** 1 | **Passes:** 35 | **Incomplete:** 0

#### Violations

##### `link-in-text-block`: Ensure links are distinguished from surrounding text in a way that does not rely on color
- **Severity:** SERIOUS
- **Nodes:** 7
- **Targets:**
  - `.text-lg.mt-4 > .hover\:underline.text-amber-400[href$="score"]`
  - `.mt-6 > .hover\:underline.text-amber-400[href$="score"]`
  - `p:nth-child(1) > .hover\:underline.text-amber-400[href$="score"]`
- **Failure:** Fix any of the following:
- **Help:** https://dequeuniversity.com/rules/axe/4.8/link-in-text-block?application=axeAPI


---

### Page 12: `/family`

**URL:** https://imnotanattorney.com/family
**Violations:** 0 | **Passes:** 36 | **Incomplete:** 0

No violations found.

---

### Page 13: `/intake`

**URL:** https://imnotanattorney.com/intake
**Violations:** 0 | **Passes:** 40 | **Incomplete:** 0

No violations found.

---

## Summary

**Pages scanned:** 13 successful, 0 errors
**Unique rule violations:** 5
**By severity:** CRITICAL: 0 | SERIOUS: 2 | MODERATE: 3 | MINOR: 0

### Page Summary Table

| Page | Violations | Passes | Status |
|------|-----------|--------|--------|
| `/` | 0 | 41 | CLEAN |
| `/services` | 3 | 38 | MODERATE |
| `/playbooks` | 3 | 34 | MODERATE |
| `/score` | 3 | 39 | MODERATE |
| `/start` | 3 | 35 | MODERATE |
| `/checkout` | 0 | 42 | CLEAN |
| `/dui-checklist` | 0 | 38 | CLEAN |
| `/sample` | 1 | 41 | MINOR |
| `/resources` | 0 | 40 | CLEAN |
| `/playbook/dui-first-offense` | 0 | 43 | CLEAN |
| `/research/defense-score-data` | 1 | 35 | MINOR |
| `/family` | 0 | 36 | CLEAN |
| `/intake` | 0 | 40 | CLEAN |

### Specific Fix Verification

- [x] **Zero text-zinc-500/zinc-600 contrast violations** — CONFIRMED: no color-contrast violations found
- [ ] **No duplicate main landmark on homepage** — FAILED: still present on /services, /playbooks, /score, /start
- [x] **Form labels associated (partner application)** — CONFIRMED: no label association violations
- [x] **Radio semantics on IntakeChargeQuestions** — CONFIRMED: no radiogroup/aria-role violations detected

### Consolidated Findings (All Pages, by Severity)

#### `scrollable-region-focusable`: Ensure elements that have scrollable content are accessible by keyboard
- **Severity:** SERIOUS
- **Pages affected:** /sample
- **Total nodes:** 1
- **Sample targets:** `section:nth-child(4) > .overflow-x-auto.mt-4`
- **Help:** https://dequeuniversity.com/rules/axe/4.8/scrollable-region-focusable?application=axeAPI

#### `link-in-text-block`: Ensure links are distinguished from surrounding text in a way that does not rely on color
- **Severity:** SERIOUS
- **Pages affected:** /research/defense-score-data
- **Total nodes:** 7
- **Sample targets:** `.text-lg.mt-4 > .hover\:underline.text-amber-400[href$="score"]`
- **Help:** https://dequeuniversity.com/rules/axe/4.8/link-in-text-block?application=axeAPI

#### `landmark-main-is-top-level`: Ensures the main landmark is at top level
- **Severity:** MODERATE
- **Pages affected:** /services, /playbooks, /score, /start
- **Total nodes:** 4
- **Sample targets:** `.py-16`, `#main-content > main`
- **Help:** https://dequeuniversity.com/rules/axe/4.8/landmark-main-is-top-level?application=axeAPI

#### `landmark-no-duplicate-main`: Ensures the document has at most one main landmark
- **Severity:** MODERATE
- **Pages affected:** /services, /playbooks, /score, /start
- **Total nodes:** 4
- **Sample targets:** `#main-content`
- **Help:** https://dequeuniversity.com/rules/axe/4.8/landmark-no-duplicate-main?application=axeAPI

#### `landmark-unique`: Landmarks should have a unique role or role/label/title (i.e. accessible name) combination
- **Severity:** MODERATE
- **Pages affected:** /services, /playbooks, /score, /start
- **Total nodes:** 4
- **Sample targets:** `#main-content`
- **Help:** https://dequeuniversity.com/rules/axe/4.8/landmark-unique?application=axeAPI

