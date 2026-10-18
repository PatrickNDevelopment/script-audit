/** The four audits, each run separately, with per-finding preview, apply, reject and restore. */
import { useState } from 'react';
import {
  AUDIT_NAMES,
  AUDITS,
  diffText,
  preview,
  RULES,
  suggestionOf,
  type AuditId,
  type Finding,
  type Revision,
  type Suggestion,
  type Workspace,
} from '../engine';
import { DiffView } from './DiffView';

const NOTES: Record<AuditId, string> = {
  grounding:
    'Flags sentences that sound like checkable facts (numbers, superlatives, attributions) and checks they link to a claim with a source and quote. It cannot tell whether anything is true.',
  narrative:
    'Repetition, setups without payoffs, long stretches of exposition and abrupt section changes. Rules, not taste.',
  spoken:
    'Long sentences, repeated words, places to breathe, pronunciation and spacing, for reading aloud.',
  packaging:
    'Title and hook alignment and sensational phrasing. Writing suggestions only: they do not predict views, click-through or retention.',
};

export interface Coverage {
  assertions: number;
  covered: number;
}

/** Text around a change, for previews: the paragraph(s) it touches. */
export function contextWindow(
  text: string,
  start: number,
  end: number,
): { from: number; to: number } {
  const i = text.lastIndexOf('\n\n', Math.max(0, start - 1));
  const e = text.indexOf('\n\n', end);
  return { from: i < 0 ? 0 : i + 2, to: e < 0 ? text.length : e };
}

export function SuggestionPreview(props: { rev: Revision; s: Suggestion; testId?: string }) {
  const next = preview(props.rev, props.s);
  if (!next)
    return (
      <p className="notice warn">
        This suggestion no longer matches the current text (it is stale). Re-run the audit.
      </p>
    );
  if (props.s.target === 'title') {
    return (
      <DiffView
        ops={diffText(props.rev.title, next.title)}
        oldLabel="Title now"
        newLabel="Title after"
        testId={props.testId}
      />
    );
  }
  const w = contextWindow(props.rev.text, props.s.start, props.s.end);
  const delta = props.s.replacement.length - (props.s.end - props.s.start);
  const ops = diffText(props.rev.text.slice(w.from, w.to), next.text.slice(w.from, w.to + delta));
  return (
    <DiffView
      ops={ops}
      oldLabel={`Revision ${props.rev.n}`}
      newLabel="After this change"
      testId={props.testId}
    />
  );
}

function Excerpt(props: { text: string; f: Finding }) {
  const { f } = props;
  if (f.target === 'title')
    return <blockquote className="excerpt">Title: “{f.excerpt || '(empty)'}”</blockquote>;
  const before = props.text.slice(Math.max(0, f.start - 60), f.start);
  const after = props.text.slice(f.end, f.end + 60);
  const body =
    f.excerpt.length > 500 ? `${f.excerpt.slice(0, 240)} … ${f.excerpt.slice(-200)}` : f.excerpt;
  return (
    <blockquote className="excerpt">
      {f.start > 60 ? '…' : ''}
      {before.replace(/\n/g, ' ')}
      <mark>{body.replace(/ {2,}/g, (m) => '␣'.repeat(m.length)).replace(/\n/g, ' ')}</mark>
      {after.replace(/\n/g, ' ')}
      {f.end + 60 < props.text.length ? '…' : ''}
    </blockquote>
  );
}

export function blockReason(ws: Workspace, dirty: boolean): string | null {
  if (ws.status === 'approved')
    return 'The script is approved; reopen it in the Editor to apply changes.';
  if (dirty) return 'You have unsaved edits in the Editor. Save or discard them first.';
  return null;
}

