/**
 * The four independent audits (docs/spec/01-audits.md). Each is a pure function of its inputs; none
 * reads another audit's output.
 */
import {
  ATTRIBUTIONS,
  CONJUNCTIONS,
  EXAMPLE_CUES,
  NUMBER_WORDS,
  RULES,
  SENSATIONAL,
  SUPERLATIVES,
  TRANSITIONS,
} from './rules';
import {
  analyze,
  CLAIM_TAG_RE,
  ID_RE,
  isContent,
  stem,
  STORY_TAG_RE,
  wordsIn,
  type Analysis,
  type Range,
  type Sentence,
  type Word,
} from './text';
import type { AuditId, Claim, Finding, GlossaryEntry, Settings } from './types';

type Draft = Omit<Finding, 'key' | 'audit'>;

/** Assigns `rule|excerpt|k` keys in order. */
function finalize(audit: AuditId, drafts: Draft[]): Finding[] {
  const seen = new Map<string, number>();
  return drafts.map((d) => {
    const base = `${d.rule}|${d.excerpt}`;
    const k = seen.get(base) ?? 0;
    seen.set(base, k + 1);
    return { ...d, audit, key: `${base}|${k}` };
  });
}

function draft(
  a: Analysis,
  rule: string,
  r: Range,
  message: string,
  extra: Partial<Draft> = {},
): Draft {
  return {
    rule,
    target: 'text',
    start: r.start,
    end: r.end,
    excerpt: a.text.slice(r.start, r.end),
    message,
    triggers: [],
    fix: null,
    ...extra,
  };
}

function hasPhrase(lower: string, phrase: string): boolean {
  const esc = phrase.replace(/[.*+?^${}()|[\]\\]/g, '\\$&').replace(/'/g, "['’]");
  return new RegExp(`(^|[^\\p{L}\\p{N}])${esc}(?=$|[^\\p{L}\\p{N}])`, 'u').test(lower);
}

export const NUMBER_RE = /\d+(?:[.,]\d+)*%?/g;

export function numbersIn(s: string): string[] {
  return [...s.matchAll(NUMBER_RE)].map((m) => m[0].replace(/,/g, '').replace(/%$/, ''));
}

// ---------------------------------------------------------------------------------------------
// 1. Grounding

export function assertionTriggers(maskedSentence: string): string[] {
  const lower = maskedSentence.toLowerCase();
  const out: string[] = [];
  for (const m of maskedSentence.matchAll(NUMBER_RE)) out.push(m[0]);
  for (const w of NUMBER_WORDS) if (hasPhrase(lower, w)) out.push(w);
  for (const w of SUPERLATIVES) if (hasPhrase(lower, w)) out.push(w);
  for (const w of ATTRIBUTIONS) if (hasPhrase(lower, w)) out.push(w);
  return [...new Set(out)];
}

export function claimIdsIn(raw: string): string[] {
  const out: string[] = [];
  for (const m of raw.matchAll(CLAIM_TAG_RE)) {
    for (const part of (m[1] ?? '').split(',')) {
      const id = part.trim().toLowerCase();
      if (id) out.push(id);
    }
  }
  return out;
}

export function isSupported(c: Claim): boolean {
  return c.sources.some((s) => s.citation.trim() !== '' && s.quote.trim() !== '');
}

export interface GroundingResult {
  findings: Finding[];
  assertions: number;
  covered: number;
  /** Sentence ranges that are covered (used by the packaging audit through its own inputs). */
  coveredRanges: Range[];
}

