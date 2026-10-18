# Spec 00: script document, structure, revisions and decisions

## Script text

A script is UTF-8 text in a small Markdown subset. Line endings are normalised to `\n` on import
(`\r\n` and lone `\r` become `\n`); a leading BOM is removed. Nothing else is changed: the stored text
is exactly what the writer typed.

| Syntax                                                                 | Meaning                                                                            |
| ---------------------------------------------------------------------- | ---------------------------------------------------------------------------------- |
| `# Title` (first line)                                                 | Script title. Optional; the title field in the app wins when both exist.           |
| `## Heading`                                                           | Starts a section. Text before the first `##` is the section "Opening".             |
| blank-line separated text                                              | A beat (paragraph). Every beat belongs to exactly one section.                     |
| `[c:id]`, `[c:id1,id2]`                                                | Claim reference: links the sentence it appears in to claims in the claim register. |
| `{setup:key}`                                                          | Marks a narrative setup (a promise, question or mystery the script opens).         |
| `{payoff:key}`                                                         | Marks where that setup is resolved.                                                |
| `*em*`, `**strong**`, `` `code` ``, `[text](url)`, `> quote`, `- item` | Kept in the text; ignored when counting spoken words.                              |

Ids and keys: `[a-z0-9][a-z0-9-]{0,23}`, case-insensitive on input, stored lower case.

## Spoken view (masking)

Analysis runs on a **masked copy of the same length**: claim tags, setup/payoff tags, Markdown
markers (`#`, `*`, `_`, backticks, `>` at line start, list bullets) and link targets `(url)` are
replaced by spaces. Because the masked text has the same length, every finding's offsets point into
the real script text, and a suggestion replaces exactly the characters it shows.

Offsets are UTF-16 code unit indices (JavaScript string indices). A range never starts or ends inside
a surrogate pair.

## Sentences and words

- A sentence ends at `.`, `!`, `?`, `…` (or a run of them), optionally followed by closing quotes or
  brackets (`"`, `'`, `”`, `’`, `)`, `]`), and then whitespace or the end of the beat. A beat end also
  ends a sentence.
- No split after common abbreviations (`Mr.`, `Mrs.`, `Ms.`, `Dr.`, `St.`, `vs.`, `etc.`, `e.g.`,
  `i.e.`, `U.S.`, `U.K.`, `No.`, `approx.`, `Jan.` to `Dec.`), after a single capital letter (`J.`),
  or inside a number (`3.5`).
- A word is a run of letters or digits, with inner apostrophes (`'` or `’`), hyphens or periods
  between digits. Counting uses the masked text.

## Duration estimate

`seconds = words / wpm * 60 + pauses`, with the narration speed `wpm` adjustable from 100 to 220
(default 150). Pauses: comma, semicolon or colon 0.25 s; dash (`—`, `–`, `-`) 0.3 s; sentence end
0.5 s; ellipsis 0.7 s; beat break 0.8 s; section break 1.2 s. Shown per section and in total, always
labelled as an estimate.

## Revisions

- The workspace keeps every revision: `{ n, at, note, title, text, kind }`, `n` starting at 1. Kinds:
  `import`, `edit`, `apply` (a suggestion), `revert`, `ai-apply`.
- Revision 1 is the imported original. Revisions are never edited or deleted, so the original is
  always recoverable.
- **Undo** creates a new revision equal to the previous revision's text and title (kind `revert`).
  **Revert to revision k** creates a new revision equal to revision k. Both are exact: the text is
  byte-for-byte the earlier text.
- History is capped at 300 revisions; past the cap the app refuses further changes and asks the user
  to export, rather than dropping the original.

## Applying a suggestion

A suggestion carries `{ start, end, expected, replacement }`. Applying it:

1. checks the script is not approved (see below);
2. checks `text.slice(start, end) === expected` on the **current** revision; if not, the suggestion
   is stale and nothing changes;
3. creates a revision with `text.slice(0, start) + replacement + text.slice(end)`.

Suggestions are never applied automatically, in bulk or by the AI broker.

## Decisions

Each finding has a **key** derived from its rule id, its exact excerpt and the occurrence number of
that excerpt for that rule (`rule|excerpt|k`), so a key survives edits elsewhere in the text.
A user can **reject** a finding (kept per key; shown as rejected and excluded from counts, with
"Restore"). Applying records the key as applied in the revision note.

## Approval lock

The script has a status, `draft` or `approved`. While approved, editing, applying, undo and revert are
disabled in the UI and refused by the engine; audits still run and export still works. "Reopen for
editing" is an explicit action and is recorded as a revision note on the next change.

## Workspace

`{ schema: "script-audit.workspace", version: 1, status, revisions, claims, glossary, decisions,
settings }`, validated with a strict zod schema on import and on load from `localStorage`
(`script-audit.workspace.v1`). An unreadable stored workspace is kept under
`script-audit.workspace.v1.corrupt` and offered as a download. Limits: script 200,000 characters,
300 revisions, 500 claims, 10 sources per claim, 300 glossary terms, file import 2 MB (Markdown) or
20 MB (workspace JSON).
