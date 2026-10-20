# Handoff

**State:** v0.1 on branch `phase/06a-build`, independently accepted (prompt 06B, 2026-10-18): the
reviewer fixed nine defects with regression tests (commit `0147e37`, see docs/test-report.md Part 1)
and re-ran the full gate (exit 0). Published 2026-10-19: https://github.com/PatrickNDevelopment/script-audit (branch `main`), demo https://patrickndevelopment.github.io/script-audit/; CI and Pages green on the first run. The lead engineer updates the
registry after re-running the evidence.

## Run

```powershell
npm ci
npm run dev          # http://localhost:5177/script-audit/
python -m venv .venv
.venv\Scripts\python -m pip install -r backend\requirements.lock.txt
cd backend; ..\.venv\Scripts\python -m script_audit      # optional backend on 127.0.0.1:8799
npm run verify       # full gate (or scripts\verify.ps1 / scripts/verify.sh)
```

For the AI path without a real provider, start the backend with `SCRIPT_AUDIT_AI_PROVIDER=fake`.

## What works (covered by tests, see docs/test-report.md)

- Import (paste, Markdown/text file, workspace JSON, invented sample), editor with revisions,
  sections/beats outline, word count and duration at an adjustable speed, approval lock.
- Four separate deterministic audits with rule explanations; preview (side-by-side diff), apply,
  reject and restore per finding; stale suggestions refused.
- Claim register with sources and quotes; grounding coverage per sentence.
- History with exact undo and revert; compare any two revisions; exports (Markdown, narration text,
  audit report, workspace JSON).
- Optional AI explanations through the local backend: opt-in per session, strict output contract,
  unsafe rewrites dropped, usage ledger and rate limit in SQLite with migrations.

## What is disabled or absent

- No AI provider is configured by default. Served from loopback the AI panel checks the backend on
  its own; on any other host (the static demo) it shows "Not checked" until the user clicks.
- Hosted demo: https://patrickndevelopment.github.io/script-audit/ (static build). CI and Pages ran green on the first push (2026-10-19).
- Backlog: SourceTrace import, voiceover timing alignment (docs/backlog.md).

## Publication

Published 2026-10-19 with the owner's approval (portfolio decision D-007): public repository
https://github.com/PatrickNDevelopment/script-audit (MIT, branch `main`), GitHub Pages at https://patrickndevelopment.github.io/script-audit/. The
first CI run (Linux, Chromium) and Pages deployment were green; a live check loaded the demo,
refreshed it and found no console errors and no requests to localhost.

## Next action

None required for v0.1; ideas are in `docs/backlog.md`. The portfolio's final cross-project audit
(prompt 13) is next.

## Gotchas

- `vite.config.ts` sets `base: '/script-audit/'`; e2e runs the production build on 4178 and two
  backends on 8799 (fake AI) and 8800 (no AI), with throwaway databases in `.e2e-data/`.
- `npm run e2e` rewrites `docs/screenshots`; restore with `git checkout docs/screenshots` unless the
  UI changed.
- `examples/` is excluded from Prettier on purpose: `draft.md` contains a double space the demo
  relies on.
- The AI rewrite rules exist twice (`src/engine/ai.ts` and `backend/script_audit/ai.py`); keep the
  word lists in step.
- Changing `src/engine/sample.ts` changes journey 2 numbers (coverage 1 of 10); unit and e2e tests pin
  them.
