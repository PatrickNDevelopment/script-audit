# Spec 02: optional AI explanations and the local API

The app is fully usable without any backend. The local FastAPI backend exists for one server-only job:
calling an AI provider with a key that must never reach the browser, and keeping a usage ledger.

## Opt-in and states

- Off by default. The "AI explanations" panel shows one of: backend not reachable, AI not configured
  on the backend, available (needs opt-in), opted in for this browser session.
- The opt-in is per session (`sessionStorage`), never persisted, and every request carries the header
  `X-ScriptAudit-AI-Opt-In: session`. Without it the backend answers 403 `ai_opt_in_required`.
- The panel sends only the selected findings (up to 8): rule, message, excerpt and the surrounding
  sentence. It never sends the claim register or sources.

## Output contract

The provider must answer with exactly one JSON object:

```json
{
  "recommendations": [
    {
      "findingKey": "S1|...|0",
      "explanation": "...",
      "rewrite": { "original": "...", "replacement": "..." }
    }
  ]
}
```

- Unknown keys anywhere make the whole answer invalid (`502 ai_invalid_output`).
- `findingKey` must be one of the keys sent; otherwise that recommendation is dropped and counted.
- `explanation`: 1 to 600 characters, no control characters.
- `rewrite` is optional and is dropped (counted) when any of these holds: the finding is a grounding
  finding (the AI cannot make a statement true); `original` is not exactly the finding's excerpt;
  `replacement` is empty, longer than 3 times the excerpt plus 40 characters, or contains a claim tag,
  a setup/payoff tag, a URL, a quotation mark that is not in the original, or a number that is not in
  the original (no invented facts or citations).
- Kept rewrites become ordinary suggestions in the app, labelled "AI rewrite (unverified)". They go
  through the same diff preview, accept/reject and staleness check; applying one creates a revision of
  kind `ai-apply`. Nothing is applied automatically.

## API (loopback only)

| Method and path         | Purpose                                                                                         |
| ----------------------- | ----------------------------------------------------------------------------------------------- |
| `GET /api/health`       | `{ status: "ok", version }`                                                                     |
| `GET /api/capabilities` | `{ version, ai: { enabled, provider, model, requiresOptIn, promptVersion, limits } }`           |
| `POST /api/ai/explain`  | body `{ title, findings: [{ key, audit, rule, message, excerpt, sentence }] }`, 1 to 8 findings |
| `GET /api/ai/usage`     | counts from the ledger: calls today, last hour, kept, dropped                                   |

Errors use one envelope: `{ "error": { "code", "message", "details"? } }`. Codes: `ai_disabled`,
`ai_opt_in_required`, `ai_rate_limited` (429, `Retry-After`), `ai_provider_error` (502),
`ai_invalid_output` (502), `invalid_request` (422), `payload_too_large` (413), `host_not_allowed`,
`origin_not_allowed`, `request_timeout` (504), `internal_error`.

Hardening: binds to 127.0.0.1 by default; Host header allow-list; CORS limited to configured origins
plus an Origin check on writes; body cap 200 kB enforced while streaming; 30 s total deadline.

## Storage (SQLite, versioned migrations)

- Migration 1: `ai_calls(seq, at, provider, model, prompt_version, prompt_sha256, findings, kept,
dropped, error)`, the append-only usage ledger. It never stores script text, only a SHA-256 of the
  prompt.
- Migration 2: `ai_cache(prompt_sha256 primary key, at, body)`, the validated answer for an identical
  prompt, so repeating a request does not call the provider again.
- The rate limit (default 20 calls per hour) is counted from the ledger, so it survives restarts.

## Providers

- `anthropic`: enabled only when `SCRIPT_AUDIT_AI_PROVIDER=anthropic`, `ANTHROPIC_API_KEY` and
  `SCRIPT_AUDIT_AI_MODEL` are set in the backend's environment. The key is never logged or returned.
- `fake`: deterministic test provider for automated tests; markers in a finding's excerpt make it
  misbehave on purpose (`[[FAKE:EXTRA]]` unknown key, `[[FAKE:NUMBER]]` a rewrite with a new number,
  `[[FAKE:CITE]]` a rewrite with a claim tag, `[[FAKE:OTHER]]` an unknown finding key,
  `[[FAKE:PROSE]]` non-JSON, `[[FAKE:ERROR]]` provider failure).
