# Handoff

**State:** v0.1 on branch `phase/06a-build`, independently accepted (prompt 06B, 2026-10-18): the
reviewer fixed nine defects with regression tests (commit `0147e37`, see docs/test-report.md Part 1)
and re-ran the full gate (exit 0). Not pushed, not deployed, no remote. The lead engineer updates the
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
- No hosted demo; CI and Pages workflows have never run (no remote).
- Backlog: SourceTrace import, voiceover timing alignment (docs/backlog.md).

## Release blockers before publication

1. Owner review (README, screenshots, limitations, licence, secrets scan) and explicit approval to
   publish.
2. First CI run on Linux after the push.

## Next step

Lead engineer: re-run `scripts\verify.ps1` (expect 64 unit, 31 pytest, 13 e2e, `ALL CHECKS PASSED`),
then move the registry entry to `ready_for_publication_review` if it agrees with Part 1 of
docs/test-report.md.

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
