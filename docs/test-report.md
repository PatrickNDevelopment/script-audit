# Test report

## Builder's report (2026-10-18)

Windows 10, Node 24, Python 3.14 (virtualenv from `backend/requirements.lock.txt`), Playwright 1.64
with the installed Microsoft Edge (`msedge` channel). CI is configured for Chromium and Python 3.12
on Ubuntu but has never run (no remote).

### Full gate

`powershell -File scripts\verify.ps1` (output redirected), exit code **0** (`ALL CHECKS PASSED`):

| Step             | Command                  | Result                                                                                                       |
| ---------------- | ------------------------ | ------------------------------------------------------------------------------------------------------------ |
| install          | `npm ci`                 | ok, 0 vulnerabilities                                                                                        |
| format           | `npm run format:check`   | ok                                                                                                           |
| lint             | `npm run lint`           | ok                                                                                                           |
| types            | `npm run typecheck`      | ok                                                                                                           |
| unit tests       | `npm test`               | 54 passed (3 files)                                                                                          |
| backend lint     | `npm run backend:lint`   | ruff: all checks passed                                                                                      |
| backend format   | `npm run backend:format` | 16 files already formatted                                                                                   |
| backend types    | `npm run backend:types`  | mypy --strict: no issues in 11 files                                                                         |
| backend tests    | `npm run backend:test`   | 29 passed                                                                                                    |
| production build | `npm run build`          | ok, 381 kB JS (117 kB gzip)                                                                                  |
| secret scan      | `npm run secrets`        | no findings                                                                                                  |
| e2e              | `npm run e2e`            | 10 passed: production build under `/script-audit/` on 4178, real backends on 8799 (fake AI) and 8800 (no AI) |

### What the unit tests cover

- Text model: CRLF/BOM normalisation, title extraction, same-length masking of tags, markup and link
  targets, sentence splitting (abbreviations, initials, decimals, closing quotes, `…`, beat ends),
  claim tags after the full stop, sections and beats, empty script, word counting, hand-computed
  duration with speed clamping.
- Grounding: triggers shown; journey 2 in the engine (a tag covers only its own sentence and the
  untouched sentence keeps the same key); unknown id, claim without a complete source, numbers and
  superlatives missing from the claim; multiple ids; tags in non-assertions; numbers inside markup
  ignored; no automatic fixes.
- Narrative, spoken and packaging: each rule when it fires and when it must not, with the exact fix
  text for S1, S3, S5 and P2 (title and hook).
- Determinism (same output twice), key stability across edits elsewhere, and that the sample script
  triggers every audit.
- Revisions: apply, stale refusal, approval lock on apply/edit/revert, exact undo and revert, original
  kept, title suggestions, the 300-revision and 200,000-character caps.
- Diff: 300 seeded random edits reconstruct both sides exactly; word-level change; a 4,000-line
  script diffs in well under 3 s.
- Workspace schema: sample round trip; unknown keys, wrong version, broken numbering, duplicates, lone
  surrogates, CR in text, `javascript:` URLs, `__proto__`, bad JSON.
- Exports: Markdown round trip through import, narration without tags and with the glossary, report
  disclaimer.
- AI answers in the browser: request contents, valid rewrite becomes an unapplied suggestion; rewrites
  adding numbers, claim tags, links or quotes, or targeting other text, are dropped; unknown keys reject
  the whole answer; unknown finding keys are dropped.

### What the backend tests cover

Health and capabilities without AI; disabled provider (403); opt-in header required; validated
recommendations; 8 invalid request shapes (422); Origin and Host guards; streamed body cap (413);
404 envelope; usage counts and a ledger without script text; rate limit counting provider calls only
and surviving a restart, recovering after an hour; cache hits; migrations in order and refusal of a
newer schema; configuration parsing; the API key sent to the provider but never returned; adversarial
provider output (new numbers, claim tags, quotations, grounding rewrites, unsent finding keys, extra
keys, prose, provider failure) dropped or refused; failed calls not cached; rewrite rules; fenced
JSON.

### Defects found while building (fixed)

- Everyday absolutes (`every`, `all`, `last`, a bare `most`) made ordinary sentences "assertions";
  the trigger list was narrowed and the spec says why.
- A claim tag pointing at any sourced claim cleared a warning even when the claim did not support the
  sentence (`She was the first keeper [c:keeper-log]`). Coverage now requires the claim to contain
  the sentence's numbers, superlatives and number words (G4).
- N1 reported overlapping four-word fragments of one repeated phrase separately; they are merged.
- Stemming turned "bridges" into "bridg", so a title word did not match the hook.
- Prettier rewrote the example draft and removed the double space the demo relies on; `examples/` is
  excluded from formatting.
- The active audit tab's count badge was invisible (white on white).

### Playwright journeys (production build under `/script-audit/`)

1. Journey 1: import `examples/draft.md`, run all four audits, reject the title suggestion, preview
   and apply the double-space fix, rejection kept, compare revision 1 and 2 (exactly one changed
   space), download Markdown `...-r2.md` and the audit report.
2. Journey 2: sample script, grounding coverage 1 of 10; tagging one sentence clears only it (2 of
   10, the other sentence still flagged, one finding fewer); a non-covering tag gives G4; an unknown
   id gives G2; a changed number gives G4; adding a source in Claims covers the G3 sentence.
3. Approval lock (read-only editor, disabled Apply), exact undo (compare shows no differences),
   unsaved edits block applying.
4. Rejections and history persist across a reload; a corrupted store is kept aside and reported.
5. Import validation: empty, binary and wrong-version files refused; pasted CRLF and Unicode
   punctuation normalised and kept.
6. AI with the fake provider: opt-in required, explanations shown as unverified, preview does not
   change anything, applying creates an "AI rewrite" revision, a rewrite adding a number is dropped.
7. AI states: provider not configured (8800) and backend offline (port 9); audits still work.
8. Glossary from a pronunciation finding; narration export; empty states on all pages.
9. No horizontal page scroll at 375 px on all seven pages.
10. Screenshots in `docs/screenshots` (editor, audits with a diff, grounding, mobile audits, dark
    editor), which were inspected.

### Not tested

- A live AI provider (only the fake provider and a mocked HTTP transport).
- Firefox, Safari, screen readers.
- CI and Pages workflows (no remote).
