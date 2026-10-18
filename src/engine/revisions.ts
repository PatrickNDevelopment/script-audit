/** Revision history, suggestion application, undo/revert and the approval lock (spec 00). */
import { normalizeText } from './text';
import { isStorableText } from './workspace';
import {
  DEFAULT_SETTINGS,
  LIMITS,
  type Finding,
  type Revision,
  type RevisionKind,
  type Suggestion,
  type Workspace,
} from './types';

export type ChangeResult =
  | { ok: true; ws: Workspace }
  | {
      ok: false;
      reason:
        'approved' | 'stale' | 'limit' | 'unchanged' | 'too-long' | 'unstorable' | 'no-revision';
    };

export const REASONS: Record<Exclude<ChangeResult, { ok: true }>['reason'], string> = {
  approved: 'The script is approved. Reopen it for editing first.',
  stale: 'The text changed since this suggestion was made. Re-run the audit.',
  limit: `The history is full (${LIMITS.revisions} revisions). Export the workspace and start a new one; the original is never dropped.`,
  unchanged: 'Nothing changed.',
  'too-long': `The script is longer than ${LIMITS.textChars.toLocaleString('en-US')} characters.`,
  unstorable:
    'The text contains a NUL character or a broken emoji/surrogate pair, which cannot be saved. Remove it and try again.',
  'no-revision': 'There is no script yet.',
};

export function current(ws: Workspace): Revision | null {
  return ws.revisions[ws.revisions.length - 1] ?? null;
}

export function newWorkspace(
  title: string,
  rawText: string,
  at: string,
  sample = false,
): Workspace {
  return {
    schema: 'script-audit.workspace',
    version: 1,
    sample,
    status: 'draft',
    revisions: [
      {
        n: 1,
        at,
        note: sample ? 'Loaded the sample script' : 'Imported',
        kind: 'import',
        title: title.slice(0, LIMITS.titleChars),
        text: normalizeText(rawText),
      },
    ],
    claims: [],
    glossary: [],
    rejected: [],
    settings: { ...DEFAULT_SETTINGS },
  };
}

function push(
  ws: Workspace,
  title: string,
  text: string,
  kind: RevisionKind,
  note: string,
  at: string,
): ChangeResult {
  const cur = current(ws);
  if (!cur) return { ok: false, reason: 'no-revision' };
  if (ws.status === 'approved') return { ok: false, reason: 'approved' };
  if (ws.revisions.length >= LIMITS.revisions) return { ok: false, reason: 'limit' };
  if (text.length > LIMITS.textChars) return { ok: false, reason: 'too-long' };
  if (!isStorableText(text) || !isStorableText(title)) return { ok: false, reason: 'unstorable' };
  if (cur.title === title && cur.text === text) return { ok: false, reason: 'unchanged' };
  const rev: Revision = { n: cur.n + 1, at, note: note.slice(0, 300), kind, title, text };
  return { ok: true, ws: { ...ws, revisions: [...ws.revisions, rev] } };
}

export function commitEdit(
  ws: Workspace,
  title: string,
  rawText: string,
  at: string,
): ChangeResult {
  return push(
    ws,
    title.slice(0, LIMITS.titleChars),
    normalizeText(rawText),
    'edit',
    'Manual edit',
    at,
  );
}

export function suggestionOf(f: Finding): Suggestion | null {
  if (!f.fix) return null;
  return {
    key: f.key,
    target: f.target,
    start: f.start,
    end: f.end,
    expected: f.excerpt,
    replacement: f.fix.replacement,
    label: f.fix.note,
    source: 'audit',
  };
}

/** The text after applying `s`, or null when the suggestion no longer matches. */
export function preview(rev: Revision, s: Suggestion): { title: string; text: string } | null {
  if (s.target === 'title') {
    return rev.title === s.expected
      ? { title: s.replacement.slice(0, LIMITS.titleChars), text: rev.text }
      : null;
  }
  if (s.start < 0 || s.end > rev.text.length || s.start > s.end) return null;
  if (rev.text.slice(s.start, s.end) !== s.expected) return null;
  return {
    title: rev.title,
    text: rev.text.slice(0, s.start) + s.replacement + rev.text.slice(s.end),
  };
}

export function applySuggestion(ws: Workspace, s: Suggestion, at: string): ChangeResult {
  const cur = current(ws);
  if (!cur) return { ok: false, reason: 'no-revision' };
  if (ws.status === 'approved') return { ok: false, reason: 'approved' };
  const next = preview(cur, s);
  if (!next) return { ok: false, reason: 'stale' };
  const rule = s.key.split('|')[0] ?? '';
  return push(
    ws,
    next.title,
    next.text,
    s.source === 'ai' ? 'ai-apply' : 'apply',
    `${s.source === 'ai' ? 'Applied AI rewrite' : 'Applied'} ${rule}: ${s.label}`,
    at,
  );
}

/** A new revision equal to revision `n` (exact). */
export function revertTo(ws: Workspace, n: number, at: string): ChangeResult {
  const target = ws.revisions.find((r) => r.n === n);
  if (!target) return { ok: false, reason: 'no-revision' };
  return push(ws, target.title, target.text, 'revert', `Reverted to revision ${n}`, at);
}

/** Undo the latest change: a new revision equal to the one before it. */
export function undo(ws: Workspace, at: string): ChangeResult {
  const prev = ws.revisions[ws.revisions.length - 2];
  if (!prev) return { ok: false, reason: 'unchanged' };
  const r = push(ws, prev.title, prev.text, 'revert', `Undo (back to revision ${prev.n})`, at);
  return r;
}

export function setStatus(ws: Workspace, status: Workspace['status']): Workspace {
  return { ...ws, status };
}

export function reject(ws: Workspace, key: string): Workspace {
  return ws.rejected.includes(key) ? ws : { ...ws, rejected: [...ws.rejected, key].slice(-5000) };
}

export function restore(ws: Workspace, key: string): Workspace {
  return { ...ws, rejected: ws.rejected.filter((k) => k !== key) };
}
