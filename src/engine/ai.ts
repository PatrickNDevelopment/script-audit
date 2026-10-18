/**
 * Client side of the optional AI explanations (docs/spec/02-ai-broker-and-api.md). The backend
 * validates the provider's answer; the browser validates the backend's answer again, because both
 * are untrusted, and turns kept rewrites into ordinary suggestions.
 */
import { z } from 'zod';
import { numbersIn } from './audits';
import { ATTRIBUTIONS, NUMBER_WORDS, SUPERLATIVES } from './rules';
import type { Finding, Suggestion } from './types';

export const MAX_AI_FINDINGS = 8;

export interface ExplainRequest {
  title: string;
  findings: {
    key: string;
    audit: string;
    rule: string;
    message: string;
    excerpt: string;
    sentence: string;
  }[];
}

const rec = z
  .object({
    findingKey: z.string().max(4000),
    explanation: z.string().min(1).max(600),
    rewrite: z
      .object({ original: z.string().max(5000), replacement: z.string().max(20000) })
      .strict()
      .optional(),
  })
  .strict();

const response = z
  .object({
    recommendations: z.array(rec).max(MAX_AI_FINDINGS),
    meta: z
      .object({
        provider: z.string(),
        model: z.string(),
        promptVersion: z.string(),
        dropped: z.number().int().min(0),
        cached: z.boolean(),
      })
      .strict(),
  })
  .strict();

export type ExplainResponse = z.infer<typeof response>;

export interface Recommendation {
  findingKey: string;
  explanation: string;
  suggestion: Suggestion | null;
  rewriteDropped: string | null;
}

function hasControl(s: string): boolean {
  for (let i = 0; i < s.length; i += 1) {
    const c = s.charCodeAt(i);
    if (c < 0x20 && c !== 0x0a && c !== 0x09 && c !== 0x0d) return true;
  }
  return false;
}