export function grounding(text: string, claims: readonly Claim[]): GroundingResult {
  const a = analyze(text);
  const byId = new Map(claims.map((c) => [c.id, c]));
  const out: Draft[] = [];
  let assertions = 0;
  const coveredRanges: Range[] = [];
  for (const s of a.sentences) {
    const triggers = assertionTriggers(a.masked.slice(s.start, s.end));
    if (triggers.length === 0) continue;
    assertions += 1;
    const ids = claimIdsIn(text.slice(s.start, s.tagEnd));
    if (ids.length === 0) {
      out.push(
        draft(a, 'G1', s, `Assertion without a claim link (${triggers.join(', ')}).`, { triggers }),
      );
      continue;
    }
    const unknown = ids.filter((id) => !ID_RE.test(id) || !byId.has(id));
    if (unknown.length) {
      out.push(
        draft(a, 'G2', s, `Unknown claim id: ${unknown.join(', ')}.`, { triggers: unknown }),
      );
      continue;
    }
    const supported = ids.map((id) => byId.get(id) as Claim).filter(isSupported);
    if (supported.length === 0) {
      out.push(
        draft(a, 'G3', s, `Claim ${ids.join(', ')} has no source with a citation and a quote.`, {
          triggers: ids,
        }),
      );
      continue;
    }
    // Demonstrable coverage: the claim must contain the sentence's checkable specifics (numbers,
    // superlatives and number words), not merely exist.
    const claimText = supported.flatMap((c) => [c.statement, ...c.sources.map((x) => x.quote)]);
    const known = new Set(claimText.flatMap(numbersIn));
    const knownLower = claimText.join('\n').toLowerCase();
    const sentenceLower = a.masked.slice(s.start, s.end).toLowerCase();
    const missing = [
      ...numbersIn(a.masked.slice(s.start, s.end)).filter((n) => !known.has(n)),
      ...[...SUPERLATIVES, ...NUMBER_WORDS].filter(
        (w) => hasPhrase(sentenceLower, w) && !hasPhrase(knownLower, w),
      ),
    ];
    if (missing.length) {
      out.push(
        draft(a, 'G4', s, `Not in the linked claim: ${[...new Set(missing)].join(', ')}.`, {
          triggers: missing,
        }),
      );
      continue;
    }
    coveredRanges.push({ start: s.start, end: s.end });
  }
  return {
    findings: finalize('grounding', out),
    assertions,
    covered: coveredRanges.length,
    coveredRanges,
  };
}

// ---------------------------------------------------------------------------------------------
// 2. Narrative

function sentenceWords(a: Analysis, s: Sentence): Word[] {
  return wordsIn(a, s);
}

