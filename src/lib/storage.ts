/** Browser persistence of the workspace, with corruption recovery; per-session AI opt-in. */
import { validateWorkspace, type Workspace } from '../engine';

export const WORKSPACE_KEY = 'script-audit.workspace.v1';
export const CORRUPT_KEY = 'script-audit.workspace.v1.corrupt';
export const BACKEND_KEY = 'script-audit.backend-url';
export const OPT_IN_KEY = 'script-audit.ai-opt-in';
export const DEFAULT_BACKEND = 'http://127.0.0.1:8799';

function local(): Storage | null {
  try {
    return window.localStorage;
  } catch {
    return null;
  }
}

function session(): Storage | null {
  try {
    return window.sessionStorage;
  } catch {
    return null;
  }
}

export type LoadResult =
  | { kind: 'empty' }
  | { kind: 'ok'; workspace: Workspace }
  | { kind: 'recovered'; raw: string; errors: string[] };

export function loadWorkspace(): LoadResult {
  let raw: string | null;
  try {
    raw = local()?.getItem(WORKSPACE_KEY) ?? null;
  } catch {
    raw = null;
  }
  if (raw === null) return { kind: 'empty' };
  let value: unknown;
  try {
    value = JSON.parse(raw);
  } catch {
    return keepCorrupt(raw, ['the stored workspace is not valid JSON']);
  }
  const r = validateWorkspace(value);
  return r.ok ? { kind: 'ok', workspace: r.workspace } : keepCorrupt(raw, r.errors);
}

function keepCorrupt(raw: string, errors: string[]): LoadResult {
  try {
    local()?.setItem(CORRUPT_KEY, raw);
  } catch {
    /* still offered as a download */
  }
  return { kind: 'recovered', raw, errors };
}

/** Returns an error message, or null when saved. */
export function saveWorkspace(ws: Workspace | null): string | null {
  const s = local();
  if (s === null)
    return 'Browser storage is unavailable; export the workspace as JSON to keep your work.';
  try {
    if (ws === null) s.removeItem(WORKSPACE_KEY);
    else s.setItem(WORKSPACE_KEY, JSON.stringify(ws));
    return null;
  } catch {
    return 'The browser refused to save the workspace (storage may be full). Export it as JSON now.';
  }
}

export function loadBackendUrl(): string {
  try {
    return local()?.getItem(BACKEND_KEY) || DEFAULT_BACKEND;
  } catch {
    return DEFAULT_BACKEND;
  }
}

export function saveBackendUrl(url: string): void {
  try {
    local()?.setItem(BACKEND_KEY, url);
  } catch {
    /* convenience only */
  }
}

export function loadOptIn(): boolean {
  try {
    return session()?.getItem(OPT_IN_KEY) === 'yes';
  } catch {
    return false;
  }
}

export function saveOptIn(on: boolean): void {
  try {
    if (on) session()?.setItem(OPT_IN_KEY, 'yes');
    else session()?.removeItem(OPT_IN_KEY);
  } catch {
    /* the opt-in then lasts only while the page is open */
  }
}
