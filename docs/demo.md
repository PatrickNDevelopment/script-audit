# Demo script

Run `npm run dev` and open http://localhost:5177/script-audit/. For the AI part, also run the backend
with the deterministic fake provider: in `backend`, set `SCRIPT_AUDIT_AI_PROVIDER=fake` and run
`..\.venv\Scripts\python -m script_audit`.

## Journey 1: import, four audits, reject, apply, compare, export

1. **Editor**: choose `examples/draft.md` under "Markdown or text file". The title becomes "The
   Shocking Story of the Paper Bridge"; the outline shows three sections with words and durations.
2. **Audits**: open each tab and press its Run button: grounding, narrative, spoken, packaging. Each
   finding names its rule; "Why this rule?" explains it.
3. **Packaging**: reject the "Sensational phrasing" title suggestion. It moves to "Rejected" and can
   be restored.
4. **Spoken readability**: on "Double space", press Preview change (side-by-side diff), then Apply.
   Revision 2 is created; the rejection is still there.
5. **History → Compare** revision 1 with the current one: the double space on the left, one space on
   the right.
6. **Editor → Download Markdown**: `the-shocking-story-of-the-paper-bridge-r2.md`, title unchanged.

## Journey 2: claim ids change grounding only for covered sentences

1. **Editor → Load the sample script** (invented). **Audits → Grounding**: run it. Coverage is 1 of 10.
2. In the Editor, add `[c:worst-storm]` before the full stop of "The worst storm took 3 metres of
   cliff in a single night." and save. Back in Grounding, that warning is gone, coverage is 2 of 10,
   and "She was the first keeper ..." in the same paragraph is still flagged.
3. Tag "She was the first keeper" with `[c:keeper-log]`: the warning becomes "Not in the linked
   claim: first", because that claim is about 212 storms, not about being first.
4. On **Claims**, add a source with a citation and quote to `storm-record`; its sentence is covered.

## Also try

- Approve the script in the Editor: it becomes read-only and every Apply button is disabled.
- History → Undo last change: the new revision has the exact earlier text.
- With the fake backend: Audits → AI explanations → opt in, tick findings, Ask. Preview and apply an
  AI rewrite, or see one dropped when it would add a number.
