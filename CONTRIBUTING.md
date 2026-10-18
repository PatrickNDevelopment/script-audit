# Contributing

1. Read `docs/spec` first; behaviour is defined there, rule by rule.
2. `npm ci`, create `.venv` from `backend/requirements.lock.txt`, then `npm run verify` before you
   push. It runs format, lint, strict types, unit tests, backend lint/format/types/tests, the
   production build, the secret scan and the Playwright suite (with two real local backends).
3. Audits stay independent and deterministic: no randomness, no time, no network, no reading another
   audit's output. A new rule needs a name and plain explanation in `src/engine/rules.ts`, a spec row,
   and tests for when it fires and when it must not.
4. A fix must replace exactly the finding's range; never change text outside it.
5. Never weaken the safety rules: no automatic application of suggestions, no edits to approved
   scripts, no invented claims or citations, no predictions about platforms.
6. Add a regression test for every bug you fix.
