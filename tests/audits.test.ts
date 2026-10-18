import { describe, expect, it } from 'vitest';
import {
  DEFAULT_SETTINGS,
  grounding,
  narrative,
  packaging,
  SAMPLE_CLAIMS,
  SAMPLE_GLOSSARY,
  SAMPLE_TEXT,
  SAMPLE_TITLE,
  spoken,
  type Claim,
  type Finding,
} from '../src/engine';

const rules = (fs: Finding[]) => fs.map((f) => f.rule);
const src = { citation: 'Sample source', url: '', quote: 'It grew 12 percent in 2020.' };
const claim = (id: string, statement: string, sources = [src]): Claim => ({
  id,
  statement,
  sources,
});

describe('grounding', () => {
  it('flags assertions without links and shows the triggers', () => {
    const g = grounding(
      'The town grew 12 percent. It was a nice day. Experts agree it was the fastest growth.',
      [],
    );
    expect(rules(g.findings)).toEqual(['G1', 'G1']);
    expect(g.findings[0]?.triggers).toEqual(['12', 'percent']);
    expect(g.findings[1]?.triggers).toEqual(['fastest', 'experts']);
    expect(g.assertions).toBe(2);
    expect(g.covered).toBe(0);
  });

  it('journey 2: a claim tag covers only its own sentence', () => {
    const before =
      'The town grew 12 percent in 2020. It was the fastest growth on record. It rained.';
    const after =
      'The town grew 12 percent in 2020 [c:growth]. It was the fastest growth on record. It rained.';
    const claims = [claim('growth', 'The town grew 12 percent in 2020.')];
    const g0 = grounding(before, claims);
    const g1 = grounding(after, claims);
    expect(g0.findings.map((f) => f.excerpt)).toEqual([
      'The town grew 12 percent in 2020.',
      'It was the fastest growth on record.',
    ]);
    expect(g1.findings.map((f) => f.excerpt)).toEqual(['It was the fastest growth on record.']);
    expect(g1.findings[0]?.key).toBe(g0.findings[1]?.key);
    expect([g0.covered, g1.covered]).toEqual([0, 1]);
  });

  it('distinguishes unknown ids, claims without sources and number mismatches', () => {
    const claims = [
      claim('ok', 'It grew 12 percent in 2020.'),
      claim('nosrc', 'x', []),
      claim('halfsrc', 'x', [{ citation: 'c', url: '', quote: ' ' }]),
    ];
    const g = grounding(
      'It grew 12 percent [c:missing]. It grew 12 percent [c:nosrc]. It grew 12 percent [c:halfsrc]. It grew 15 percent [c:ok]. It grew 12 percent in 2020 [c:ok].',
      claims,
    );
    expect(rules(g.findings)).toEqual(['G2', 'G3', 'G3', 'G4']);
    expect(g.findings[3]?.triggers).toEqual(['15']);
    expect(g.covered).toBe(1);
  });

  it('a tag only covers a sentence when the claim contains its superlatives and number words', () => {
    const claims = [
      claim('log', 'The keeper logged 212 storms.'),
      claim('first', 'She was the first keeper to ask, twice.'),
    ];
    expect(
      grounding('She was the first keeper to ask [c:log].', claims).findings.map((f) => [
        f.rule,
        f.message,
      ]),
    ).toEqual([['G4', 'Not in the linked claim: first.']]);
    expect(grounding('She was the first keeper to ask, twice [c:first].', claims).findings).toEqual(
      [],
    );
    expect(grounding('Experts say the log has 212 storms [c:log].', claims).findings).toEqual([]);
  });

  it('accepts a tag after the full stop and several ids in one tag', () => {
    const claims = [claim('a', 'It grew 12 percent.'), claim('b', 'In 2020.')];
    expect(grounding('It grew 12 percent in 2020. [c:a, B]', claims).findings).toEqual([]);
  });

  it('never flags non-assertions, even with a tag, and never offers a fix', () => {
    expect(grounding('A quiet morning [c:nothing].', []).findings).toEqual([]);
    const g = grounding(SAMPLE_TEXT, SAMPLE_CLAIMS);
    expect(g.findings.every((f) => f.fix === null)).toBe(true);
  });

  it('ignores numbers that belong to markup (claim ids, link targets)', () => {
    expect(
      grounding('Read [the report](https://x.y/2021) for details [c:c2021].', []).findings,
    ).toEqual([]);
  });
});

