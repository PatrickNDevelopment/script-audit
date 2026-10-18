/**
 * Text model (docs/spec/00-document-and-revisions.md): normalisation, the same-length spoken mask,
 * structure (sections and beats), sentences, words and the duration estimate.
 */

export interface Range {
  start: number;
  end: number;
}

export interface Word extends Range {
  text: string;
  lower: string;
}

export interface Sentence extends Range {
  beat: number;
  section: number;
  /** End including claim tags that directly follow the terminator. */
  tagEnd: number;
}

export interface Beat extends Range {
  section: number;
}

export interface Section extends Range {
  heading: string;
  index: number;
}

export interface Analysis {
  text: string;
  masked: string;
  sections: Section[];
  beats: Beat[];
  sentences: Sentence[];
  words: Word[];
}

export const ID_RE = /^[a-z0-9][a-z0-9-]{0,23}$/;
export const CLAIM_TAG_RE = /\[c:([^\]\n]{0,200})\]/gi;
export const STORY_TAG_RE = /\{(setup|payoff):([a-z0-9][a-z0-9-]{0,23})\}/gi;
export const WORD_RE = /[\p{L}\p{N}]+(?:['’-][\p{L}\p{N}]+|(?<=\p{N})[.,]\p{N}+)*/gu;

/** CRLF/CR to LF and a leading BOM removed; nothing else changes. */
export function normalizeText(raw: string): string {
  const s = raw.charCodeAt(0) === 0xfeff ? raw.slice(1) : raw;
  return s.replace(/\r\n?/g, '\n');
}

/** Splits an imported Markdown document into title (a first `# ` line) and body. */
export function splitTitle(raw: string): { title: string; text: string } {
  const text = normalizeText(raw);
  const m = /^[ \t]*\n*# +([^\n]*)\n?/.exec(text);
  if (m && !text.startsWith('##')) {
    return { title: (m[1] ?? '').trim(), text: text.slice(m[0].length).replace(/^\n+/, '') };
  }
  return { title: '', text };
}

function blank(s: string): string {
  return ' '.repeat(s.length);
}

/** Same-length copy with markup, tags and link targets replaced by spaces. */
export function mask(text: string): string {
  let m = text;
  // Heading lines are structure, not narration.
  m = m.replace(/^#{1,6}[ \t][^\n]*$/gm, blank);
  m = m.replace(CLAIM_TAG_RE, blank);
  m = m.replace(STORY_TAG_RE, blank);
  m = m.replace(
    /\[([^\]\n]*)\]\(([^)\s]*)\)/g,
    (all, label: string) => ` ${label}${blank(all.slice(label.length + 1))}`,
  );
  m = m.replace(/^([ \t]*)(>|[-*+]|\d{1,3}\.)(?=[ \t])/gm, (all) => blank(all));
  m = m.replace(/[*_`]/g, ' ');
  return m;
}

export function isBlankLine(line: string): boolean {
  return line.trim() === '';
}

const ABBREVIATIONS = new Set([
  'mr',
  'mrs',
  'ms',
  'dr',
  'st',
  'vs',
  'etc',
  'e.g',
  'i.e',
  'u.s',
  'u.k',
  'no',
  'approx',
  'jan',
  'feb',
  'mar',
  'apr',
  'jun',
  'jul',
  'aug',
  'sep',
  'sept',
  'oct',
  'nov',
  'dec',
]);
const TERMINATOR = /[.!?…]+["'”’)\]]*(?=\s|$)/g;

function isAbbreviation(before: string, term: string): boolean {
  if (term !== '.') return false;
  const m = /([A-Za-z][A-Za-z.]*)$/.exec(before);
  if (!m) return false;
  const tok = (m[1] ?? '').toLowerCase();
  if (ABBREVIATIONS.has(tok)) return true;
  return /^[A-Z]$/.test(m[1] ?? '');
}

function trimRange(masked: string, start: number, end: number): Range | null {
  let s = start;
  let e = end;
  while (s < e && /\s/.test(masked[s] as string)) s += 1;
  while (e > s && /\s/.test(masked[e - 1] as string)) e -= 1;
  return s < e ? { start: s, end: e } : null;
}

export function analyze(text: string): Analysis {
  const masked = mask(text);
  const sections: Section[] = [];
  const beats: Beat[] = [];
  // Lines with offsets.
  const lines: { start: number; end: number; raw: string }[] = [];
  let pos = 0;
  for (const raw of text.split('\n')) {
    lines.push({ start: pos, end: pos + raw.length, raw });
    pos += raw.length + 1;
  }
  let current: Section = { start: 0, end: text.length, heading: 'Opening', index: 0 };
  sections.push(current);
  let beatStart = -1;
  let beatEnd = -1;
  const closeBeat = () => {
    if (beatStart >= 0) beats.push({ start: beatStart, end: beatEnd, section: current.index });
    beatStart = -1;
  };
  for (const ln of lines) {
    const h = /^##[ \t]+(.*)$/.exec(ln.raw);
    if (h && !/^###/.test(ln.raw)) {
      closeBeat();
      current.end = ln.start;
      current = {
        start: ln.start,
        end: text.length,
        heading: (h[1] ?? '').trim() || 'Untitled section',
        index: sections.length,
      };
      sections.push(current);
      continue;
    }
    if (isBlankLine(ln.raw) || /^#{1,6}[ \t]/.test(ln.raw)) {
      closeBeat();
      continue;
    }
    if (beatStart < 0) beatStart = ln.start;
    beatEnd = ln.end;
  }
  closeBeat();
  // Drop an empty "Opening" when the script starts with a section heading.
  const first = sections[0] as Section;
  if (
    sections.length > 1 &&
    !beats.some((b) => b.section === 0) &&
    masked.slice(first.start, first.end).trim() === ''
  ) {
    sections.shift();
    sections.forEach((s, i) => (s.index = i));
    beats.forEach((b) => (b.section -= 1));
  }

  const sentences: Sentence[] = [];
  beats.forEach((b, bi) => {
    const seg = masked.slice(b.start, b.end);
    let from = 0;
    TERMINATOR.lastIndex = 0;
    let m: RegExpExecArray | null;
    const pushSentence = (a: number, z: number) => {
      const r = trimRange(masked, b.start + a, b.start + z);
      if (!r) return;
      // Claim tags directly after the terminator belong to this sentence.
      let tagEnd = r.end;
      for (;;) {
        const rest = text.slice(tagEnd, b.end);
        const t = /^[ \t]*\[c:[^\]\n]{0,200}\]/i.exec(rest);
        if (!t) break;
        tagEnd += t[0].length;
      }
      sentences.push({ ...r, tagEnd, beat: bi, section: b.section });
    };
    while ((m = TERMINATOR.exec(seg)) !== null) {
      const term = m[0].replace(/["'”’)\]]+$/, '');
      if (isAbbreviation(seg.slice(0, m.index), term)) continue;
      pushSentence(from, m.index + m[0].length);
      from = m.index + m[0].length;
    }
    pushSentence(from, seg.length);
  });

  const words: Word[] = [];
  for (const w of masked.matchAll(WORD_RE)) {
    const start = w.index ?? 0;
    words.push({ start, end: start + w[0].length, text: w[0], lower: w[0].toLowerCase() });
  }
  return { text, masked, sections, beats, sentences, words };
}

export function wordsIn(a: Analysis, r: Range): Word[] {
  return a.words.filter((w) => w.start >= r.start && w.end <= r.end);
}

export function countWords(masked: string): number {
  return [...masked.matchAll(WORD_RE)].length;
}

export interface DurationPart {
  heading: string;
  words: number;
  seconds: number;
}

/** Estimated narration time (spec 00 "Duration estimate"). */
export function duration(
  a: Analysis,
  wpm: number,
): { words: number; seconds: number; sections: DurationPart[] } {
  const speed = Math.min(220, Math.max(100, wpm));
  const parts: DurationPart[] = a.sections.map((s) => {
    const beats = a.beats.filter((b) => b.section === s.index);
    let words = 0;
    let pauses = 0;
    for (const b of beats) {
      const seg = a.masked.slice(b.start, b.end);
      words += countWords(seg);
      pauses += (seg.match(/[,;:]/g)?.length ?? 0) * 0.25;
      pauses += (seg.match(/—|–| - /g)?.length ?? 0) * 0.3;
    }
    for (const se of a.sentences.filter((x) => x.section === s.index)) {
      pauses += /(…|\.\.\.)["'”’)\]]*$/.test(a.masked.slice(se.start, se.end)) ? 0.7 : 0.5;
    }
    pauses += Math.max(0, beats.length - 1) * 0.8;
    return { heading: s.heading, words, seconds: (words / speed) * 60 + pauses };
  });
  const sectionBreaks = Math.max(0, parts.filter((p) => p.words > 0).length - 1) * 1.2;
  return {
    words: parts.reduce((t, p) => t + p.words, 0),
    seconds: parts.reduce((t, p) => t + p.seconds, 0) + sectionBreaks,
    sections: parts,
  };
}

export function formatDuration(seconds: number): string {
  const s = Math.round(seconds);
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
}

export const STOPWORDS = new Set(
  (
    'a about above after again against all also am an and any are as at be because been before being below between both but by ' +
    'can could did do does doing down during each few for from further had has have having he her here hers herself him himself ' +
    'his how i if in into is it its itself just me more most my myself no nor not now of off on once only or other our ours ' +
    'ourselves out over own same she should so some such than that the their theirs them themselves then there these they this ' +
    'those through to too under until up very was we were what when where which while who whom why will with would you your ' +
    "yours yourself yourselves it's that's there's here's what's don't didn't isn't wasn't can't won't i'm you're we're they're " +
    'one two three us let get got go going like really thing things way well even still much many'
  ).split(/\s+/),
);

export function isContent(lower: string, minLen = 3): boolean {
  const w = lower.replace(/’/g, "'");
  return w.length >= minLen && !STOPWORDS.has(w) && !/^\d/.test(w);
}

export function stem(lower: string): string {
  const w = lower.replace(/’/g, "'").replace(/'s$/, '');
  if (w.length > 5 && w.endsWith('ing')) return w.slice(0, -3);
  if (w.length > 4 && w.endsWith('ed')) return w.slice(0, -2);
  if (w.length > 4 && /(s|x|z|ch|sh)es$/.test(w)) return w.slice(0, -2);
  if (w.length > 3 && w.endsWith('s') && !w.endsWith('ss')) return w.slice(0, -1);
  return w;
}
