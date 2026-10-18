# Test report

## Part 1: independent acceptance (2026-10-18)

Independent adversarial review (prompt 06B) of branch `phase/06a-build`, starting at `edaa5b3`.
Windows 10, Node 24, Python 3.14.7, Playwright 1.64 with installed Microsoft Edge. Every result
below is from commands actually run; evidence logs were kept in the reviewer's scratchpad.

### Gate runs

| Run                                                                                                    | Command                                                          | Exit | Result                                                           |
| ------------------------------------------------------------------------------------------------------ | ---------------------------------------------------------------- | ---- | ---------------------------------------------------------------- |
| Before fixes, in place                                                                                 | `powershell -File scripts\verify.ps1 *>&1` (redirected to a log) | 0    | 54 unit, 29 pytest, 10 e2e passed; `ALL CHECKS PASSED`           |
| Fresh `git clone` in a scratch folder, new `.venv` from `backend/requirements.lock.txt` (`pip` exit 0) | `scripts\verify.ps1 *>&1`                                        | 0    | same counts; clone deleted afterwards                            |
| Clone, deliberately unformatted test added                                                             | `scripts\verify.ps1`                                             | 1    | `FAILED: format check (exit 1)`                                  |
| Clone, deliberately failing unit test                                                                  | `scripts\verify.ps1`                                             | 1    | `FAILED: frontend unit tests (exit 1)`                           |
| Clone, deliberately failing pytest                                                                     | `sh scripts/verify.sh`                                           | 1    | stopped at `backend tests`                                       |
| Clone, deliberately broken e2e assertion                                                               | `scripts\verify.ps1`                                             | 1    | `FAILED: browser e2e (exit 1)`                                   |
| After fixes (`0147e37`), in place                                                                      | `scripts\verify.ps1 *>&1`                                        | 0    | 64 unit (4 files), 31 pytest, 13 e2e passed; `ALL CHECKS PASSED` |
| After fixes, in place                                                                                  | `sh scripts/verify.sh`                                           | 0    | same counts; `ALL CHECKS PASSED`                                 |
| README dev command                                                                                     | `npm run dev`, GET `http://localhost:5177/script-audit/`         | -    | 200, then stopped                                                |

The e2e runs regenerate `docs/screenshots`; after the fixes only `audits-desktop.png` and
`audits-mobile.png` changed (the double-space finding now shows its neighbouring words). They were
inspected and committed; later runs reproduced them byte for byte.

### Journeys on the production build under `/script-audit/` (port 4178, own Playwright scripts)

- **Import, four audits, reject, apply, compare, export** (`examples/draft.md`): imported as revision 1
  with the `# ` title; ran grounding (2 open, coverage 0 of 2), narrative (1, N6), spoken (4: S5, S1,
  S3, S3) and packaging (1, P2) separately; every tab badge equalled the listed open findings.
  Rejected P2 (still "1 rejected" after the next revision), previewed and applied the S1 split
  (preview created no revision; revision 1 stayed byte-identical to the file body); Compare showed
  exactly `,`/`and` removed and `.`/`And` added, and both sides equalled revisions 1 and 2. The
  Markdown export `the-shocking-story-of-the-paper-bridge-r2.md` equalled `# title` plus revision 2;
  the report states the audits do not predict views; the narration has no tags; the workspace JSON
  re-imported with 2 revisions.
- **Claim IDs** (sample script, coverage 1 of 10): a tag at the end of a paragraph changed only the
  last sentence (G1 to G4 "first", coverage unchanged); `[c:worst-storm]` on its own sentence cleared
  exactly that G1 (2 of 10, nothing else changed); an unrelated sourced claim gave G4; a two-id tag
  with one matching claim covered; an unsourced claim gave G3; `[c: Worst-Storm ]` resolved.

### Adversarial checks