describe('narrative', () => {
  it('N1 repeated four-word phrases from the third use', () => {
    const t =
      'We crossed the old bridge. Then we crossed the old bridge again. Finally we crossed the old bridge home.';
    const fs = narrative(t).filter((f) => f.rule === 'N1');
    expect(fs.map((f) => f.excerpt)).toEqual(['we crossed the old bridge']);
    expect(fs[0]?.start).toBe(t.lastIndexOf('we crossed'));
  });
  it('N2 repeated openings only inside a beat', () => {
    expect(rules(narrative('The town slept. The town woke.'))).toEqual(['N2']);
    expect(rules(narrative('The town slept.\n\nThe town woke.'))).toEqual([]);
  });
  it('N3 and N4 setups and payoffs', () => {
    expect(rules(narrative('{setup:a}Why? {payoff:a}Because.'))).toEqual([]);
    expect(rules(narrative('{setup:a}Why?'))).toEqual(['N3']);
    expect(rules(narrative('{payoff:a}Because. {setup:a}Why?'))).toEqual(['N4', 'N3']);
  });
  it('N5 long exposition resets at a question, quote, "you" or example', () => {
    const plain = Array.from(
      { length: 20 },
      (_, i) => `Sentence number ${i} has exactly eight words here.`,
    ).join(' ');
    const n5 = (t: string) => rules(narrative(t)).filter((r) => r === 'N5');
    expect(n5(plain)).toEqual(['N5']);
    const broken = plain.replace('Sentence number 10 has', 'Can you see number 10 has');
    expect(n5(broken)).toEqual([]);
  });
  it('N6 abrupt transitions need no cue and no shared word', () => {
    expect(rules(narrative('The mill burned.\n\n## Later\nFarmers planted wheat.'))).toEqual([
      'N6',
    ]);
    expect(rules(narrative('The mill burned.\n\n## Later\nBut farmers planted wheat.'))).toEqual(
      [],
    );
    expect(rules(narrative('The mill burned.\n\n## Later\nA new mill opened.'))).toEqual([]);
  });
});

describe('spoken', () => {
  const S = DEFAULT_SETTINGS;
  it('S1 splits a long sentence at the separator nearest the middle', () => {
    const t =
      'The crew pulled the tower inland across the soft wet fields of the coast, and the whole town came out every single morning to watch them work slowly through the mud.';
    const f = spoken(t, [], S).find((x) => x.rule === 'S1');
    expect(f?.fix?.replacement).toBe(
      'The crew pulled the tower inland across the soft wet fields of the coast. And the whole town came out every single morning to watch them work slowly through the mud.',
    );
    expect(spoken(t, [], { ...S, maxWords: 40 }).some((x) => x.rule === 'S1')).toBe(false);
  });
  it('S3 suggests a comma before a conjunction in a breathless run', () => {
    const t =
      'The ground was soft and wet for most of the year so the engineers had to plan every metre of the route first.';
    const f = spoken(t, [], S).find((x) => x.rule === 'S3');
    expect(f?.fix?.replacement).toBe(
      'The ground was soft and wet for most of the year, so the engineers had to plan every metre of the route first',
    );
  });
  it('S2 repeated words within 40 words', () => {
    expect(rules(spoken('The tower stood. The tower fell. The tower rose.', [], S))).toEqual([
      'S2',
    ]);
  });
  it('S4 pronunciation respects the glossary and possessives', () => {
    const t = 'Siobhán met the NASA team at B17. Siobhán’s log was there.';
    expect(
      spoken(t, [], S)
        .filter((f) => f.rule === 'S4')
        .map((f) => f.excerpt),
    ).toEqual(['Siobhán', 'NASA', 'B17']);
    expect(
      spoken(t, [{ term: 'siobhán', say: 'shiv-AWN' }], S)
        .filter((f) => f.rule === 'S4')
        .map((f) => f.excerpt),
    ).toEqual(['NASA', 'B17']);
  });
  it('S5 double spaces', () => {
    const f = spoken('One  two.', [], S)[0];
    expect(f).toMatchObject({ rule: 'S5', start: 3, end: 5, fix: { replacement: ' ' } });
  });
});