function FindingCard(props: {
  f: Finding;
  rev: Revision;
  rejected: boolean;
  block: string | null;
  onApply: (s: Suggestion) => void;
  onReject: (key: string) => void;
  onRestore: (key: string) => void;
  onGlossary: (term: string, say: string) => void;
}) {
  const { f } = props;
  const [show, setShow] = useState(false);
  const [say, setSay] = useState('');
  const s = suggestionOf(f);
  const rule = RULES[f.rule];
  return (
    <li
      className={`finding${props.rejected ? ' rejected' : ''}`}
      data-key={f.key}
      data-rule={f.rule}
    >
      <div className="row-between">
        <h4>
          <span className="badge rule">{f.rule}</span> {rule?.name ?? f.rule}
          {f.target === 'title' ? <span className="badge">title</span> : null}
          {props.rejected ? <span className="badge">rejected</span> : null}
        </h4>
      </div>
      <p>{f.message}</p>
      <Excerpt text={props.rev.text} f={f} />
      <details className="small">
        <summary>Why this rule?</summary>
        <p>{rule?.explanation}</p>
        {f.triggers.length ? (
          <p>Triggered by: {f.triggers.map((t) => `“${t}”`).join(', ')}</p>
        ) : null}
      </details>
      {props.rejected ? (
        <button type="button" className="secondary small" onClick={() => props.onRestore(f.key)}>
          Restore
        </button>
      ) : (
        <div className="inline-group">
          {s ? (
            <>
              <button
                type="button"
                className="secondary small"
                aria-expanded={show}
                onClick={() => setShow(!show)}
              >
                {show ? 'Hide change' : 'Preview change'}
              </button>
              <button
                type="button"
                className="small"
                disabled={props.block !== null}
                title={props.block ?? undefined}
                onClick={() => props.onApply(s)}
              >
                Apply: {s.label}
              </button>
            </>
          ) : (
            <span className="small muted">
              {f.audit === 'grounding'
                ? 'No automatic fix: link a claim or rewrite it yourself.'
                : 'No automatic fix for this rule.'}
            </span>
          )}
          <button type="button" className="secondary small" onClick={() => props.onReject(f.key)}>
            Reject
          </button>
        </div>
      )}
      {show && s ? <SuggestionPreview rev={props.rev} s={s} testId="finding-diff" /> : null}
      {f.rule === 'S4' && !props.rejected ? (
        <form
          className="inline-group glossary-add"
          onSubmit={(e) => {
            e.preventDefault();
            if (say.trim()) props.onGlossary(f.excerpt.replace(/['’]s$/, ''), say.trim());
          }}
        >
          <label className="inline small">
            Say “{f.excerpt}” as
            <input value={say} maxLength={200} onChange={(e) => setSay(e.target.value)} />
          </label>
          <button type="submit" className="secondary small" disabled={!say.trim()}>
            Add to glossary
          </button>
        </form>
      ) : null}
    </li>
  );
}

export function Audits(props: {
  ws: Workspace;
  rev: Revision;
  dirty: boolean;
  results: Partial<Record<AuditId, Finding[]>>;
  coverage: Coverage | null;
  tab: AuditId;
  onTab: (a: AuditId) => void;
  onRun: (a: AuditId) => void;
  onApply: (s: Suggestion) => void;
  onReject: (key: string) => void;
  onRestore: (key: string) => void;
  onGlossary: (term: string, say: string) => void;
}) {
  const { ws, rev, tab } = props;
  const findings = props.results[tab];
  const block = blockReason(ws, props.dirty);
  const open = findings?.filter((f) => !ws.rejected.includes(f.key)) ?? [];
  const rejected = findings?.filter((f) => ws.rejected.includes(f.key)) ?? [];
  return (
    <section aria-labelledby="audits-h">
      <h2 id="audits-h">Audits</h2>
      {props.dirty ? (
        <p className="notice warn">
          You have unsaved edits in the Editor. Audits use the saved revision {rev.n}.
        </p>
      ) : null}
      <div role="tablist" aria-label="Audits" className="tabs">
        {AUDITS.map((a) => {
          const r = props.results[a];
          const n = r ? r.filter((f) => !ws.rejected.includes(f.key)).length : null;
          return (
            <button
              key={a}
              type="button"
              role="tab"
              id={`tab-${a}`}
              aria-selected={tab === a}
              aria-controls={`panel-${a}`}
              className={tab === a ? 'tab active' : 'tab'}
              onClick={() => props.onTab(a)}
            >
              {AUDIT_NAMES[a]} <span className="badge">{n === null ? 'not run' : n}</span>
            </button>
          );
        })}
      </div>
      <div role="tabpanel" id={`panel-${tab}`} aria-labelledby={`tab-${tab}`} className="card">
        <p className="small muted">{NOTES[tab]}</p>
        {findings === undefined ? (
          <button type="button" onClick={() => props.onRun(tab)}>
            Run {AUDIT_NAMES[tab].toLowerCase()} audit
          </button>
        ) : (
          <>
            <p data-testid={`summary-${tab}`}>
              <strong>{open.length}</strong> open finding{open.length === 1 ? '' : 's'}
              {rejected.length ? `, ${rejected.length} rejected` : ''} on revision {rev.n}. The
              audit re-runs on every new revision.
              {tab === 'grounding' && props.coverage ? (
                <>
                  {' '}
                  Covered assertions:{' '}
                  <strong data-testid="coverage">
                    {props.coverage.covered} of {props.coverage.assertions}
                  </strong>
                  .
                </>
              ) : null}
            </p>
            {open.length === 0 ? <p className="ok-text">No open findings for this audit.</p> : null}
            <ol className="findings">
              {open.map((f) => (
                <FindingCard
                  key={f.key}
                  f={f}
                  rev={rev}
                  rejected={false}
                  block={block}
                  onApply={props.onApply}
                  onReject={props.onReject}
                  onRestore={props.onRestore}
                  onGlossary={props.onGlossary}
                />
              ))}
            </ol>
            {rejected.length ? (
              <details>
                <summary>Rejected ({rejected.length})</summary>
                <ol className="findings">
                  {rejected.map((f) => (
                    <FindingCard
                      key={f.key}
                      f={f}
                      rev={rev}
                      rejected
                      block={block}
                      onApply={props.onApply}
                      onReject={props.onReject}
                      onRestore={props.onRestore}
                      onGlossary={props.onGlossary}
                    />
                  ))}
                </ol>
              </details>
            ) : null}
          </>
        )}
      </div>
    </section>
  );
}
