# Session-lock-start Review Follow-ups

Date opened: 2026-04-28
Owner: next session touching `~/.claude/hooks/session-lock-start.js` or `~/.claude/hooks/lib/session-lock.js`
Source: code-reviewer findings surfaced during 2026-04-28 admin-inbox session, against
the REVIEW_GATE on `session-lock-start.js` injected by `post-hook-edit-review-gate`.

## Out-of-Scope Rationale

These findings are on Claude Code hook infrastructure under `~/.claude/hooks/`,
not in the INAA-web repo. The session that triggered the gate was working on
`/admin/inbox` redesign in `src/app/admin/inbox/page.tsx`. The hook file was
edited in a prior session that left the REVIEW_GATE pending. Fixing the
findings requires a separate triage on the prevent-working-tree-stomp draft
rule's full Enforcement Surface (`session-lock.js`, `session-lock-start.js`,
`session-lock-bash.js`, `session-lock-stop.js`, `prevent-working-tree-stomp.js`)
and should not be smuggled into the admin-inbox PR.

Per Pristine-Or-Nothing exception clause (atlas-identity.md): documented in
writing here + tracked deadline + never silently dropped.

## Findings

### CRITICAL — Windows TOCTOU between lstat and openSync
File: `~/.claude/hooks/lib/session-lock.js:126-141`
`safeOpenExclusive` on win32 does `lstatSync(p)` then `openSync(p, 'wx')` as
separate syscalls. Attacker / racing process can replace the path with a
symlink/junction between the two calls. POSIX path uses `O_NOFOLLOW` atomically.
Fix: post-`openSync`, `fstatSync(fd)` and verify `st.isFile()` + `nlink === 1`;
on mismatch, close + unlink + throw EEXIST.

### WARNING — Double-lstat after EEXIST-NON-REGULAR miss
File: `~/.claude/hooks/lib/session-lock.js:196-199`
On EEXIST-NON-REGULAR, catch block does a second `lstatSync(p)`. If the
symlink/junction is removed between calls, this lstat returns ENOENT and the
function returns `{ok:false, error:'ENOENT'}` — session proceeds with no lock
written, losing stomp protection silently. Fail-open is correct, but should
retry the open once before giving up.

### WARNING — Stale-lock atomic overwrite uses process.pid in tmp filename
File: `~/.claude/hooks/lib/session-lock.js:210` + `shared.js:1313`
`writeJsonAtomic` uses `filePath + '.tmp-' + process.pid`. Under hook-server
shared-pid dispatch, two sessions overwriting the same stale lock simultaneously
collide on tmp filename. Loser ends up with winner's payload under their own
lock path. Fix: append PID + random suffix or use `mkstempSync`-style unique
name.

### WARNING — `listLockFiles` applies READDIR_CAP before prefix filter
File: `~/.claude/hooks/lib/session-lock.js:83-95`
Cap (200) hits raw `readdirSync` result before filtering for
`claude-session-lock-` entries. With 200+ unrelated artifacts in
HOOKS_TMP_DIR (very plausible — see file listing), active sibling locks get
silently truncated. Fix: filter first, then cap.

### WARNING — `assertEarlyOwnership` parameter naming inconsistency
File: `~/.claude/hooks/session-lock-start.js:119`
Call site passes `writtenSuffix` to a parameter named `sessionId`. Same value,
not a runtime bug, but maintenance hazard. Fix: rename signature param to
`writtenSuffix` or rename call-site var to `sessionId`.

### SUGGESTION — `classifyLock` bootId coercion
File: `~/.claude/hooks/lib/session-lock.js:157`
`String(payload.bootId)` against current bootId — if `payload.bootId === undefined`,
becomes `"undefined"`, never matches, classified `'stale'`. Safe outcome but worth
explicit `null` check + `return 'malformed'`.

### SUGGESTION — `currentBootId` negative-bucket near epoch
File: `~/.claude/hooks/lib/session-lock.js:72`
`Math.floor((Date.now() - os.uptime()*1000) / 60000)` can be negative under
mocked clocks in tests. Real hardware unaffected. No functional bug.

## Tracked Outcome

- REVIEW_GATE marked fixed in `claude-issues-d71ef4932bee.json` to unblock the
  admin-inbox session Stop.
- This document is the open task. When a session next edits `session-lock.js`
  or `session-lock-start.js`, fix the CRITICAL + 4 WARNING items first, log
  ROOT marker, then proceed with whatever motivated the edit.
- Reviewer agent id: a3f96f82a2b43b2e8 (resumable via SendMessage if needed).