| Area                                         | Result                                                                                                                                                                                                                                                                                                                                                                                                                                    |
| -------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| False positives                              | dialogue, lists, Markdown links (numbers in URLs), inline code, numbers in headings: no grounding finding. "First, ..." / "at first" was flagged (fixed). `always`, `never`, `best`, `reported` and bare numbers ("Call me at 5") remain assertions by design (rejectable).                                                                                                                                                               |
| Undo / revert                                | append-only and exact (unit + e2e); an approved script refuses apply, undo and revert, even with a forced DOM click                                                                                                                                                                                                                                                                                                                       |
| Diff                                         | both sides reconstruct exactly incl. emoji; 199 k-character worst case 0.2 s                                                                                                                                                                                                                                                                                                                                                              |
| Long script (199 k chars, one section)       | spoken audit 20.5 s and narrative 3.1 s in Node before the fix (5 s and 8 s in the browser); 0.09 s and 0.17 s after                                                                                                                                                                                                                                                                                                                      |
| Unicode                                      | emoji, ZWJ sequences, mathematical letters: no finding range splits a surrogate pair; applied fixes keep pairs intact (browser check)                                                                                                                                                                                                                                                                                                     |
| CRLF / BOM                                   | `\r\n` and lone `\r` normalised, BOM dropped, title taken                                                                                                                                                                                                                                                                                                                                                                                 |
| Persistence                                  | decisions and history survive reload; a corrupt store is kept under `.corrupt` and is still there after starting over; a storage refusal is shown                                                                                                                                                                                                                                                                                         |
| NUL / lone surrogate in an edit              | was saved, then the whole workspace was refused on reload (fixed)                                                                                                                                                                                                                                                                                                                                                                         |
| Stale suggestions                            | refused by the engine; AI results are cleared when leaving the Audits page                                                                                                                                                                                                                                                                                                                                                                |
| Rejected-key stability                       | rejecting one double space moved to another gap after a fix (fixed)                                                                                                                                                                                                                                                                                                                                                                       |
| AI fake markers (live backend)               | NUMBER, CITE, QUOTE rewrites dropped; OTHER dropped; PROSE and EXTRA 502 `ai_invalid_output`; ERROR 502 `ai_provider_error`; grounding rewrites dropped; a repeat is served from the cache                                                                                                                                                                                                                                                |
| Hostile backend answers (route interception) | extra keys, non-JSON, HTTP 500, wrong `original`: refused or dropped; HTML in explanations rendered as text. Spelled-out numbers, superlatives, attributions, `‘’`/`«»` quotes, Markdown links and duplicate answers were accepted (fixed in browser and backend)                                                                                                                                                                         |
| Backend guards (live)                        | Host `evil.example` and a loopback host with an `@evil.example` user-info part 400; Origin `evil` and `null` 403; preflight from evil 400; 250 kB body and chunked 300 kB 413; 9 findings, duplicate keys, extra keys, bad rule 422; no or wrong opt-in 403; disabled provider 403; the 21st provider call in an hour 429 with `Retry-After: 600`; database at `user_version` 2 with both tables; ledger rows hold only a hash and counts |
| Layout and access                            | no horizontal page scroll on any view at 320/375/768/1440, light and dark; the skip link is first and moves focus to `main`; every tabbed control shows a focus outline; every input, select, textarea and button has an accessible name; unknown hash routes fall back to the Editor                                                                                                                                                     |
| Static demo separation                       | served from a non-loopback host (`https://demo.example/script-audit/`, simulated) the page contacted `127.0.0.1:8799` on its own (fixed: "Not checked" until the user clicks); after the click a backend without that origin in CORS is reported unreachable                                                                                                                                                                              |
| Ethics                                       | no screen, export or doc claims a score predicts views or retention; the app never creates claims or sources                                                                                                                                                                                                                                                                                                                              |
| Secrets / licence                            | `npm run secrets` clean; history grep for key patterns empty; single author; MIT licence; sample and example invented and labelled; `.env.example` has no values                                                                                                                                                                                                                                                                          |

### Defects found and fixed

Commit `0147e37`; regression tests in `tests/acceptance.test.ts`, `e2e/acceptance.spec.ts` and
`backend/tests/test_ai.py`. Each defect was reproduced on `edaa5b3` before the fix.

1. AI rewrites could add spelled-out numbers, superlatives, attributions, single or angle quotation
   marks, Markdown or bare-domain links, and two answers for one finding (browser and backend).
2. An edit with a NUL or a lone surrogate was saved and made the stored workspace unreadable on the
   next load; a title-only paste imported an empty script.
3. Settings number fields clamped on every keystroke: 180 words per minute or a 40-word limit could
   not be typed (220 and 60 were stored).
4. A rejected double-space finding moved to a different gap after another one was fixed.
5. The packaging title fix replaced inside a longer word ("Insanely" became "Remarkablely").
6. Spoken and narrative audits were quadratic (20 s on a 199 k script).
7. "First," and "at first" counted as superlatives.
8. The public static demo contacted `127.0.0.1` without being asked.
9. Cosmetic: a double period in the apply message; "NaN calls per hour" for a malformed capability.

### Remaining issues (not blocking)

- All run audits re-run synchronously after each change (about 0.5 s in total on a 199 k script);
  there is no worker.
- On a 320 px screen the History table scrolls sideways inside its frame.
- Grounding treats `always`, `never`, `best`, `reported` and any digit as assertion triggers; this is
  the documented rule set and each finding can be rejected.
- `/api/docs` loads Swagger UI from a CDN (local backend only).
- The CI and Pages workflows have never run (no remote); action versions were not verified online.

## Part 2: builder's report (2026-10-18)

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
