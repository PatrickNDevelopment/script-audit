# Known limitations

- **Rules, not understanding.** The audits match patterns. They miss assertions phrased without
  numbers, superlatives or attribution words, and they flag deliberate repetition or long passages a
  writer may want. Every finding can be rejected and stays rejected.
- **Grounding checks links, not truth.** A covered sentence links to a claim you documented whose
  text contains the sentence's specifics. Whether the source says what you quoted, or is reliable, is
  for a person to check.
- **English only.** Stopwords, transition words, sensational phrases and abbreviations are English.
- **Duration is an estimate** from word count, speed and punctuation; real narration varies.
- **Pronunciation** flags acronyms, words with digits and letters outside A to Z. It does not know
  which words are hard to say otherwise.
- **Sentence splitting** handles common abbreviations, initials and decimals; unusual abbreviations can
  split a sentence early.
- **One script per workspace.** Use workspace export to keep several.
- **Storage is per browser** (`localStorage`, usually about 5 MB). A failed save is shown and asks
  you to export.
- **The AI broker** depends on a provider you configure; it was tested with a deterministic fake
  provider and a mocked HTTP transport, not against a live provider.
- **Static demo**: the hosted build (once published) has no backend, so AI explanations show as
  unavailable there.
- **Published 2026-10-19.** CI (Linux, Chromium) and the Pages deploy were green on the first run.
- **AI rewrite filter is conservative.** A rewrite is dropped when it introduces any number (digits
  or words such as "three"), superlative, attribution, quotation mark or link. That also drops some
  harmless rewrites; explanations are still shown. Explanations themselves are free text marked
  "AI, unverified" and can mention things that are not in the script.
- **History table on very narrow screens** (320 px) scrolls sideways inside its own frame to reach
  the Compare, Revert and Download buttons; the page itself does not scroll sideways.
- **The public static demo** does not contact `127.0.0.1` until you click "Check the local backend";
  a backend only answers pages whose origin is listed in `SCRIPT_AUDIT_CORS_ORIGINS`.
