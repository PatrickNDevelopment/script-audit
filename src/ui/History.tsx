/** Revision history (undo, revert, download) and side-by-side comparison of any two revisions. */
import { useMemo, useState } from 'react';
import { diffText, revisionMarkdown, type Workspace } from '../engine';
import { download, slug } from '../lib/files';
import { DiffView } from './DiffView';

const KIND: Record<string, string> = {
  import: 'Imported',
  edit: 'Edit',
  apply: 'Suggestion',
  revert: 'Revert',
  'ai-apply': 'AI rewrite',
};

export function History(props: {
  ws: Workspace;
  block: string | null;
  onUndo: () => void;
  onRevert: (n: number) => void;
  onCompare: (a: number, b: number) => void;
}) {
  const revs = [...props.ws.revisions].reverse();
  const last = props.ws.revisions[props.ws.revisions.length - 1];
  return (
    <section aria-labelledby="history-h">
      <div className="row-between">
        <h2 id="history-h">History</h2>
        <button
          type="button"
          disabled={props.block !== null || props.ws.revisions.length < 2}
          title={props.block ?? undefined}
          onClick={props.onUndo}
        >
          Undo last change
        </button>
      </div>
      {props.block ? <p className="notice info">{props.block}</p> : null}
      <p className="small muted">
        Every change is a new revision. Undo and revert add a revision with the exact earlier text,
        so revision 1 (the original) is always recoverable.
      </p>
      <div className="table-wrap">
        <table>
          <thead>
            <tr>
              <th scope="col">Revision</th>
              <th scope="col">Kind</th>
              <th scope="col">Note</th>
              <th scope="col">Time (UTC)</th>
              <th scope="col">
                <span className="sr-only">Actions</span>
              </th>
            </tr>
          </thead>
          <tbody>
            {revs.map((r) => (
              <tr key={r.n} data-rev={r.n}>
                <th scope="row">
                  {r.n}
                  {r === last ? ' (current)' : ''}
                </th>
                <td>{KIND[r.kind] ?? r.kind}</td>
                <td>{r.note}</td>
                <td>{r.at.slice(0, 19).replace('T', ' ')}</td>
                <td className="actions">
                  <button
                    type="button"
                    className="secondary small"
                    onClick={() => props.onCompare(r.n, last?.n ?? r.n)}
                    aria-label={`Compare revision ${r.n} with the current one`}
                  >
                    Compare
                  </button>
                  <button
                    type="button"
                    className="secondary small"
                    disabled={r === last || props.block !== null}
                    onClick={() => props.onRevert(r.n)}
                    aria-label={`Revert to revision ${r.n}`}
                  >
                    Revert to this
                  </button>
                  <button
                    type="button"
                    className="secondary small"
                    onClick={() =>
                      download(`${slug(r.title)}-r${r.n}.md`, revisionMarkdown(r), 'text/markdown')
                    }
                    aria-label={`Download revision ${r.n}`}
                  >
                    Download
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}

export function Compare(props: {
  ws: Workspace;
  a: number;
  b: number;
  onPick: (a: number, b: number) => void;
}) {
  const { ws } = props;
  const ra = ws.revisions.find((r) => r.n === props.a) ?? ws.revisions[0];
  const rb = ws.revisions.find((r) => r.n === props.b) ?? ws.revisions[ws.revisions.length - 1];
  const [only, setOnly] = useState(false);
  const ops = useMemo(
    () => (ra && rb ? diffText(`${ra.title}\n\n${ra.text}`, `${rb.title}\n\n${rb.text}`) : []),
    [ra, rb],
  );
  if (!ra || !rb) return null;
  // "Changed paragraphs only": keep the eq text only near a change.
  const shown = only
    ? ops.map((o) =>
        o.type === 'eq' && o.text.length > 240
          ? { ...o, text: `${o.text.slice(0, 100)}\n[…]\n${o.text.slice(-100)}` }
          : o,
      )
    : ops;
  return (
    <section aria-labelledby="compare-h">
      <h2 id="compare-h">Compare revisions</h2>
      <div className="inline-group card">
        <label className="inline">
          Left
          <select value={ra.n} onChange={(e) => props.onPick(Number(e.target.value), rb.n)}>
            {ws.revisions.map((r) => (
              <option key={r.n} value={r.n}>
                {r.n}: {r.note.slice(0, 40)}
              </option>
            ))}
          </select>
        </label>
        <label className="inline">
          Right
          <select value={rb.n} onChange={(e) => props.onPick(ra.n, Number(e.target.value))}>
            {ws.revisions.map((r) => (
              <option key={r.n} value={r.n}>
                {r.n}: {r.note.slice(0, 40)}
              </option>
            ))}
          </select>
        </label>
        <label className="check">
          <input type="checkbox" checked={only} onChange={(e) => setOnly(e.target.checked)} />{' '}
          Shorten unchanged text
        </label>
      </div>
      <p className="small muted">The title is shown as the first line.</p>
      <DiffView
        ops={shown}
        oldLabel={`Revision ${ra.n}`}
        newLabel={`Revision ${rb.n}`}
        testId="compare"
      />
    </section>
  );
}
