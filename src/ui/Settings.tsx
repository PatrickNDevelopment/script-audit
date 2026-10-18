/** Settings (audit thresholds, glossary, backend address) and About. */
import { useState } from 'react';
import { LIMITS, type GlossaryEntry, type Settings as S } from '../engine';
import { normalizeBackendUrl } from '../lib/api';

export function Settings(props: {
  settings: S;
  glossary: GlossaryEntry[];
  backend: string;
  onSettings: (s: S) => void;
  onGlossary: (g: GlossaryEntry[], msg: string) => void;
  onBackend: (url: string) => void;
}) {
  const [term, setTerm] = useState('');
  const [say, setSay] = useState('');
  const [url, setUrl] = useState(props.backend);
  const dup = props.glossary.some((g) => g.term.toLowerCase() === term.trim().toLowerCase());
  const normalized = normalizeBackendUrl(url);
  return (
    <section aria-labelledby="settings-h">
      <h2 id="settings-h">Settings</h2>
      <div className="card form-grid">
        <label>
          Narration speed (words per minute, 100 to 220)
          <input
            type="number"
            min={100}
            max={220}
            value={props.settings.wpm}
            onChange={(e) => {
              const v = Math.round(Number(e.target.value));
              if (Number.isFinite(v))
                props.onSettings({ ...props.settings, wpm: Math.min(220, Math.max(100, v)) });
            }}
          />
        </label>
        <label>
          Long sentence limit (words, 12 to 60)
          <input
            type="number"
            min={12}
            max={60}
            value={props.settings.maxWords}
            onChange={(e) => {
              const v = Math.round(Number(e.target.value));
              if (Number.isFinite(v))
                props.onSettings({ ...props.settings, maxWords: Math.min(60, Math.max(12, v)) });
            }}
          />
        </label>
      </div>

      <h3>Pronunciation glossary</h3>
      <form
        className="card form-grid"
        onSubmit={(e) => {
          e.preventDefault();
          if (!term.trim() || !say.trim() || dup || props.glossary.length >= LIMITS.glossary)
            return;
          props.onGlossary(
            [...props.glossary, { term: term.trim(), say: say.trim() }],
            `Added “${term.trim()}” to the glossary.`,
          );
          setTerm('');
          setSay('');
        }}
      >
        <label>
          Term
          <input
            value={term}
            maxLength={80}
            onChange={(e) => setTerm(e.target.value)}
            aria-invalid={dup}
          />
        </label>
        <label>
          Say it as
          <input value={say} maxLength={200} onChange={(e) => setSay(e.target.value)} />
        </label>
        <button type="submit" disabled={!term.trim() || !say.trim() || dup}>
          Add term
        </button>
        {dup ? <p className="error-text">That term is already in the glossary.</p> : null}
      </form>
      {props.glossary.length === 0 ? (
        <p className="muted">No terms yet.</p>
      ) : (
        <ul className="glossary">
          {props.glossary.map((g) => (
            <li key={g.term}>
              <strong>{g.term}</strong>: {g.say}{' '}
              <button
                type="button"
                className="secondary small"
                aria-label={`Remove ${g.term} from the glossary`}
                onClick={() =>
                  props.onGlossary(
                    props.glossary.filter((x) => x.term !== g.term),
                    `Removed “${g.term}”.`,
                  )
                }
              >
                Remove
              </button>
            </li>
          ))}
        </ul>
      )}

      <h3>Local backend (optional)</h3>
      <form
        className="card form-grid"
        onSubmit={(e) => {
          e.preventDefault();
          if (normalized) props.onBackend(normalized);
        }}
      >
        <label className="wide">
          Backend address
          <input value={url} onChange={(e) => setUrl(e.target.value)} aria-invalid={!normalized} />
        </label>
        <button type="submit" disabled={!normalized || normalized === props.backend}>
          Use this address
        </button>
        {!normalized ? (
          <p className="error-text">Use an address like http://127.0.0.1:8799 (no path).</p>
        ) : null}
        <p className="small muted wide">
          Only needed for the optional AI explanations. Nothing else talks to a server.
        </p>
      </form>
    </section>
  );
}

export function About() {
  return (
    <section aria-labelledby="about-h" className="prose">
      <h2 id="about-h">About ScriptAudit</h2>
      <p>
        ScriptAudit reviews a video or podcast script with four separate, deterministic audits:
        grounding, narrative structure, spoken readability and packaging. Every finding names its
        rule and explains it; where a rule has a mechanical fix you can preview the change side by
        side and apply or reject it. Every change is a new revision, and the original is always
        recoverable.
      </p>
      <h3>What it does not do</h3>
      <ul>
        <li>
          It does not check facts. Grounding only checks that assertive sentences link to claims you
          documented with a source and a quote.
        </li>
        <li>
          It does not predict views, click-through, watch time or retention, and it has no access to
          any platform.
        </li>
        <li>
          It never invents claims, sources or citations, and AI rewrites that add numbers, quotes,
          links or citations are discarded.
        </li>
        <li>
          It never changes your script on its own. Approved scripts are locked until you reopen
          them.
        </li>
      </ul>
      <h3>Privacy</h3>
      <p>
        Your script stays in this browser (localStorage). Nothing is uploaded unless you run the
        optional local backend, opt in for the session and choose findings to send for AI
        explanations.
      </p>
    </section>
  );
}
