import { describe, expect, it } from 'vitest';
import {
  applySuggestion,
  auditReport,
  buildRequest,
  commitEdit,
  current,
  DEFAULT_SETTINGS,
  diffText,
  interpret,
  LIMITS,
  narrationText,
  newWorkspace,
  parseWorkspaceJson,
  revertTo,
  revisionMarkdown,
  sampleWorkspace,
  setStatus,
  sideOf,
  splitTitle,
  spoken,
  suggestionOf,
  undo,
  validateWorkspace,
  type ChangeResult,
  type Finding,
  type Workspace,
} from '../src/engine';

const AT = '2026-10-18T12:00:00.000Z';
const ok = (r: ChangeResult): Workspace => {
  if (!r.ok) throw new Error(r.reason);
  return r.ws;
};

describe('revisions', () => {
  const base = newWorkspace('Title', 'One  two three.', AT);
  const s5 = spoken('One  two three.', [], DEFAULT_SETTINGS)[0] as Finding;

  it('applies a suggestion as a new revision and keeps the original', () => {
    const ws = ok(applySuggestion(base, suggestionOf(s5)!, AT));
    expect(ws.revisions.map((r) => [r.n, r.kind, r.text])).toEqual([
      [1, 'import', 'One  two three.'],
      [2, 'apply', 'One two three.'],
    ]);
    expect(current(ws)?.note).toBe('Applied S5: Replace with one space.');
  });

  it('refuses stale suggestions and changes nothing', () => {
    const edited = ok(commitEdit(base, 'Title', 'Zero. One  two three.', AT));
    expect(applySuggestion(edited, suggestionOf(s5)!, AT)).toEqual({ ok: false, reason: 'stale' });
  });

  it('refuses every change while approved', () => {
    const locked = setStatus(base, 'approved');
    expect(applySuggestion(locked, suggestionOf(s5)!, AT)).toEqual({
      ok: false,
      reason: 'approved',
    });
    expect(commitEdit(locked, 'T', 'x', AT)).toEqual({ ok: false, reason: 'approved' });
    expect(undo(ok(applySuggestion(base, suggestionOf(s5)!, AT)), AT).ok).toBe(true);
    expect(revertTo(locked, 1, AT)).toEqual({ ok: false, reason: 'approved' });
  });

  it('undo and revert are exact and append-only', () => {
    let ws = ok(applySuggestion(base, suggestionOf(s5)!, AT));
    ws = ok(commitEdit(ws, 'New title', 'Completely different.', AT));
    ws = ok(undo(ws, AT));
    expect(current(ws)).toMatchObject({
      n: 4,
      kind: 'revert',
      title: 'Title',
      text: 'One two three.',
    });
    ws = ok(revertTo(ws, 1, AT));
    expect(current(ws)).toMatchObject({ n: 5, title: 'Title', text: 'One  two three.' });
    expect(ws.revisions[0]?.text).toBe('One  two three.');
    expect(revertTo(ws, 1, AT)).toEqual({ ok: false, reason: 'unchanged' });
  });

  it('applies title suggestions', () => {
    const ws = ok(
      applySuggestion(
        base,
        {
          key: 'P2|Title|0',
          target: 'title',
          start: 0,
          end: 5,
          expected: 'Title',
          replacement: 'Better',
          label: 'x',
          source: 'audit',
        },
        AT,
      ),
    );
    expect(current(ws)).toMatchObject({ title: 'Better', text: 'One  two three.' });
  });

  it('caps history and text length without dropping the original', () => {
    let ws = base;
    for (let i = 0; i < LIMITS.revisions - 1; i += 1) ws = ok(commitEdit(ws, 'Title', `v${i}`, AT));
    expect(commitEdit(ws, 'Title', 'one more', AT)).toEqual({ ok: false, reason: 'limit' });
    expect(commitEdit(base, 'Title', 'x'.repeat(LIMITS.textChars + 1), AT)).toEqual({
      ok: false,
      reason: 'too-long',
    });
  });
});

