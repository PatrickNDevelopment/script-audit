/** The claim register: claims with sources and quotes, written by the user. Nothing is invented here. */
import { useMemo, useState } from 'react';
import {
  analyze,
  claimIdsIn,
  ID_RE,
  isSupported,
  LIMITS,
  type Claim,
  type ClaimSource,
  type Revision,
} from '../engine';

function SourceForm(props: { onAdd: (s: ClaimSource) => void }) {
  const [citation, setCitation] = useState('');
  const [url, setUrl] = useState('');
  const [quote, setQuote] = useState('');
  const urlOk = url.trim() === '' || /^https?:\/\/\S+$/i.test(url.trim());
  const ok = citation.trim() !== '' && quote.trim() !== '' && urlOk;
  return (
    <form
      className="source-form"
      onSubmit={(e) => {
        e.preventDefault();
        if (!ok) return;
        props.onAdd({ citation: citation.trim(), url: url.trim(), quote: quote.trim() });
        setCitation('');
        setUrl('');
        setQuote('');
      }}
    >
      <label>
        Citation (where it comes from)
        <input value={citation} maxLength={500} onChange={(e) => setCitation(e.target.value)} />
      </label>
      <label>
        URL (optional, http or https)
        <input
          value={url}
          maxLength={2000}
          onChange={(e) => setUrl(e.target.value)}
          aria-invalid={!urlOk}
        />
      </label>
      <label>
        Supporting quote (copied from the source)
        <textarea
          rows={2}
          value={quote}
          maxLength={2000}
          onChange={(e) => setQuote(e.target.value)}
        />
      </label>
      {!urlOk ? <p className="error-text">The URL must start with http:// or https://.</p> : null}
      <button type="submit" className="small" disabled={!ok}>
        Add source
      </button>
    </form>
  );
}

export function Claims(props: {
  claims: Claim[];
  rev: Revision;
  onChange: (claims: Claim[], msg: string) => void;
}) {
  const { claims } = props;
  const [id, setId] = useState('');
  const [statement, setStatement] = useState('');
  const [confirm, setConfirm] = useState<string | null>(null);
  const usage = useMemo(() => {
    const a = analyze(props.rev.text);
    const m = new Map<string, number>();
    for (const s of a.sentences)
      for (const cid of new Set(claimIdsIn(props.rev.text.slice(s.start, s.tagEnd))))
        m.set(cid, (m.get(cid) ?? 0) + 1);
    return m;
  }, [props.rev.text]);
  const nid = id.trim().toLowerCase();
  const idProblem =
    nid === ''
      ? null
      : !ID_RE.test(nid)
        ? 'Use a-z, 0-9 and -, up to 24 characters.'
        : claims.some((c) => c.id === nid)
          ? 'That id is already used.'
          : null;
  const update = (cid: string, f: (c: Claim) => Claim, msg: string) =>
    props.onChange(
      claims.map((c) => (c.id === cid ? f(c) : c)),
      msg,
    );

  return (
    <section aria-labelledby="claims-h">
      <h2 id="claims-h">Claims and sources</h2>
      <p className="notice info">
        Grounding checks only that a sentence links to a claim you wrote down here with a citation
        and a quote. It never checks whether the source is right, and the app never creates claims
        or sources for you. Tag a sentence with <code>[c:id]</code> in the Editor.
      </p>
      <form
        className="card form-grid"
        onSubmit={(e) => {
          e.preventDefault();
          if (!nid || idProblem || statement.trim() === '' || claims.length >= LIMITS.claims)
            return;
          props.onChange(
            [...claims, { id: nid, statement: statement.trim(), sources: [] }],
            `Added claim ${nid}.`,
          );
          setId('');
          setStatement('');
        }}
      >
        <label>
          Claim id
          <input
            value={id}
            maxLength={24}
            onChange={(e) => setId(e.target.value)}
            placeholder="e.g. keeper-log"
            aria-invalid={!!idProblem}
          />
        </label>
        <label className="wide">
          Statement (what the script asserts)
          <input
            value={statement}
            maxLength={2000}
            onChange={(e) => setStatement(e.target.value)}
          />
        </label>
        <button type="submit" disabled={!nid || !!idProblem || statement.trim() === ''}>
          Add claim
        </button>
        {idProblem ? <p className="error-text">{idProblem}</p> : null}
      </form>
      {claims.length === 0 ? <p className="muted">No claims yet.</p> : null}
      <ul className="claims">
        {claims.map((c) => {
          const used = usage.get(c.id) ?? 0;
          return (
            <li key={c.id} className="card" data-claim={c.id}>
              <div className="row-between">
                <h3>
                  <code>[c:{c.id}]</code>{' '}
                  {isSupported(c) ? (
                    <span className="badge ok">supported</span>
                  ) : (
                    <span className="badge warn">no complete source</span>
                  )}{' '}
                  <span className="badge">
                    used in {used} sentence{used === 1 ? '' : 's'}
                  </span>
                </h3>
                {confirm === c.id ? (
                  <span className="inline-group">
                    <span className="small">
                      {used ? `Used in ${used} sentence(s). ` : ''}Delete this claim?
                    </span>
                    <button
                      type="button"
                      className="danger small"
                      onClick={() =>
                        props.onChange(
                          claims.filter((x) => x.id !== c.id),
                          `Deleted claim ${c.id}.`,
                        )
                      }
                    >
                      Delete
                    </button>
                    <button
                      type="button"
                      className="secondary small"
                      onClick={() => setConfirm(null)}
                    >
                      Cancel
                    </button>
                  </span>
                ) : (
                  <button
                    type="button"
                    className="secondary small"
                    onClick={() => setConfirm(c.id)}
                    aria-label={`Delete claim ${c.id}`}
                  >
                    Delete
                  </button>
                )}
              </div>
              <label>
                Statement
                <input
                  value={c.statement}
                  maxLength={2000}
                  onChange={(e) => update(c.id, (x) => ({ ...x, statement: e.target.value }), '')}
                />
              </label>
              <ol className="sources">
                {c.sources.map((s, i) => (
                  <li key={i}>
                    <p>
                      <strong>{s.citation}</strong>
                      {s.url ? (
                        <>
                          {' '}
                          <a href={s.url} target="_blank" rel="noopener noreferrer nofollow">
                            link
                          </a>
                        </>
                      ) : null}
                    </p>
                    <blockquote>“{s.quote}”</blockquote>
                    <button
                      type="button"
                      className="secondary small"
                      onClick={() =>
                        update(
                          c.id,
                          (x) => ({ ...x, sources: x.sources.filter((_, j) => j !== i) }),
                          `Removed a source from ${c.id}.`,
                        )
                      }
                    >
                      Remove source
                    </button>
                  </li>
                ))}
              </ol>
              {c.sources.length < LIMITS.sourcesPerClaim ? (
                <details>
                  <summary>Add a source to {c.id}</summary>
                  <SourceForm
                    onAdd={(s) =>
                      update(
                        c.id,
                        (x) => ({ ...x, sources: [...x.sources, s] }),
                        `Added a source to ${c.id}.`,
                      )
                    }
                  />
                </details>
              ) : null}
            </li>
          );
        })}
      </ul>
    </section>
  );
}
