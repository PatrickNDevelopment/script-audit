# Handoff

**State:** v0.1 built locally on branch `phase/06a-build`. Not pushed, not deployed, no remote.
Registry status `in_progress` until an independent acceptance review (prompt 06B) passes.

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

- No AI provider is configured by default; the static build shows the AI panel as unavailable.
- No hosted demo; CI and Pages workflows have never run (no remote).
- Backlog: SourceTrace import, voiceover timing alignment (docs/backlog.md).

## Release blockers before publication

1. Independent acceptance review (06B).
2. Owner review and explicit approval to publish.
3. First CI run on Linux.

## Gotchas

- `vite.config.ts` sets `base: '/script-audit/'`; e2e runs the production build on 4178 and two
  backends on 8799 (fake AI) and 8800 (no AI), with throwaway databases in `.e2e-data/`.
- `npm run e2e` rewrites `docs/screenshots`; restore with `git checkout docs/screenshots` unless the
  UI changed.
- `examples/` is excluded from Prettier on purpose: `draft.md` contains a double space the demo
  relies on.
- Changing `src/engine/sample.ts` changes journey 2 numbers (coverage 1 of 10); unit and e2e tests pin
  them.
