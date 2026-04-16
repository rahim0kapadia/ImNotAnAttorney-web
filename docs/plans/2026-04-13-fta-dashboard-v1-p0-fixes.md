# FTA Dashboard v1, P0 Bug Fixes from Code Review

Source: Code review of commit f61a3bd (FTA Prevention Dashboard v1)

## Files to modify
- `src/components/partner/ClientTracker.tsx`
- `src/app/api/partner/dashboard/route.ts`
- `src/app/api/partner/add-client/route.ts`

## Files to create
None

## Tasks

### P0-1: Fix negative daysLeft showing "Tomorrow" for past court dates
- File: `src/components/partner/ClientTracker.tsx`, line 40
- Add `if (daysLeft < 0) return { label: "Past", ... }` before the `daysLeft <= 1` check

### P0-2: Fix reminders_sent null crash in reminderProgress
- File: `src/components/partner/ClientTracker.tsx`, line 48
- Change `sent.filter(...)` to `(sent || []).filter(...)`

### P0-3: Remove token from dashboard API response
- File: `src/app/api/partner/dashboard/route.ts`, line 49
- Remove `token` from the select query

### P0-4: Fix timezone race rejecting today's court date
- File: `src/app/api/partner/add-client/route.ts`, line 43-44
- Compare date-only (zero out hours) instead of timestamp

### P1-1: Validate charge_type against known values
- File: `src/app/api/partner/add-client/route.ts`
- Add validation against CHARGE_DISPLAY_NAMES keys

### P1-6: Remove token/prepUrl from add-client response
- File: `src/app/api/partner/add-client/route.ts`, line 86
- Return `{ success: true }` instead of `{ token, prepUrl }`
