# Spec 01: the four audits

Four independent, deterministic audits. Each takes the current revision (and the claim register,
glossary and settings where stated) and returns findings. No audit reads another audit's output.
Every finding carries the rule id, a plain explanation of the rule, the exact range and excerpt, and
optionally one fix (`replacement` for exactly that range). The same input always gives the same
findings in the same order.

What the audits are **not**: they do not verify facts, judge quality, or predict views, click-through
or retention. The UI says so next to every audit.

## 1. Grounding (`grounding`)

A sentence is an **assertion** when its masked text contains at least one of:

- a number (digits, `%`, a year), or a number word with a unit (`million`, `billion`, `thousand`,
  `percent`, `half`, `twice`, `double`, `triple`);
- a superlative or absolute (`first`, `the only`, `largest`, `biggest`, `smallest`, `the most`,
  `the least`, `best`, `worst`, `highest`, `lowest`, `fastest`, `slowest`, `oldest`, `newest`,
  `longest`, `shortest`, `record`, `never`, `always`). Everyday words such as `every`, `all`, `last`
  or a bare `most` are deliberately not triggers: they are rarely checkable and caused false
  positives in testing;
- an attribution or evidence phrase (`according to`, `studies show`, `research shows`, `scientists`,
  `experts`, `data shows`, `reported`, `found that`, `proved`, `confirmed`).

The matched trigger words are shown, so the user sees why a sentence counts.

Claims: `{ id, statement, sources: [{ citation, url?, quote }] }`. A claim is **supported** when it has
at least one source with a non-empty citation and a non-empty quote. URLs, if given, must be `http`
or `https`.

Rules, for each assertion sentence:

| Rule                   | When                                                                                                                                                       |
| ---------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `G1 unsupported`       | no claim tag in the sentence                                                                                                                               |
| `G2 unknown-claim`     | a tag names an id that is not in the register                                                                                                              |
| `G3 claim-no-source`   | every tagged claim exists but none is supported                                                                                                            |
| `G4 specifics-missing` | a number, superlative or number word of the sentence appears in none of the tagged supported claims' statements or quotes (an attribution phrase need not) |

A sentence with a tag that resolves to a supported claim and passes G4 is **covered**: no finding.
A tag covers **only its own sentence**: tagging one sentence of a paragraph never clears the others.
A claim tag in a sentence that is not an assertion is fine (no finding). Grounding findings never
carry a fix: the app cannot make text true. Coverage = covered assertions / assertions.

## 2. Narrative structure (`narrative`)

| Rule                      | When                                                                                                                                                                                                                                                                                                             | Fix  |
| ------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---- |
| `N1 repeated-phrase`      | a phrase of 4+ words (case-insensitive, stopword-only phrases ignored) occurs 3 or more times; reported at the 3rd and later occurrences                                                                                                                                                                         | none |
| `N2 repeated-opening`     | two consecutive sentences in a beat start with the same first two words                                                                                                                                                                                                                                          | none |
| `N3 missing-payoff`       | a `{setup:k}` has no later `{payoff:k}`                                                                                                                                                                                                                                                                          | none |
| `N4 payoff-without-setup` | a `{payoff:k}` has no earlier `{setup:k}`                                                                                                                                                                                                                                                                        | none |
| `N5 long-exposition`      | a run of consecutive sentences with more than 120 spoken words and no engagement cue: a question, a quotation, `you`/`your`, or an example cue (`for example`, `for instance`, `imagine`, `picture`, `say you`, `like when`)                                                                                     | none |
| `N6 abrupt-transition`    | the first sentence of a section (except the first) has no transition cue (`but`, `so`, `now`, `next`, `then`, `meanwhile`, `which`, `that's why`, `this is`, `here's`, `after`, `before`, `yet`, `still`, `however`, `because`, a question) **and** shares no content word with the previous section's last beat | none |

## 3. Spoken language (`spoken`)

| Rule                | When                                                                                                                                                                                                 | Fix                                                                                                                                                                   |
| ------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `S1 long-sentence`  | a sentence has more than `maxWords` spoken words (default 28, adjustable 12 to 60)                                                                                                                   | when the sentence has `, and `, `, but `, `, so `, `; ` or `—` near its middle (the one nearest the middle word): end the sentence there and capitalise the next word |
| `S2 repeated-word`  | a content word (not a stopword, 4+ letters) appears 3+ times within any 40-word window; reported once per window at the 3rd use                                                                      | none                                                                                                                                                                  |
| `S3 breathless-run` | more than 18 spoken words in a row without any pause punctuation                                                                                                                                     | insert `,` before the conjunction (`and`, `but`, `because`, `which`, `while`, `so`) nearest the middle of the run, if there is one                                    |
| `S4 pronounce`      | a word not in the glossary that is an acronym (2+ capitals), contains a digit and a letter, or contains a letter outside A-Z/a-z; reported once per word (a possessive `'s` counts as the same word) | none (suggests adding it to the glossary)                                                                                                                             |
| `S5 double-space`   | two or more spaces between words                                                                                                                                                                     | replace with one space                                                                                                                                                |

The glossary is `{ term, say }` pairs. Terms found in the script are listed with counts and appear in
the narration export.

## 4. Packaging and marketability (`packaging`)

Inputs: the title and the **hook** = the first 60 spoken words of the script.

| Rule                         | When                                                                                                                                                                                                                                                        | Fix                                                                                                                                                                                                                         |
| ---------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `P1 title-hook-mismatch`     | no content word of the title (stemmed: lower case, trailing `s`/`es`/`ing`/`ed` removed) appears in the hook                                                                                                                                                | none                                                                                                                                                                                                                        |
| `P2 sensational`             | the title or hook uses a sensational phrase from the list (e.g. `shocking`, `you won't believe`, `insane`, `mind-blowing`, `destroyed`, `the truth about`, `secret`, `nobody is talking about`, `guaranteed`, `100%`, `will change your life`, `exposed`)   | in the hook, replace with a neutral alternative from the same table where one exists (`shocking` → `surprising`, `insane` → `remarkable`, `destroyed` → `criticized`, `mind-blowing` → `striking`, `guaranteed` → `likely`) |
| `P3 unsupported-title-claim` | the title contains a number or a superlative that no covered assertion in the script contains (coverage is computed here from the claim register with the grounding definition; the packaging audit does not depend on whether the grounding audit was run) | none                                                                                                                                                                                                                        |
| `P4 title-length`            | the title is longer than 70 characters (may be truncated in many listings) or empty                                                                                                                                                                         | none                                                                                                                                                                                                                        |

Shown with the note: "Packaging checks are writing suggestions. They do not predict views,
click-through or retention."

Title findings point at the title field (`target: "title"`); applying a title fix creates a revision
with the new title and the same text.