/** Spelled-out numbers a rewrite may not introduce ("one" is too common to count). */
export const SPELLED_NUMBERS = [
  ...NUMBER_WORDS,
  'two',
  'three',
  'four',
  'five',
  'six',
  'seven',
  'eight',
  'nine',
  'ten',
  'eleven',
  'twelve',
  'thirteen',
  'fourteen',
  'fifteen',
  'sixteen',
  'seventeen',
  'eighteen',
  'nineteen',
  'twenty',
  'thirty',
  'forty',
  'fifty',
  'sixty',
  'seventy',
  'eighty',
  'ninety',
  'hundred',
  'hundreds',
  'dozen',
  'dozens',
  'trillion',
  'trillions',
  'quarter',
];
/** Quotation marks a rewrite may not introduce (’ is left out: it is the usual apostrophe). */
export const QUOTE_MARKS = ['"', '“', '”', '‘', '«', '»', '„', '‚', '‹', '›', '「', '」'];
const LINK_RE =
  /https?:\/\/|www\.|mailto:|\]\(|\b[a-z0-9-]+\.(?:com|org|net|io|gov|edu|info|co)\b/i;
/** A straight single quote that opens a quotation (after a space or bracket, before a letter). */
const OPENING_SINGLE_RE = /(^|[\s([])'(?=\p{L})/u;
/** "the tallest", "its greatest": a superlative the fixed list does not name. */
const SUPERLATIVE_EST_RE =
  /(?:^|[^\p{L}])(?:the|its|their|our|his|her|my|your)\s+(\p{L}+est)(?=$|[^\p{L}])/giu;

function estSuperlatives(s: string): Set<string> {
  return new Set([...s.matchAll(SUPERLATIVE_EST_RE)].map((m) => (m[1] ?? '').toLowerCase()));
}

function wordList(s: string, words: readonly string[]): string[] {
  const lower = s.toLowerCase();
  return words.filter((w) => {
    const esc = w.replace(/[.*+?^${}()|[\]\\]/g, '\\$&').replace(/'/g, "['’]");
    return new RegExp(`(^|[^\\p{L}\\p{N}])${esc}(?=$|[^\\p{L}\\p{N}])`, 'u').test(lower);
  });
}

/** Why a rewrite is refused, or null when it is acceptable (same rules as the backend). */
export function rewriteProblem(f: Finding, original: string, replacement: string): string | null {
  if (f.audit === 'grounding') return 'rewrites are not accepted for grounding findings';
  if (original !== f.excerpt) return 'the rewrite does not target the flagged text exactly';
  if (replacement.trim() === '') return 'empty rewrite';
  if (replacement.length > f.excerpt.length * 3 + 40)
    return 'the rewrite is much longer than the original';
  if (/\[c:/i.test(replacement)) return 'the rewrite adds a claim tag';
  if (/\{(setup|payoff):/i.test(replacement)) return 'the rewrite adds a setup/payoff tag';
  if (LINK_RE.test(replacement)) return 'the rewrite adds a link';
  for (const q of QUOTE_MARKS)
    if (replacement.includes(q) && !original.includes(q)) return 'the rewrite adds a quotation';
  if (OPENING_SINGLE_RE.test(replacement) && !OPENING_SINGLE_RE.test(original))
    return 'the rewrite adds a quotation';
  const had = new Set(numbersIn(original));
  if (numbersIn(replacement).some((n) => !had.has(n))) return 'the rewrite adds a number';
  const hadWords = new Set(wordList(original, SPELLED_NUMBERS));
  if (wordList(replacement, SPELLED_NUMBERS).some((w) => !hadWords.has(w)))
    return 'the rewrite adds a number';
  const hadClaims = new Set(wordList(original, [...SUPERLATIVES, ...ATTRIBUTIONS]));
  if (wordList(replacement, [...SUPERLATIVES, ...ATTRIBUTIONS]).some((w) => !hadClaims.has(w)))
    return 'the rewrite adds a superlative or an attribution (a new claim)';
  const hadEst = estSuperlatives(original);
  if ([...estSuperlatives(replacement)].some((w) => !hadEst.has(w)))
    return 'the rewrite adds a superlative or an attribution (a new claim)';
  return null;
}

export function interpret(
  raw: unknown,
  sent: readonly Finding[],
):
  | { ok: true; recs: Recommendation[]; meta: ExplainResponse['meta']; dropped: number }
  | { ok: false; error: string } {
  const r = response.safeParse(raw);
  if (!r.success)
    return {
      ok: false,
      error: 'The backend answer did not match the expected schema; nothing was shown.',
    };
  const byKey = new Map(sent.map((f) => [f.key, f]));
  const recs: Recommendation[] = [];
  let dropped = r.data.meta.dropped;
  const seen = new Set<string>();
  for (const x of r.data.recommendations) {
    const f = byKey.get(x.findingKey);
    // One recommendation per finding: a second answer for the same key is dropped.
    if (!f || hasControl(x.explanation) || seen.has(x.findingKey)) {
      dropped += 1;
      continue;
    }
    seen.add(x.findingKey);
    let suggestion: Suggestion | null = null;
    let rewriteDropped: string | null = null;
    if (x.rewrite) {
      rewriteDropped = rewriteProblem(f, x.rewrite.original, x.rewrite.replacement);
      // Counted like the backend's drops, so the panel's total includes the browser's own checks.
      if (rewriteDropped) dropped += 1;
      else {
        suggestion = {
          key: `AI|${f.key}`,
          target: f.target,
          start: f.start,
          end: f.end,
          expected: f.excerpt,
          replacement: x.rewrite.replacement,
          label: 'AI rewrite (unverified)',
          source: 'ai',
        };
      }
    }
    recs.push({ findingKey: x.findingKey, explanation: x.explanation, suggestion, rewriteDropped });
  }
  return { ok: true, recs, meta: r.data.meta, dropped };
}

export function sentenceAround(text: string, f: Finding): string {
  if (f.target === 'title') return f.excerpt;
  const s = Math.max(0, text.lastIndexOf('\n\n', f.start) + 1);
  const e0 = text.indexOf('\n\n', f.end);
  const e = e0 < 0 ? text.length : e0;
  return text.slice(s, e).trim().slice(0, 1200);
}

export function buildRequest(
  title: string,
  text: string,
  findings: readonly Finding[],
): ExplainRequest {
  return {
    title: title.slice(0, 200),
    findings: findings.slice(0, MAX_AI_FINDINGS).map((f) => ({
      key: f.key,
      audit: f.audit,
      rule: f.rule,
      message: f.message.slice(0, 400),
      excerpt: f.excerpt.slice(0, 2000),
      sentence: sentenceAround(text, f),
    })),
  };
}