function rng(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = Math.imul(a ^ (a >>> 15), a | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

describe('diff', () => {
  it('reconstructs both sides exactly (300 random edits)', () => {
    const r = rng(7);
    const vocab = [
      'the',
      'tower',
      'moved',
      ',',
      '.',
      ' ',
      '\n',
      'Siobhán',
      '“',
      'é',
      '\n\n',
      'storm',
    ];
    for (let n = 0; n < 300; n += 1) {
      const a = Array.from(
        { length: Math.floor(r() * 40) },
        () => vocab[Math.floor(r() * vocab.length)],
      ).join('');
      const b =
        a
          .split('')
          .filter(() => r() > 0.1)
          .join('') + (r() > 0.5 ? ' tower' : '');
      const ops = diffText(a, b);
      expect(sideOf(ops, 'old')).toBe(a);
      expect(sideOf(ops, 'new')).toBe(b);
    }
  });
  it('marks a one-word change at word level', () => {
    expect(diffText('a tall tower', 'a short tower')).toEqual([
      { type: 'eq', text: 'a ' },
      { type: 'del', text: 'tall' },
      { type: 'ins', text: 'short' },
      { type: 'eq', text: ' tower' },
    ]);
  });
  it('stays fast and exact on a large script', () => {
    const big = Array.from({ length: 4000 }, (_, i) => `Line ${i} of the script.`).join('\n');
    const changed = big.replace('Line 2000 of', 'Row 2000 of').replace('Line 10 ', 'Line ten ');
    const t0 = Date.now();
    const ops = diffText(big, changed);
    expect(Date.now() - t0).toBeLessThan(3000);
    expect(sideOf(ops, 'new')).toBe(changed);
  });
});

describe('workspace', () => {
  const ws = sampleWorkspace(AT);
  it('accepts the sample and round-trips through JSON', () => {
    expect(parseWorkspaceJson(JSON.stringify(ws)).ok).toBe(true);
  });
  it('rejects unknown keys, bad versions, broken numbering, duplicates and unsafe text', () => {
    expect(validateWorkspace({ ...ws, extra: 1 }).ok).toBe(false);
    expect(validateWorkspace({ ...ws, version: 2 }).ok).toBe(false);
    expect(validateWorkspace({ ...ws, revisions: [{ ...ws.revisions[0], n: 2 }] }).ok).toBe(false);
    expect(validateWorkspace({ ...ws, claims: [ws.claims[0], ws.claims[0]] }).ok).toBe(false);
    expect(
      validateWorkspace({ ...ws, revisions: [{ ...ws.revisions[0], text: 'a\uD800b' }] }).ok,
    ).toBe(false);
    expect(
      validateWorkspace({ ...ws, revisions: [{ ...ws.revisions[0], text: 'a\r\nb' }] }).ok,
    ).toBe(false);
    expect(
      validateWorkspace({
        ...ws,
        claims: [
          {
            id: 'x',
            statement: 's',
            sources: [{ citation: 'c', url: 'javascript:alert(1)', quote: 'q' }],
          },
        ],
      }).ok,
    ).toBe(false);
    expect(
      validateWorkspace({
        ...ws,
        glossary: [
          { term: 'A', say: '1' },
          { term: 'a', say: '2' },
        ],
      }).ok,
    ).toBe(false);
    expect(parseWorkspaceJson('{').ok).toBe(false);
    expect(parseWorkspaceJson('{"__proto__":{"x":1}}').ok).toBe(false);
  });
});

describe('exports', () => {
  const ws = sampleWorkspace(AT);
  const rev = current(ws)!;
  it('Markdown export round-trips through import', () => {
    expect(splitTitle(revisionMarkdown(rev))).toEqual({ title: rev.title, text: rev.text });
  });
  it('narration export removes tags and markup and lists the glossary', () => {
    const n = narrationText(rev, ws);
    expect(n).not.toMatch(/\[c:|\{setup|\{payoff|##/);
    expect(n).toContain("[The keeper's log]");
    expect(n).toContain('- Brannock: BRAN-ock');
    expect(n).toContain('This is an estimate.');
  });
  it('the report states what the audits do not do', () => {
    expect(auditReport(rev, ws, {}, null)).toContain(
      'They do not verify facts and do not predict views, click-through or retention.',
    );
  });
});

describe('AI answers are untrusted', () => {
  const text =
    'The crew pulled the tower inland across the soft wet fields of the coast, and the whole town came out every single morning to watch them work slowly through the mud.';
  const finding = spoken(text, [], DEFAULT_SETTINGS).find((f) => f.rule === 'S1')!;
  const meta = { provider: 'fake', model: 'm', promptVersion: 'p', dropped: 0, cached: false };
  const answer = (rewrite: unknown, key = finding.key) => ({
    recommendations: [
      {
        findingKey: key,
        explanation: 'Shorter is easier to say.',
        ...(rewrite ? { rewrite } : {}),
      },
    ],
    meta,
  });

  it('builds a request with only the selected findings and no claims', () => {
    const req = buildRequest('T', text, [finding]);
    expect(Object.keys(req)).toEqual(['title', 'findings']);
    expect(req.findings[0]).toMatchObject({ key: finding.key, rule: 'S1' });
  });
  it('turns a valid rewrite into an ordinary, unapplied suggestion', () => {
    const r = interpret(
      answer({
        original: finding.excerpt,
        replacement: 'The crew pulled the tower inland. The whole town came to watch.',
      }),
      [finding],
    );
    expect(r.ok && r.recs[0]?.suggestion).toMatchObject({
      source: 'ai',
      expected: finding.excerpt,
      label: 'AI rewrite (unverified)',
    });
  });
  it('drops rewrites that add numbers, citations, links or quotes, or target other text', () => {
    const bad = [
      { original: finding.excerpt, replacement: 'The crew of 40 pulled the tower.' },
      { original: finding.excerpt, replacement: 'The crew pulled the tower [c:x].' },
      { original: finding.excerpt, replacement: 'See https://example.com for the crew.' },
      { original: finding.excerpt, replacement: 'The crew said “pull”.' },
      { original: 'something else', replacement: 'x' },
    ];
    for (const rw of bad) {
      const r = interpret(answer(rw), [finding]);
      expect(r.ok && r.recs[0]?.suggestion).toBe(null);
      expect(r.ok && r.recs[0]?.rewriteDropped).toBeTruthy();
    }
  });
  it('rejects unknown keys entirely and drops unknown finding keys', () => {
    expect(interpret({ ...answer(null), status: 'approved' }, [finding]).ok).toBe(false);
    expect(
      interpret(
        { recommendations: [{ findingKey: finding.key, explanation: 'x', approve: true }], meta },
        [finding],
      ).ok,
    ).toBe(false);
    const r = interpret(answer(null, 'S1|other|0'), [finding]);
    expect(r.ok && [r.recs.length, r.dropped]).toEqual([0, 1]);
  });
});
