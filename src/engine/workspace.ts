/** Versioned workspace schema and strict validation (spec 00 "Workspace"). */
import { z } from 'zod';
import { ID_RE } from './text';
import { LIMITS, type Workspace } from './types';

// Text must not hold U+0000 or a lone surrogate (JSON and SQLite round trips break on them).
export function isStorableText(s: string): boolean {
  if (s.includes('\u0000')) return false;
  for (let i = 0; i < s.length; i += 1) {
    const c = s.charCodeAt(i);
    if (c >= 0xd800 && c <= 0xdbff) {
      const d = s.charCodeAt(i + 1);
      if (!(d >= 0xdc00 && d <= 0xdfff)) return false;
      i += 1;
    } else if (c >= 0xdc00 && c <= 0xdfff) return false;
  }
  return true;
}

const str = (max: number) =>
  z.string().max(max).refine(isStorableText, 'contains a NUL character or a broken surrogate pair');
const url = z
  .string()
  .max(2000)
  .refine(
    (u) => u === '' || /^https?:\/\/[^\s]+$/i.test(u),
    'URLs must start with http:// or https://',
  );

const revision = z
  .object({
    n: z.number().int().min(1),
    at: z.string().max(40),
    note: str(300),
    kind: z.enum(['import', 'edit', 'apply', 'revert', 'ai-apply']),
    title: str(LIMITS.titleChars),
    text: str(LIMITS.textChars).refine((t) => !t.includes('\r'), 'line endings must be \\n'),
  })
  .strict();

const claim = z
  .object({
    id: z.string().regex(ID_RE, 'claim ids are a-z, 0-9 and -, up to 24'),
    statement: str(2000),
    sources: z
      .array(z.object({ citation: str(500), url, quote: str(2000) }).strict())
      .max(LIMITS.sourcesPerClaim),
  })
  .strict();

const workspace = z
  .object({
    schema: z.literal('script-audit.workspace'),
    version: z.literal(1),
    sample: z.boolean(),
    status: z.enum(['draft', 'approved']),
    revisions: z.array(revision).min(1).max(LIMITS.revisions),
    claims: z.array(claim).max(LIMITS.claims),
    glossary: z
      .array(
        z
          .object({ term: str(80).refine((t) => t.trim() !== '', 'empty term'), say: str(200) })
          .strict(),
      )
      .max(LIMITS.glossary),
    rejected: z.array(z.string().max(4000)).max(5000),
    settings: z
      .object({
        wpm: z.number().int().min(100).max(220),
        maxWords: z.number().int().min(12).max(60),
      })
      .strict(),
  })
  .strict();

export type WorkspaceResult = { ok: true; workspace: Workspace } | { ok: false; errors: string[] };

export function validateWorkspace(value: unknown): WorkspaceResult {
  const r = workspace.safeParse(value);
  if (!r.success) {
    return {
      ok: false,
      errors: r.error.issues
        .slice(0, 20)
        .map((i) => `${i.path.join('.') || '(root)'}: ${i.message}`),
    };
  }
  const w = r.data as Workspace;
  const errors: string[] = [];
  w.revisions.forEach((rev, i) => {
    if (rev.n !== i + 1)
      errors.push(`revisions.${i}.n: revisions must be numbered 1, 2, 3, ... in order`);
  });
  const ids = new Set<string>();
  for (const c of w.claims) {
    if (ids.has(c.id)) errors.push(`claims: duplicate id ${c.id}`);
    ids.add(c.id);
  }
  const terms = new Set<string>();
  for (const g of w.glossary) {
    const k = g.term.toLowerCase();
    if (terms.has(k)) errors.push(`glossary: duplicate term ${g.term}`);
    terms.add(k);
  }
  return errors.length ? { ok: false, errors } : { ok: true, workspace: w };
}

export function parseWorkspaceJson(text: string): WorkspaceResult {
  if (new TextEncoder().encode(text).length > LIMITS.workspaceBytes)
    return { ok: false, errors: ['The file is larger than 20 MB.'] };
  let value: unknown;
  try {
    value = JSON.parse(text);
  } catch {
    return { ok: false, errors: ['The file is not valid JSON.'] };
  }
  return validateWorkspace(value);
}
