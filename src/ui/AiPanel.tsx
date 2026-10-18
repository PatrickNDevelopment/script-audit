/** Optional AI explanations through the local backend. Off unless the user opts in this session. */
import { useEffect, useState } from 'react';
import {
  buildRequest,
  interpret,
  MAX_AI_FINDINGS,
  ruleName,
  type Finding,
  type Recommendation,
  type Revision,
  type Suggestion,
} from '../engine';
import { autoCheckBackend, capabilities, explain, type Capabilities } from '../lib/api';
import { backendUrlSaved, loadOptIn, saveOptIn } from '../lib/storage';
import { SuggestionPreview } from './Audits';

export function AiPanel(props: {
  backend: string;
  rev: Revision;
  open: Finding[];
  block: string | null;
  onApply: (s: Suggestion) => void;
}) {
  const [caps, setCaps] = useState<Capabilities | null>(null);
  const [checkedAt, setCheckedAt] = useState(0);
  const [optIn, setOptIn] = useState(loadOptIn);
  const [selected, setSelected] = useState<string[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<{
    recs: Recommendation[];
    sent: Finding[];
    dropped: number;
    cached: boolean;
    model: string;
  } | null>(null);
  const [dismissed, setDismissed] = useState<string[]>([]);
  const [shown, setShown] = useState<string | null>(null);

  const auto = autoCheckBackend(window.location.hostname, backendUrlSaved());
  useEffect(() => {
    if (!auto && checkedAt === 0) return;
    let alive = true;
    capabilities(props.backend).then((c) => {
      if (alive) setCaps(c);
    });
    return () => {
      alive = false;
    };
  }, [props.backend, checkedAt, auto]);

  const valid = selected.filter((k) => props.open.some((f) => f.key === k));

  async function ask() {
    const sent = props.open.filter((f) => valid.includes(f.key)).slice(0, MAX_AI_FINDINGS);
    if (!sent.length) return;
    setBusy(true);
    setError(null);
    const r = await explain(props.backend, buildRequest(props.rev.title, props.rev.text, sent));
    setBusy(false);
    if (!r.ok) {
      setError(r.message);
      return;
    }
    const parsed = interpret(r.body, sent);
    if (!parsed.ok) {
      setError(parsed.error);
      return;
    }
    setResult({
      recs: parsed.recs,
      sent,
      dropped: parsed.dropped,
      cached: parsed.meta.cached,
      model: `${parsed.meta.provider} / ${parsed.meta.model}`,
    });
    setDismissed([]);
  }

  return (
    <section className="card ai" aria-labelledby="ai-h">
      <div className="row-between">
        <h3 id="ai-h">AI explanations (optional)</h3>
        <button type="button" className="secondary small" onClick={() => setCheckedAt(Date.now())}>
          {!auto && checkedAt === 0 ? 'Check the local backend' : 'Check backend again'}
        </button>
      </div>
      <p className="small muted">
        Sends only the findings you tick (rule, message, excerpt and its paragraph) to the local
        backend at <code>{props.backend}</code>, which calls a provider configured there. Answers
        are unverified and are never applied automatically. The audits above work without this.
      </p>
      <div data-testid="ai-state" role="status">
        {caps === null && !auto && checkedAt === 0 ? (
          <p className="notice info">
            Not checked. This page does not contact your computer on its own. AI explanations need
            the optional local backend (see the README); everything else works without it.
          </p>
        ) : null}
        {caps === null && (auto || checkedAt !== 0) ? <p>Checking the backend…</p> : null}
        {caps?.kind === 'offline' ? (
          <p className="notice info">
            Backend not reachable. {caps.message} AI explanations are unavailable; everything else
            works. To use them, run the local backend (see the README).
          </p>
        ) : null}
        {caps?.kind === 'disabled' ? (
          <p className="notice info">
            The backend is running, but no AI provider is configured on it.
          </p>
        ) : null}
        {caps?.kind === 'enabled' ? (
          <p>
            Available: {caps.provider} / {caps.model}
            {caps.callsPerHour > 0 ? ` (at most ${caps.callsPerHour} calls per hour)` : ''}.
          </p>
        ) : null}
      </div>
      {caps?.kind === 'enabled' ? (
        <>
          <label className="check">
            <input
              type="checkbox"
              checked={optIn}
              onChange={(e) => {
                setOptIn(e.target.checked);
                saveOptIn(e.target.checked);
              }}
            />
            I opt in to sending the selected findings to the AI provider for this browser session.
          </label>
          {optIn ? (
            props.open.length === 0 ? (
              <p className="muted">Run an audit with open findings first.</p>
            ) : (
              <fieldset className="ai-pick">
                <legend>
                  Choose up to {MAX_AI_FINDINGS} findings ({valid.length} chosen)
                </legend>
                <ul>
                  {props.open.map((f) => (
                    <li key={f.key}>
                      <label className="check">
                        <input
                          type="checkbox"
                          checked={valid.includes(f.key)}
                          disabled={!valid.includes(f.key) && valid.length >= MAX_AI_FINDINGS}
                          onChange={(e) =>
                            setSelected(
                              e.target.checked
                                ? [...valid, f.key]
                                : valid.filter((k) => k !== f.key),
                            )
                          }
                        />
                        <span>
                          <span className="badge rule">{f.rule}</span> {ruleName(f.rule)}:{' '}
                          {f.excerpt.slice(0, 80) || '(title)'}
                        </span>
                      </label>
                    </li>
                  ))}
                </ul>
                <button type="button" disabled={busy || valid.length === 0} onClick={ask}>
                  {busy ? 'Asking…' : 'Ask for explanations'}
                </button>
              </fieldset>
            )
          ) : null}
        </>
      ) : null}
      {error ? (
        <p className="notice danger" role="alert">
          {error}
        </p>
      ) : null}
      {result ? (
        <div data-testid="ai-results">
          <p className="small">
            {result.recs.length} explanation(s) from {result.model}
            {result.cached ? ' (repeated request, answered from the backend cache)' : ''}.{' '}
            {result.dropped} item(s) were dropped because they broke the rules (for example a
            rewrite that added a number, quote, link or citation).
          </p>
          <ol className="findings">
            {result.recs.map((r) => {
              const f = result.sent.find((x) => x.key === r.findingKey) as Finding;
              return (
                <li key={r.findingKey} className="finding">
                  <h4>
                    <span className="badge rule">{f.rule}</span> {ruleName(f.rule)}{' '}
                    <span className="badge ai-badge">AI, unverified</span>
                  </h4>
                  <p>{r.explanation}</p>
                  {r.rewriteDropped ? (
                    <p className="small muted">
                      A proposed rewrite was dropped: {r.rewriteDropped}.
                    </p>
                  ) : null}
                  {r.suggestion && !dismissed.includes(r.suggestion.key) ? (
                    <>
                      <div className="inline-group">
                        <button
                          type="button"
                          className="secondary small"
                          onClick={() => setShown(shown === r.findingKey ? null : r.findingKey)}
                        >
                          {shown === r.findingKey ? 'Hide AI rewrite' : 'Preview AI rewrite'}
                        </button>
                        <button
                          type="button"
                          className="small"
                          disabled={props.block !== null}
                          title={props.block ?? undefined}
                          onClick={() => props.onApply(r.suggestion as Suggestion)}
                        >
                          Apply AI rewrite
                        </button>
                        <button
                          type="button"
                          className="secondary small"
                          onClick={() =>
                            setDismissed([...dismissed, (r.suggestion as Suggestion).key])
                          }
                        >
                          Dismiss
                        </button>
                      </div>
                      {shown === r.findingKey ? (
                        <SuggestionPreview rev={props.rev} s={r.suggestion} testId="ai-diff" />
                      ) : null}
                    </>
                  ) : null}
                </li>
              );
            })}
          </ol>
        </div>
      ) : null}
    </section>
  );
}
