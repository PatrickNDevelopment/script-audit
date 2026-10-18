# ScriptAudit backend

Optional, local-only FastAPI service for the AI explanation broker. See
`docs/spec/02-ai-broker-and-api.md` for the API and `docs/architecture.md` for why it exists.

```powershell
python -m venv ..\.venv
..\.venv\Scripts\python -m pip install -r requirements.lock.txt
..\.venv\Scripts\python -m script_audit          # http://127.0.0.1:8799, docs at /api/docs
```

Settings are `SCRIPT_AUDIT_*` environment variables (see `../.env.example`). AI is disabled unless
`SCRIPT_AUDIT_AI_PROVIDER` is set and, for `anthropic`, `ANTHROPIC_API_KEY` and
`SCRIPT_AUDIT_AI_MODEL` are present. The provider `fake` exists for tests only.

Checks (from the repository root): `npm run backend:lint`, `backend:format`, `backend:types`,
`backend:test`.
