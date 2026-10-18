import { describe, expect, it } from 'vitest';
import {
  analyze,
  countWords,
  duration,
  formatDuration,
  mask,
  normalizeText,
  splitTitle,
} from '../src/engine';

const sentencesOf = (t: string) => {
  const a = analyze(t);
  return a.sentences.map((s) => t.slice(s.start, s.end));
};

describe('normalisation and title', () => {
  it('normalises line endings and a BOM, nothing else', () => {
    expect(normalizeText(`${String.fromCharCode(0xfeff)}a\r\nb\rc\n  d  `)).toBe('a\nb\nc\n  d  ');
  });
  it('takes a first "# " line as the title', () => {
    expect(splitTitle('# My title \n\nBody text.')).toEqual({
      title: 'My title',
      text: 'Body text.',
    });
    expect(splitTitle('## Section\nBody.')).toEqual({ title: '', text: '## Section\nBody.' });
    expect(splitTitle('No title here.')).toEqual({ title: '', text: 'No title here.' });
  });
});

describe('mask', () => {
  it('keeps the length and blanks tags, markup and link targets', () => {
    const t = '## Head\nSee **this** [link](https://x.y) now [c:a1] {setup:k}.\n> quote\n- item';
    const m = mask(t);
    expect(m).toHaveLength(t.length);
    expect(m).not.toContain('Head');
    expect(m).not.toContain('https');
    expect(m).not.toContain('c:a1');
    expect(m).not.toContain('setup');
    expect(m).toContain('this');
    expect(m).toContain('link');
    expect(m).toContain('quote');
    expect(m).toContain('item');
  });
});

describe('sentences', () => {
  it('splits on terminators but not after abbreviations, initials or inside numbers', () => {
    expect(
      sentencesOf('Dr. Smith paid 3.5 dollars. J. R. Tolkien wrote e.g. books. Done!'),
    ).toEqual(['Dr. Smith paid 3.5 dollars.', 'J. R. Tolkien wrote e.g. books.', 'Done!']);
  });
  it('handles closing quotes, unicode ellipsis and question marks', () => {
    expect(sentencesOf('He said “stop.” Then… nothing? Yes.')).toEqual([
      'He said “stop.”',
      'Then…',
      'nothing?',
      'Yes.',
    ]);
  });
  it('a beat end always ends a sentence', () => {
    expect(sentencesOf('No full stop here\n\nNext beat.')).toEqual([
      'No full stop here',
      'Next beat.',
    ]);
  });
  it('attaches claim tags that follow the terminator to the sentence', () => {
    const t = 'It rose 5 percent. [c:a] It fell.';
    const a = analyze(t);
    expect(t.slice(a.sentences[0]?.start, a.sentences[0]?.tagEnd)).toBe('It rose 5 percent. [c:a]');
    expect(t.slice(a.sentences[1]?.start, a.sentences[1]?.end)).toBe('It fell.');
  });
});

describe('structure', () => {
  it('maps sections and beats', () => {
    const t = 'Intro line.\n\n## One\nFirst beat.\nStill first.\n\nSecond beat.\n\n## Two\nLast.';
    const a = analyze(t);
    expect(a.sections.map((s) => s.heading)).toEqual(['Opening', 'One', 'Two']);
    expect(a.beats.map((b) => [b.section, t.slice(b.start, b.end)])).toEqual([
      [0, 'Intro line.'],
      [1, 'First beat.\nStill first.'],
      [1, 'Second beat.'],
      [2, 'Last.'],
    ]);
  });
  it('drops an empty Opening when the script starts with a section', () => {
    expect(analyze('## Only\nText.').sections.map((s) => s.heading)).toEqual(['Only']);
  });
  it('handles an empty script', () => {
    const a = analyze('');
    expect(a.beats).toEqual([]);
    expect(a.sentences).toEqual([]);
    expect(duration(a, 150)).toMatchObject({ words: 0, seconds: 0 });
  });
});

describe('words and duration', () => {
  it('counts words with apostrophes, hyphens and numbers; ignores markup', () => {
    expect(countWords(mask("It's a well-known 3.5% rise, 1,000 times [c:x1] **bold**."))).toBe(8);
  });
  it('estimates duration from words, speed and pauses', () => {
    // 10 words at 150 wpm = 4 s; one comma 0.25; two sentence ends 1.0; one beat break 0.8.
    const t = 'One two three, four five.\n\nSix seven eight nine ten.';
    const d = duration(analyze(t), 150);
    expect(d.words).toBe(10);
    expect(d.seconds).toBeCloseTo(4 + 0.25 + 1 + 0.8, 9);
    // Speed is clamped to 100..220.
    expect(duration(analyze(t), 10).seconds).toBeCloseTo(6 + 2.05, 9);
    expect(formatDuration(125.4)).toBe('2:05');
  });
});
