/**
 * Regression tests for defects found in the independent acceptance review (prompt 06B). Each test
 * failed on commit edaa5b3.
 */
import { describe, expect, it } from 'vitest';
import {
  applySuggestion,
  commitEdit,
  current,
  DEFAULT_SETTINGS,
  grounding,
  interpret,
  narrative,
  newWorkspace,
  packaging,
  reject,
  rewriteProblem,
  spoken,
  suggestionOf,
  validateWorkspace,
  type ChangeResult,
  type Finding,
  type Workspace,
} from '../src/engine';
import { autoCheckBackend } from '../src/lib/api';

const AT = '2026-10-18T12:00:00.000Z';
const ok = (r: ChangeResult): Workspace => {
  if (!r.ok) throw new Error(r.reason);
  return r.ws;
};

describe('AI rewrites cannot add facts (browser rules)', () => {
  const excerpt = 'The tower is tall, and it is old.';
  const f: Finding = {
    key: `S1|${excerpt}|0`,
    audit: 'spoken',
    rule: 'S1',
    target: 'text',
    start: 0,
    end: excerpt.length,
    excerpt,
    message: '',
    triggers: [],
    fix: null,
  };
  const p = (replacement: string) => rewriteProblem(f, excerpt, replacement);

  it('keeps a plain rewrite', () => {
    expect(p('The tower is tall. It is old.')).toBe(null);
    expect(p('The tower’s tall. It’s old.')).toBe(null);
  });
  it('drops spelled-out numbers, superlatives, attributions, quotations and links', () => {
    expect(p('The tower is tall. It is three million years old.')).toMatch(/number/);
    expect(p('The tower is tall. It is twice as old.')).toMatch(/number/);
    expect(p('According to experts, the tower is tall. It is old.')).toMatch(/claim/);
    expect(p('The tower is the tallest. It is old.')).toMatch(/claim/);
    expect(p('The tower is tall. It was the first.')).toMatch(/claim/);
    expect(p('The tower is tall. It is ‘old’, they say.')).toMatch(/quotation/);
    expect(p('The tower is tall. It is «old».')).toMatch(/quotation/);
    expect(p("The tower is tall. It is 'old', they say.")).toMatch(/quotation/);
    expect(p('The tower is tall. See [here](example.com).')).toMatch(/link/);
    expect(p('The tower is tall. See example.org.')).toMatch(/link/);
  });
  it('drops a second answer for the same finding', () => {
    const meta = { provider: 'x', model: 'y', promptVersion: 'z', dropped: 0, cached: false };
    const r = interpret(
      {
        recommendations: [
          { findingKey: f.key, explanation: 'One.' },
          { findingKey: f.key, explanation: 'Two.' },
        ],
        meta,
      },
      [f],
    );
    expect(r.ok && r.recs.map((x) => x.explanation)).toEqual(['One.']);
    expect(r.ok && r.dropped).toBe(1);
  });
});

describe('text that cannot be stored is refused before it is saved', () => {
  it('a NUL or a lone surrogate never reaches a revision', () => {
    const ws = newWorkspace('T', 'Clean.', AT);
    expect(commitEdit(ws, 'T', 'A NUL \u0000 here.', AT)).toEqual({
      ok: false,
      reason: 'unstorable',
    });
    expect(commitEdit(ws, 'T', 'Half an emoji \ud83d here.', AT)).toEqual({
      ok: false,
      reason: 'unstorable',
    });
    const fine = ok(commitEdit(ws, 'T', 'A whole emoji 😀 here.', AT));
    expect(validateWorkspace(JSON.parse(JSON.stringify(fine))).ok).toBe(true);
  });
});

describe('a rejection stays on the double space it was made for', () => {
  it('fixing another double space does not move the rejection', () => {
    let ws = newWorkspace('T', 'One  two. Three  four. Five  six.', AT);
    const s5 = () => spoken(current(ws)!.text, [], DEFAULT_SETTINGS).filter((f) => f.rule === 'S5');
    const [first, second] = s5();
    ws = reject(ws, second!.key);
    ws = ok(applySuggestion(ws, suggestionOf(first!)!, AT));
    const after = s5().map((f) => [f.excerpt, ws.rejected.includes(f.key)]);
    expect(after).toEqual([
      ['Three  four.', true],
      ['Five  six.', false],
    ]);
  });
  it('the fix replaces exactly one gap and never splits an emoji', () => {
    const text = `${'😀'.repeat(30)}  next`;
    const f = spoken(text, [], DEFAULT_SETTINGS).find((x) => x.rule === 'S5')!;
    const out = text.slice(0, f.start) + f.fix!.replacement + text.slice(f.end);
    expect(out).toBe(`${'😀'.repeat(30)} next`);
    expect(f.excerpt.charCodeAt(0)).not.toBeGreaterThanOrEqual(0xdc00);
  });
});

describe('packaging title fix respects word boundaries', () => {
  it('replaces the whole word, not a word that contains it', () => {
    const fs = packaging('Insanely good and insane', 'Insane things happen.', []);
    expect(fs.find((f) => f.rule === 'P2' && f.target === 'title')?.fix?.replacement).toBe(
      'Insanely good and remarkable',
    );
  });
});

describe('"first" as a discourse marker is not a superlative', () => {
  it('does not count "First," / "at first" / "first of all", still counts a real "first"', () => {
    expect(grounding('First, let me tell you about my grandmother.', []).assertions).toBe(0);
    expect(grounding('At first, nobody came. It rained at first.', []).assertions).toBe(0);
    expect(grounding('First of all, we went home.', []).assertions).toBe(0);
    expect(grounding('She was the first keeper.', []).findings[0]?.triggers).toEqual(['first']);
    expect(grounding('First, the town grew 12 percent.', []).findings[0]?.triggers).toEqual([
      '12',
      'percent',
    ]);
  });
});

describe('long scripts stay responsive', () => {
  it('spoken and narrative audits on a 199,000-character single-section script', () => {
    const para =
      'The tower stood for many years, and the town grew around it while the harbour filled with boats and water and water. ';
    let text = '';
    for (let i = 0; text.length < 198_500; i += 1) text += para + (i % 5 === 4 ? '\n\n' : '');
    const t0 = performance.now();
    const s = spoken(text, [], DEFAULT_SETTINGS);
    const n = narrative(text);
    const ms = performance.now() - t0;
    expect(s.some((f) => f.rule === 'S2')).toBe(true);
    expect(n.length).toBeGreaterThan(0);
    // Before the fix this took about 23 s in Node; now well under a second on a laptop.
    expect(ms).toBeLessThan(4000);
  });
});

describe('the public static demo does not probe the visitor’s machine', () => {
  it('auto-checks the backend only from a loopback page or after the user chose an address', () => {
    expect(autoCheckBackend('localhost', false)).toBe(true);
    expect(autoCheckBackend('127.0.0.1', false)).toBe(true);
    expect(autoCheckBackend('example.github.io', false)).toBe(false);
    expect(autoCheckBackend('example.github.io', true)).toBe(true);
  });
});
