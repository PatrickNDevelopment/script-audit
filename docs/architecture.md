# Architecture and decisions

Specification: [spec/00-document-and-revisions.md](spec/00-document-and-revisions.md),
[spec/01-audits.md](spec/01-audits.md), [spec/02-ai-broker-and-api.md](spec/02-ai-broker-and-api.md).

## Shape

```
browser (React + TypeScript)                          optional local backend (FastAPI)
  engine: text model, 4 audits, revisions,  findings    AI broker: opt-in header, strict output
          diff, workspace schema, exports   -------->   schema, rewrite rules, rate limit
  localStorage workspace                    <--------   SQLite: usage ledger + answer cache
                                          recommendations (versioned migrations)
```

## Decisions

1. **All audit logic runs in the browser.** The static build is fully useful on its own: import,
   audits, decisions, history, compare and exports need no server. The backend is not a second
   implementation of the audits.
2. **The backend exists for one server-only job**: calling an AI provider with a key that must never
   reach the browser, and keeping a usage ledger with a rate limit that survives restarts. It has no
   access to the workspace and cannot change a script.
3. **Four independent audits.** Each is a pure function of the revision and its own inputs (claims,
   glossary, settings); none reads another's output. The packaging rule P3 computes coverage itself
   from the claim register with the grounding definition.
4. **Same-length masking.** Analysis runs on a copy of the text where tags and Markdown markers are
   spaces, so every finding's offsets index the real text and a suggestion replaces exactly what it
   shows.
5. **Demonstrable coverage.** A claim tag clears a grounding warning only when the claim is sourced
   (citation and quote) and contains the sentence's specifics (numbers, superlatives, number words).
   Early testing showed that "any sourced claim clears the warning" let an unrelated claim silence an
   assertion.
6. **Suggestions are data, not actions.** A suggestion carries the expected text; applying it checks
   the current revision first (stale suggestions are refused) and creates a new revision. Nothing is
   applied in bulk or automatically; approved scripts refuse changes in the engine, not only in the UI.
7. **Append-only history.** Undo and revert add a revision with the exact earlier text. Revision 1 is
   never removed; at the 300-revision cap the app refuses further changes instead of dropping it.
8. **Stable finding keys** (`rule|excerpt|k`), so a rejection survives edits elsewhere in the text.
9. **AI output is untrusted twice.** The backend validates the provider's JSON against a strict
   schema and the rewrite rules; the browser validates the backend's answer again with the same
   rules before showing anything.
10. **SQLite with a minimal ordered migration runner** (`PRAGMA user_version`) instead of SQLAlchemy and
    Alembic: two small tables do not justify an ORM; the runner refuses a database newer than the
    program.
11. **Static hosting friendly**: hash routing, `base: /script-audit/`.

## Backend hardening

Loopback bind by default, Host header allow-list (DNS rebinding), CORS limited to configured origins
plus an Origin check on writes, 200 kB body cap enforced while streaming, 30 s deadline, one error
envelope, the API key read only from the server environment and never logged or returned.

## Ports

| Port | Use                                      |
| ---- | ---------------------------------------- |
| 5177 | Vite dev server                          |
| 4178 | Production preview (e2e)                 |
| 8799 | Backend (default; e2e: fake AI provider) |
| 8800 | Backend in e2e with no AI provider       |