function hasEngagement(a: Analysis, s: Sentence): boolean {
  const raw = a.masked.slice(s.start, s.end);
  const lower = raw.toLowerCase();
  if (raw.includes('?') || /["“”]/.test(raw)) return true;
  if (/(^|[^\p{L}])(you|your|you're|you’re|yours)(?=$|[^\p{L}])/u.test(lower)) return true;
  return EXAMPLE_CUES.some((c) => hasPhrase(lower, c));
}

export function narrative(text: string): Finding[] {
  const a = analyze(text);
  const out: Draft[] = [];

  // N1 repeated 4-word phrases within sentences.
  const grams = new Map<string, Range[]>();
  for (const s of a.sentences) {
    const ws = sentenceWords(a, s);
    for (let i = 0; i + 4 <= ws.length; i += 1) {
      const g = ws.slice(i, i + 4);
      if (!g.some((w) => isContent(w.lower))) continue;
      const k = g.map((w) => w.lower.replace(/’/g, "'")).join(' ');
      const list = grams.get(k) ?? [];
      list.push({ start: (g[0] as Word).start, end: (g[3] as Word).end });
      grams.set(k, list);
    }
  }
  // Third and later uses; overlapping repeated grams merge into one phrase.
  const hits: { r: Range; count: number }[] = [];
  for (const list of grams.values()) {
    if (list.length < 3) continue;
    for (const r of list.slice(2)) hits.push({ r, count: list.length });
  }
  hits.sort((x, y) => x.r.start - y.r.start);
  const merged: { r: Range; count: number }[] = [];
  for (const h of hits) {
    const last = merged[merged.length - 1];
    if (last && h.r.start < last.r.end) {
      last.r = { start: last.r.start, end: Math.max(last.r.end, h.r.end) };
      last.count = Math.max(last.count, h.count);
    } else merged.push({ r: { ...h.r }, count: h.count });
  }
  for (const m of merged) {
    const phrase = a.masked.slice(m.r.start, m.r.end).replace(/\s+/g, ' ').toLowerCase();
    out.push(
      draft(
        a,
        'N1',
        m.r,
        `"${phrase}" is repeated (a four-word part of it appears ${m.count} times).`,
        { triggers: [phrase] },
      ),
    );
  }

  // N2 consecutive sentences in a beat with the same first two words.
  for (let i = 1; i < a.sentences.length; i += 1) {
    const prev = a.sentences[i - 1] as Sentence;
    const cur = a.sentences[i] as Sentence;
    if (prev.beat !== cur.beat) continue;
    const pw = sentenceWords(a, prev);
    const cw = sentenceWords(a, cur);
    if (pw.length < 2 || cw.length < 2) continue;
    const p2 = `${(pw[0] as Word).lower} ${(pw[1] as Word).lower}`;
    const c2 = `${(cw[0] as Word).lower} ${(cw[1] as Word).lower}`;
    if (p2 === c2)
      out.push(
        draft(
          a,
          'N2',
          { start: (cw[0] as Word).start, end: (cw[1] as Word).end },
          `Two sentences in a row start with "${c2}".`,
          { triggers: [c2] },
        ),
      );
  }

  // N3 / N4 setups and payoffs.
  const tags = [...text.matchAll(STORY_TAG_RE)].map((m) => ({
    kind: (m[1] ?? '').toLowerCase(),
    key: (m[2] ?? '').toLowerCase(),
    start: m.index ?? 0,
    end: (m.index ?? 0) + m[0].length,
  }));
  for (const t of tags) {
    if (
      t.kind === 'setup' &&
      !tags.some((u) => u.kind === 'payoff' && u.key === t.key && u.start > t.start)
    ) {
      out.push(draft(a, 'N3', t, `Setup "${t.key}" is never paid off.`, { triggers: [t.key] }));
    }
    if (
      t.kind === 'payoff' &&
      !tags.some((u) => u.kind === 'setup' && u.key === t.key && u.start < t.start)
    ) {
      out.push(draft(a, 'N4', t, `Payoff "${t.key}" has no earlier setup.`, { triggers: [t.key] }));
    }
  }

  // N5 long exposition runs (reset at engagement cues and section starts).
  let run: Sentence[] = [];
  let runWords = 0;
  const flush = () => {
    if (runWords > 120 && run.length) {
      const r = { start: (run[0] as Sentence).start, end: (run[run.length - 1] as Sentence).end };
      out.push(
        draft(
          a,
          'N5',
          r,
          `${runWords} spoken words without a question, quote, "you" or an example.`,
        ),
      );
    }
    run = [];
    runWords = 0;
  };
  a.sentences.forEach((s, i) => {
    const prev = a.sentences[i - 1];
    if (prev && prev.section !== s.section) flush();
    if (hasEngagement(a, s)) {
      flush();
      return;
    }
    run.push(s);
    runWords += sentenceWords(a, s).length;
  });
  flush();

  // N6 abrupt transitions between sections.
  for (const sec of a.sections) {
    if (sec.index === 0) continue;
    const first = a.sentences.find((s) => s.section === sec.index);
    const prevBeats = a.beats.filter((b) => b.section === sec.index - 1);
    const lastBeat = prevBeats[prevBeats.length - 1];
    if (!first || !lastBeat) continue;
    const lower = a.masked.slice(first.start, first.end).toLowerCase();
    if (lower.includes('?') || TRANSITIONS.some((t) => hasPhrase(lower, t))) continue;
    const before = new Set(
      wordsIn(a, lastBeat)
        .filter((w) => isContent(w.lower))
        .map((w) => stem(w.lower)),
    );
    const shared = sentenceWords(a, first).some(
      (w) => isContent(w.lower) && before.has(stem(w.lower)),
    );
    if (!shared)
      out.push(
        draft(
          a,
          'N6',
          first,
          `"${sec.heading}" starts without a transition from the previous section.`,
        ),
      );
  }
  out.sort((x, y) => x.start - y.start || x.rule.localeCompare(y.rule));
  return finalize('narrative', out);
}

// ---------------------------------------------------------------------------------------------
// 3. Spoken language

function capitalizeFirst(s: string): string {
  const m = /\p{L}/u.exec(s);
  if (!m || m.index === undefined) return s;
  return s.slice(0, m.index) + s.charAt(m.index).toUpperCase() + s.slice(m.index + 1);
}

/** S1 split: a separator near the middle word, with at least 4 words on each side. */
function splitFix(a: Analysis, s: Sentence): string | null {
  const raw = a.text.slice(s.start, s.end);
  const ws = sentenceWords(a, s);
  const seps = [/, and /g, /, but /g, /, so /g, /; /g, / — /g];
  let best: { at: number; len: number; keep: string; dist: number } | null = null;
  for (const re of seps) {
    for (const m of raw.matchAll(re)) {
      const at = m.index ?? 0;
      // The separator must be real text, not inside a masked tag.
      if (a.masked.slice(s.start + at, s.start + at + m[0].length) !== m[0]) continue;
      const before = ws.filter((w) => w.end <= s.start + at).length;
      const after = ws.length - before;
      if (before < 4 || after < 4) continue;
      const word = m[0].replace(/[,;—]/g, '').trim();
      const dist = Math.abs(before - ws.length / 2);
      if (!best || dist < best.dist) best = { at, len: m[0].length, keep: word, dist };
    }
  }
  if (!best) return null;
  const head = raw.slice(0, best.at).replace(/\s+$/, '');
  const tail = raw.slice(best.at + best.len);
  const next = best.keep ? `${capitalizeFirst(best.keep)} ${tail}` : capitalizeFirst(tail);
  return `${head}. ${next}`;
}

export function spoken(
  text: string,
  glossary: readonly GlossaryEntry[],
  settings: Settings,
): Finding[] {
  const a = analyze(text);
  const out: Draft[] = [];
  const maxWords = Math.min(60, Math.max(12, Math.round(settings.maxWords)));

  for (const s of a.sentences) {
    const ws = sentenceWords(a, s);
    // S1
    if (ws.length > maxWords) {
      const fix = splitFix(a, s);
      out.push(
        draft(a, 'S1', s, `${ws.length} words (limit ${maxWords}).`, {
          fix: fix
            ? {
                replacement: fix,
                note: 'Split into two sentences at the break nearest the middle.',
              }
            : null,
        }),
      );
    }
    // S3 runs without pause punctuation.
    const seg = a.masked.slice(s.start, s.end);
    const re = /[,;:—–…()]|\s-\s|[.!?]/g;
    let from = 0;
    const runs: Range[] = [];
    let m: RegExpExecArray | null;
    while ((m = re.exec(seg)) !== null) {
      runs.push({ start: s.start + from, end: s.start + m.index });
      from = m.index + m[0].length;
    }
    runs.push({ start: s.start + from, end: s.end });
    for (const r of runs) {
      const rw = ws.filter((w) => w.start >= r.start && w.end <= r.end);
      if (rw.length <= 18) continue;
      const range = { start: (rw[0] as Word).start, end: (rw[rw.length - 1] as Word).end };
      let best: { i: number; dist: number } | null = null;
      rw.forEach((w, i) => {
        if (i < 4 || rw.length - i < 4 || !CONJUNCTIONS.includes(w.lower)) return;
        const prev = rw[i - 1] as Word;
        // Only plain whitespace between the words, so the insertion is exact.
        if (!/^\s+$/.test(a.text.slice(prev.end, w.start))) return;
        const dist = Math.abs(i - rw.length / 2);
        if (!best || dist < best.dist) best = { i, dist };
      });
      let fix: Draft['fix'] = null;
      if (best) {
        const bi = (best as { i: number }).i;
        const prev = rw[bi - 1] as Word;
        const raw = a.text.slice(range.start, range.end);
        const cut = prev.end - range.start;
        fix = {
          replacement: `${raw.slice(0, cut)},${raw.slice(cut)}`,
          note: `Add a comma before "${(rw[bi] as Word).text}".`,
        };
      }
      out.push(draft(a, 'S3', range, `${rw.length} words without a pause.`, { fix }));
    }
  }

  // S2 repeated content words within 40 words (per section).
  for (const sec of a.sections) {
    const ws = a.words.filter(
      (w) => w.start >= sec.start && w.end <= sec.end && isContent(w.lower, 4),
    );
    const all = a.words.filter((w) => w.start >= sec.start && w.end <= sec.end);
    const idx = new Map(all.map((w, i) => [w.start, i]));
    const lastReport = new Map<string, number>();
    ws.forEach((w) => {
      const i = idx.get(w.start) as number;
      const same = ws.filter(
        (x) =>
          x.lower === w.lower &&
          (idx.get(x.start) as number) <= i &&
          (idx.get(x.start) as number) > i - 40,
      );
      if (same.length < 3) return;
      const last = lastReport.get(w.lower);
      if (last !== undefined && last > i - 40) return;
      lastReport.set(w.lower, i);
      out.push(
        draft(a, 'S2', w, `"${w.text}" is used ${same.length} times within 40 words.`, {
          triggers: [w.lower],
        }),
      );
    });
  }

  // S4 pronunciation.
  const known = new Set(glossary.map((g) => g.term.toLowerCase()));
  const reported = new Set<string>();
  for (const w of a.words) {
    const hard =
      /^[A-Z]{2,10}s?$/.test(w.text) ||
      (/\p{L}/u.test(w.text) && /\p{N}/u.test(w.text)) ||
      /[^A-Za-z]/.test(w.text.replace(/[\p{N}'’-]/gu, ''));
    const base = w.lower.replace(/['’]s$/, '');
    if (!hard || known.has(w.lower) || known.has(base) || reported.has(base)) continue;
    reported.add(base);
    out.push(
      draft(a, 'S4', w, `How should "${w.text}" be said? Add it to the glossary.`, {
        triggers: [w.text],
      }),
    );
  }

  // S5 double spaces between words.
  for (const m of text.matchAll(/(?<=\S) {2,}(?=\S)/g)) {
    const start = m.index ?? 0;
    out.push(
      draft(a, 'S5', { start, end: start + m[0].length }, 'Double space.', {
        fix: { replacement: ' ', note: 'Replace with one space.' },
      }),
    );
  }
  out.sort((x, y) => x.start - y.start || x.rule.localeCompare(y.rule));
  return finalize('spoken', out);
}

// ---------------------------------------------------------------------------------------------
// 4. Packaging

export function hookRange(a: Analysis): Range | null {
  const spokenWords = a.words.filter((w) => a.masked.slice(w.start, w.end) === w.text);
  if (spokenWords.length === 0) return null;
  const last = spokenWords[Math.min(59, spokenWords.length - 1)] as Word;
  return { start: (spokenWords[0] as Word).start, end: last.end };
}

function matchCase(original: string, neutral: string): string {
  return /^\p{Lu}/u.test(original) ? neutral.charAt(0).toUpperCase() + neutral.slice(1) : neutral;
}

export function packaging(title: string, text: string, claims: readonly Claim[]): Finding[] {
  const a = analyze(text);
  const out: Draft[] = [];
  const titleDraft = (rule: string, message: string, extra: Partial<Draft> = {}): Draft => ({
    rule,
    target: 'title',
    start: 0,
    end: title.length,
    excerpt: title,
    message,
    triggers: [],
    fix: null,
    ...extra,
  });
  const hook = hookRange(a);
  const hookLower = hook ? a.masked.slice(hook.start, hook.end).toLowerCase() : '';

  // P4
  if (title.trim() === '') out.push(titleDraft('P4', 'The script has no title.'));
  else if (title.length > 70)
    out.push(titleDraft('P4', `The title has ${title.length} characters (over 70).`));

  // P1
  const titleWords = [...title.matchAll(/[\p{L}\p{N}]+(?:['’-][\p{L}\p{N}]+)*/gu)]
    .map((m) => m[0].toLowerCase())
    .filter((w) => isContent(w));
  if (titleWords.length && hook) {
    const hookStems = new Set(
      a.words.filter((w) => w.start >= hook.start && w.end <= hook.end).map((w) => stem(w.lower)),
    );
    if (!titleWords.some((w) => hookStems.has(stem(w)))) {
      out.push(
        titleDraft(
          'P1',
          `None of the title's words (${titleWords.join(', ')}) appear in the first 60 spoken words.`,
          { triggers: titleWords },
        ),
      );
    }
  }

  // P2 in the title and in the hook.
  const titleLower = title.toLowerCase();
  for (const s of SENSATIONAL) {
    if (hasPhrase(titleLower, s.phrase)) {
      let fix: Draft['fix'] = null;
      if (s.neutral) {
        const re = new RegExp(s.phrase.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i');
        const m = re.exec(title);
        if (m)
          fix = {
            replacement:
              title.slice(0, m.index) +
              matchCase(m[0], s.neutral) +
              title.slice(m.index + m[0].length),
            note: `"${m[0]}" → "${matchCase(m[0], s.neutral)}"`,
          };
      }
      out.push(
        titleDraft('P2', `Sensational phrase in the title: "${s.phrase}".`, {
          triggers: [s.phrase],
          fix,
        }),
      );
    }
    if (hook && hasPhrase(hookLower, s.phrase)) {
      const re = new RegExp(
        `(^|[^\\p{L}\\p{N}])(${s.phrase.replace(/[.*+?^${}()|[\]\\]/g, '\\$&').replace(/'/g, "['’]")})(?=$|[^\\p{L}\\p{N}])`,
        'giu',
      );
      for (const m of a.masked.slice(hook.start, hook.end).matchAll(re)) {
        const start = hook.start + (m.index ?? 0) + (m[1] ?? '').length;
        const found = m[2] ?? '';
        const r = { start, end: start + found.length };
        out.push(
          draft(a, 'P2', r, `Sensational phrase in the hook: "${s.phrase}".`, {
            triggers: [s.phrase],
            fix: s.neutral
              ? {
                  replacement: matchCase(a.text.slice(r.start, r.end), s.neutral),
                  note: `Use "${s.neutral}" instead.`,
                }
              : null,
          }),
        );
      }
    }
  }

  // P3 title numbers and superlatives must appear in a covered sentence.
  const g = grounding(text, claims);
  const coveredText = g.coveredRanges
    .map((r) => a.masked.slice(r.start, r.end).toLowerCase())
    .join('\n');
  const coveredNumbers = new Set(numbersIn(coveredText));
  const missing = [
    ...numbersIn(title).filter((n) => !coveredNumbers.has(n)),
    ...SUPERLATIVES.filter((w) => hasPhrase(titleLower, w) && !hasPhrase(coveredText, w)),
  ];
  if (missing.length)
    out.push(
      titleDraft('P3', `Not backed by a covered sentence: ${[...new Set(missing)].join(', ')}.`, {
        triggers: missing,
      }),
    );

  out.sort(
    (x, y) =>
      (x.target === y.target ? x.start - y.start : x.target === 'title' ? -1 : 1) ||
      x.rule.localeCompare(y.rule),
  );
  return finalize('packaging', out);
}

export function ruleName(rule: string): string {
  return RULES[rule]?.name ?? rule;
}
