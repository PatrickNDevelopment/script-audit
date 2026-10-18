/** Client for the optional local backend. Every failure becomes a readable state, never a throw. */
import type { ExplainRequest } from '../engine';

export type Capabilities =
  | { kind: 'offline'; message: string }
  | { kind: 'disabled' }
  | { kind: 'enabled'; provider: string; model: string; callsPerHour: number };

export function normalizeBackendUrl(raw: string): string | null {
  const t = raw.trim().replace(/\/+$/, '');
  try {
    const u = new URL(t);
    if (u.protocol !== 'http:' && u.protocol !== 'https:') return null;
    if (u.pathname !== '/' && u.pathname !== '') return null;
    if (u.search || u.hash || u.username || u.password) return null;
    return `${u.protocol}//${u.host}`;
  } catch {
    return null;
  }
}

async function fetchJson(
  url: string,
  init: RequestInit,
  ms: number,
): Promise<{ status: number; body: unknown }> {
  const ctl = new AbortController();
  const timer = setTimeout(() => ctl.abort(), ms);
  try {
    const r = await fetch(url, { ...init, signal: ctl.signal });
    let body: unknown = null;
    try {
      body = await r.json();
    } catch {
      body = null;
    }
    return { status: r.status, body };
  } finally {
    clearTimeout(timer);
  }
}

export async function capabilities(base: string): Promise<Capabilities> {
  try {
    const r = await fetchJson(`${base}/api/capabilities`, {}, 4000);
    const ai = (
      r.body as {
        ai?: {
          enabled?: unknown;
          provider?: unknown;
          model?: unknown;
          limits?: { callsPerHour?: unknown };
        };
      } | null
    )?.ai;
    if (r.status !== 200 || !ai)
      return { kind: 'offline', message: `The backend answered HTTP ${r.status}.` };
    if (ai.enabled !== true) return { kind: 'disabled' };
    return {
      kind: 'enabled',
      provider: String(ai.provider ?? ''),
      model: String(ai.model ?? ''),
      callsPerHour: Number(ai.limits?.callsPerHour ?? 0),
    };
  } catch {
    return { kind: 'offline', message: `No backend is reachable at ${base}.` };
  }
}

export type ExplainResult = { ok: true; body: unknown } | { ok: false; message: string };

export async function explain(base: string, req: ExplainRequest): Promise<ExplainResult> {
  try {
    const r = await fetchJson(
      `${base}/api/ai/explain`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'X-ScriptAudit-AI-Opt-In': 'session' },
        body: JSON.stringify(req),
      },
      35_000,
    );
    if (r.status === 200) return { ok: true, body: r.body };
    const err = (r.body as { error?: { message?: unknown } } | null)?.error;
    return {
      ok: false,
      message:
        typeof err?.message === 'string'
          ? err.message.slice(0, 300)
          : `The backend answered HTTP ${r.status}.`,
    };
  } catch {
    return {
      ok: false,
      message: 'The backend did not answer (offline or timed out). Nothing was changed.',
    };
  }
}
