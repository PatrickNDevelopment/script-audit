/** Rule names and plain explanations, shown next to every finding (docs/spec/01-audits.md). */

export interface RuleInfo {
  name: string;
  explanation: string;
}

export const RULES: Record<string, RuleInfo> = {
  G1: {
    name: 'Unsupported assertion',
    explanation:
      'The sentence contains a number, a superlative or an attribution phrase, so a listener may take it as fact, but it has no claim tag like [c:id]. Link it to a claim with a source and quote, or soften it. The app cannot check facts; it only checks that you linked support.',
  },
  G2: {
    name: 'Unknown claim id',
    explanation:
      'A claim tag names an id that is not in the claim register. Add the claim or fix the id.',
  },
  G3: {
    name: 'Claim has no source',
    explanation:
      'The tagged claim exists but has no source with both a citation and a supporting quote, so the sentence is not demonstrably covered.',
  },
  G4: {
    name: 'Specifics not in the linked claim',
    explanation:
      'A number, superlative ("first", "worst", ...) or quantity word in the sentence does not appear in the statement or quotes of the linked claim(s), so the link does not demonstrably cover what the sentence says. Either the sentence or the claim needs to change.',
  },
  N1: {
    name: 'Repeated phrase',
    explanation:
      'The same phrase of four or more words appears three or more times. Listeners notice repetition faster than readers.',
  },
  N2: {
    name: 'Repeated sentence opening',
    explanation: 'Two sentences in a row start with the same two words.',
  },
  N3: {
    name: 'Setup without payoff',
    explanation:
      'A {setup:key} marker has no later {payoff:key}. The script opens a question or promise that it never resolves.',
  },
  N4: {
    name: 'Payoff without setup',
    explanation:
      'A {payoff:key} marker has no earlier {setup:key}, so the resolution may land without context.',
  },
  N5: {
    name: 'Long exposition',
    explanation:
      'More than 120 spoken words in a row with no question, quotation, direct address ("you") or example cue. Consider breaking it up.',
  },
  N6: {
    name: 'Abrupt section transition',
    explanation:
      'The first sentence of this section has no transition word and shares no content word with the end of the previous section.',
  },
  S1: {
    name: 'Long sentence',
    explanation:
      'The sentence is longer than the limit set in Settings. Long sentences are hard to say in one breath and hard to follow by ear.',
  },
  S2: {
    name: 'Repeated word',
    explanation: 'The same content word is used three or more times within 40 words.',
  },
  S3: {
    name: 'No place to breathe',
    explanation:
      'More than 18 spoken words in a row without a comma, dash, colon, semicolon or sentence end.',
  },
  S4: {
    name: 'Pronunciation',
    explanation:
      'An acronym, a word with digits or a word with letters outside A to Z, and it is not in the pronunciation glossary. Add how to say it.',
  },
  S5: {
    name: 'Double space',
    explanation:
      'Two or more spaces between words. Harmless when read, but it can confuse teleprompters and word counts.',
  },
  P1: {
    name: 'Title and hook do not match',
    explanation:
      'No content word of the title appears in the first 60 spoken words, so the opening may not deliver what the title promises.',
  },
  P2: {
    name: 'Sensational phrasing',
    explanation:
      'This phrase promises more than most scripts can support. It is a style suggestion, not a statement about how any platform ranks videos.',
  },
  P3: {
    name: 'Title claim not covered',
    explanation:
      'The title contains a number or superlative that no covered (claim-linked and sourced) sentence in the script contains.',
  },
  P4: {
    name: 'Title length',
    explanation: 'The title is empty or longer than 70 characters, which many listings cut off.',
  },
};

export const SUPERLATIVES = [
  'first',
  'the only',
  'largest',
  'biggest',
  'smallest',
  'the most',
  'the least',
  'best',
  'worst',
  'highest',
  'lowest',
  'fastest',
  'slowest',
  'oldest',
  'newest',
  'longest',
  'shortest',
  'record',
  'never',
  'always',
];
export const NUMBER_WORDS = [
  'million',
  'millions',
  'billion',
  'billions',
  'thousand',
  'thousands',
  'percent',
  'half',
  'twice',
  'double',
  'triple',
];
export const ATTRIBUTIONS = [
  'according to',
  'studies show',
  'research shows',
  'scientists',
  'experts',
  'data shows',
  'reported',
  'found that',
  'proved',
  'confirmed',
];

export const SENSATIONAL: { phrase: string; neutral: string | null }[] = [
  { phrase: "you won't believe", neutral: null },
  { phrase: 'you wont believe', neutral: null },
  { phrase: 'nobody is talking about', neutral: null },
  { phrase: 'will change your life', neutral: null },
  { phrase: 'the truth about', neutral: null },
  { phrase: 'mind-blowing', neutral: 'striking' },
  { phrase: 'shocking', neutral: 'surprising' },
  { phrase: 'insane', neutral: 'remarkable' },
  { phrase: 'destroyed', neutral: 'criticized' },
  { phrase: 'guaranteed', neutral: 'likely' },
  { phrase: 'secret', neutral: null },
  { phrase: 'exposed', neutral: null },
  { phrase: '100%', neutral: null },
];

export const TRANSITIONS = [
  'but',
  'so',
  'now',
  'next',
  'then',
  'meanwhile',
  'which',
  "that's why",
  'this is',
  "here's",
  'after',
  'before',
  'yet',
  'still',
  'however',
  'because',
];
export const EXAMPLE_CUES = [
  'for example',
  'for instance',
  'imagine',
  'picture',
  'say you',
  'like when',
];
export const CONJUNCTIONS = ['and', 'but', 'because', 'which', 'while', 'so'];