describe('packaging', () => {
  it('P1 title words must reach the hook', () => {
    expect(rules(packaging('Bridges of Paris', 'A story about rivers.', []))).toEqual(['P1']);
    expect(rules(packaging('Bridges of Paris', 'Every bridge has a story.', []))).toEqual([]);
  });
  it('P2 sensational phrases with neutral fixes in title and hook', () => {
    const fs = packaging('A Shocking Discovery', 'This shocking find changed a town.', []);
    expect(fs.map((f) => [f.rule, f.target, f.fix?.replacement])).toEqual([
      ['P2', 'title', 'A Surprising Discovery'],
      ['P2', 'text', 'surprising'],
    ]);
  });
  it('P3 title numbers and superlatives must be covered', () => {
    const claims = [claim('g', 'It grew 12 percent in 2020.')];
    expect(rules(packaging('12 percent growth', 'Growth was 12 percent in 2020.', claims))).toEqual(
      ['P3'],
    );
    expect(
      rules(packaging('12 percent growth', 'Growth was 12 percent in 2020 [c:g].', claims)),
    ).toEqual([]);
  });
  it('P4 empty or long titles', () => {
    expect(rules(packaging('', 'Text.', []))).toEqual(['P4']);
    expect(rules(packaging('Lighthouse '.repeat(7), 'A lighthouse.', []))).toEqual(['P4']);
  });
});

describe('determinism and keys', () => {
  it('same input, same findings', () => {
    const run = () => [
      grounding(SAMPLE_TEXT, SAMPLE_CLAIMS).findings,
      narrative(SAMPLE_TEXT),
      spoken(SAMPLE_TEXT, SAMPLE_GLOSSARY, DEFAULT_SETTINGS),
      packaging(SAMPLE_TITLE, SAMPLE_TEXT, SAMPLE_CLAIMS),
    ];
    expect(JSON.stringify(run())).toBe(JSON.stringify(run()));
  });
  it('keys survive edits elsewhere in the text', () => {
    const a = spoken('Intro.\n\nOne  two.', [], DEFAULT_SETTINGS);
    const b = spoken('A much longer introduction here.\n\nOne  two.', [], DEFAULT_SETTINGS);
    expect(a[0]?.key).toBe(b[0]?.key);
    expect(a[0]?.start).not.toBe(b[0]?.start);
  });
  it('the sample triggers every audit', () => {
    expect(new Set(rules(grounding(SAMPLE_TEXT, SAMPLE_CLAIMS).findings))).toEqual(
      new Set(['G1', 'G3', 'G4']),
    );
    expect(new Set(rules(narrative(SAMPLE_TEXT)))).toEqual(new Set(['N2', 'N3', 'N5', 'N6']));
    expect(new Set(rules(spoken(SAMPLE_TEXT, SAMPLE_GLOSSARY, DEFAULT_SETTINGS)))).toEqual(
      new Set(['S1', 'S2', 'S3', 'S4', 'S5']),
    );
    expect(new Set(rules(packaging(SAMPLE_TITLE, SAMPLE_TEXT, SAMPLE_CLAIMS)))).toEqual(
      new Set(['P2', 'P3']),
    );
  });
});
