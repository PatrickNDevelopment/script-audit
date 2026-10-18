# Security notes

The browser app has no server, no accounts and no network calls except to the optional local
backend address you configure. Served from any host other than loopback (the public static demo), it
does not contact that address until you click "Check the local backend" or save an address. The backend binds to 127.0.0.1 and has no authentication by design;
do not expose it.

| Input                   | Treated as                                                                                                                                                                                        |
| ----------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Markdown / text import  | Untrusted. 2 MB cap, NUL bytes refused, 200,000-character script cap; rendered as text, never as HTML.                                                                                            |
| Workspace JSON          | Untrusted. 20 MB cap, strict zod schema (unknown keys rejected), revision numbering, duplicate ids, http(s) URLs.                                                                                 |
| `localStorage` contents | Untrusted. Re-validated on load; an unreadable copy is kept aside and offered as a download.                                                                                                      |
| Claim URLs              | Shown as links only when `http`/`https`, with `rel="noopener noreferrer nofollow"`; never fetched.                                                                                                |
| AI provider output      | Untrusted, twice: strict schema on the backend and again in the browser; rewrites that add numbers (digits or words), superlatives, attributions, quotes, links, claim or story tags are dropped. |

## Backend

- The only secret is `ANTHROPIC_API_KEY`, read from the server environment, never logged, stored or
  returned. The provider base URL is limited to `https://api.anthropic.com` or a loopback origin.
- Host allow-list, CORS to configured origins, Origin check on writes, streamed 200 kB body cap,
  30 s deadline, rate limit counted from the ledger.
- The ledger stores a prompt hash and counts, never script text. The answer cache stores validated
  answers (which can quote the excerpt) in the local SQLite file only.

## Ethics

The app does not claim to verify facts or to predict views, click-through or retention. It never
invents claims, sources or citations, and AI rewrites cannot add any.

Report problems through a private security advisory on the repository once it is published, or by
contacting the owner.
