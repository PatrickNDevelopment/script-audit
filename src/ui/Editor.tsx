/** Import, the editor, structure outline with duration, approval status and exports. */
import { useId, useMemo, useState } from 'react';
import {
  analyze,
  countWords,
  current,
  duration,
  formatDuration,
  LIMITS,
  narrationText,
  parseWorkspaceJson,
  revisionMarkdown,
  splitTitle,
  type Workspace,
} from '../engine';
import { download, slug } from '../lib/files';

export interface Draft {
  title: string;
  text: string;
}

function ImportPanel(props: {
  hasScript: boolean;
  onImport: (title: string, text: string, from: string) => void;
  onWorkspace: (ws: Workspace, from: string) => void;
  onSample: () => void;
}) {
  const fileId = useId();
  const wsId = useId();
  const [paste, setPaste] = useState('');
  const [errors, setErrors] = useState<string[]>([]);
  const [pending, setPending] = useState<null | (() => void)>(null);

  const guard = (action: () => void) => (props.hasScript ? setPending(() => action) : action());

  async function onFile(e: React.ChangeEvent<HTMLInputElement>) {
    const input = e.currentTarget;
    const f = input.files?.[0];
    input.value = '';
    if (!f) return;
    if (f.size > LIMITS.markdownBytes) return setErrors(['The file is larger than 2 MB.']);
    const raw = await f.text();
    if (raw.includes('\u0000'))
      return setErrors([
        'The file contains NUL characters; it does not look like a text or Markdown file.',
      ]);
    const { title, text } = splitTitle(raw);
    if (text.trim() === '') return setErrors(['The file has no script text.']);
    if (text.length > LIMITS.textChars)
      return setErrors([
        `The script is longer than ${LIMITS.textChars.toLocaleString('en-US')} characters.`,
      ]);
    setErrors([]);
    guard(() => props.onImport(title || f.name.replace(/\.(md|markdown|txt)$/i, ''), text, f.name));
  }

  async function onWs(e: React.ChangeEvent<HTMLInputElement>) {
    const input = e.currentTarget;
    const f = input.files?.[0];
    input.value = '';
    if (!f) return;
    if (f.size > LIMITS.workspaceBytes) return setErrors(['The file is larger than 20 MB.']);
    const r = parseWorkspaceJson(await f.text());
    if (!r.ok) return setErrors(['The workspace was not opened:', ...r.errors]);
    setErrors([]);
    guard(() => props.onWorkspace(r.workspace, f.name));
  }

  return (
    <section className="card" aria-labelledby="import-h">
      <h2 id="import-h">{props.hasScript ? 'Import another script' : 'Start with a script'}</h2>
      <div className="import-grid">
        <div>
          <label htmlFor="paste-area">
            Paste a draft (plain text or Markdown; a first line "# Title" becomes the title)
          </label>
          <textarea
            id="paste-area"
            rows={6}
            value={paste}
            onChange={(e) => setPaste(e.target.value)}
          />
          <button
            type="button"
            disabled={paste.trim() === ''}
            onClick={() => {
              const { title, text } = splitTitle(paste);
              if (text.length > LIMITS.textChars)
                return setErrors([
                  `The script is longer than ${LIMITS.textChars.toLocaleString('en-US')} characters.`,
                ]);
              setErrors([]);
              guard(() => {
                props.onImport(title, text, 'pasted text');
                setPaste('');
              });
            }}
          >
            Import pasted text
          </button>
        </div>
        <div className="stack">
          <label htmlFor={fileId}>
            Markdown or text file
            <input
              id={fileId}
              type="file"
              accept=".md,.markdown,.txt,text/markdown,text/plain"
              onChange={onFile}
            />
          </label>
          <label htmlFor={wsId}>
            Workspace file (.json, with history and claims)
            <input id={wsId} type="file" accept=".json,application/json" onChange={onWs} />
          </label>
          <button type="button" className="secondary" onClick={() => guard(props.onSample)}>
            Load the sample script
          </button>
        </div>
      </div>
      {pending ? (
        <div className="notice warn" role="alert">
          <p>
            This replaces the current script, its history, claims and decisions in this browser.
            Export the workspace first if you want to keep them.
          </p>
          <button
            type="button"
            className="danger"
            onClick={() => {
              pending();
              setPending(null);
            }}
          >
            Replace
          </button>{' '}
          <button type="button" className="secondary" onClick={() => setPending(null)}>
            Cancel
          </button>
        </div>
      ) : null}
      {errors.length ? (
        <div className="notice danger" role="alert">
          {errors.map((e, i) => (
            <p key={i}>{e}</p>
          ))}
        </div>
      ) : null}
    </section>
  );
}

export function Editor(props: {
  ws: Workspace | null;
  draft: Draft | null;
  onDraft: (d: Draft | null) => void;
  onSave: () => void;
  onImport: (title: string, text: string, from: string) => void;
  onWorkspace: (ws: Workspace, from: string) => void;
  onSample: () => void;
  onStatus: (s: Workspace['status']) => void;
  onWpm: (wpm: number) => void;
  onExportReport: () => void;
}) {
  const { ws, draft } = props;
  const rev = ws ? current(ws) : null;
  const title = draft?.title ?? rev?.title ?? '';
  const text = draft?.text ?? rev?.text ?? '';
  const dirty = !!draft && !!rev && (draft.title !== rev.title || draft.text !== rev.text);
  const a = useMemo(() => analyze(text), [text]);
  const wpm = ws?.settings.wpm ?? 150;
  const d = useMemo(() => duration(a, wpm), [a, wpm]);
  const approved = ws?.status === 'approved';

  if (!ws || !rev) {
    return (
      <section aria-labelledby="editor-h">
        <h2 id="editor-h" className="sr-only">
          Editor
        </h2>
        <div className="card empty">
          <p>
            <strong>No script yet.</strong> Paste or import a draft, or open the invented sample
            script. Everything stays in this browser.
          </p>
        </div>
        <ImportPanel
          hasScript={false}
          onImport={props.onImport}
          onWorkspace={props.onWorkspace}
          onSample={props.onSample}
        />
      </section>
    );
  }

  return (
    <section aria-labelledby="editor-h">
      <div className="row-between">
        <h2 id="editor-h">Editor</h2>
        <div className="inline-group">
          <span className={`badge status-${ws.status}`} data-testid="status">
            {approved ? 'Approved: locked' : 'Draft'}
          </span>
          {approved ? (
            <button type="button" className="secondary" onClick={() => props.onStatus('draft')}>
              Reopen for editing
            </button>
          ) : (
            <button
              type="button"
              className="secondary"
              disabled={dirty}
              title={dirty ? 'Save or discard your edits first' : undefined}
              onClick={() => props.onStatus('approved')}
            >
              Approve script
            </button>
          )}
        </div>
      </div>
      {approved ? (
        <p className="notice info">
          This script is approved. It is read-only here and no suggestion can change it until you
          reopen it.
        </p>
      ) : null}
      <div className="editor-grid">
        <div className="card">
          <label htmlFor="title-input">Title</label>
          <input
            id="title-input"
            value={title}
            maxLength={LIMITS.titleChars}
            readOnly={approved}
            onChange={(e) => props.onDraft({ title: e.target.value, text })}
          />
          <label htmlFor="script-input">
            Script (revision {rev.n}
            {dirty ? ', unsaved changes' : ''})
          </label>
          <textarea
            id="script-input"
            className="script"
            rows={22}
            spellCheck
            value={text}
            readOnly={approved}
            onChange={(e) => props.onDraft({ title, text: e.target.value })}
          />
          <div className="inline-group">
            <button type="button" disabled={!dirty || approved} onClick={props.onSave}>
              Save as revision {rev.n + 1}
            </button>
            <button
              type="button"
              className="secondary"
              disabled={!dirty}
              onClick={() => props.onDraft(null)}
            >
              Discard edits
            </button>
            <span className="small muted">
              {text.length.toLocaleString('en-US')} / {LIMITS.textChars.toLocaleString('en-US')}{' '}
              characters
            </span>
          </div>
          <details className="small">
            <summary>Markup you can use</summary>
            <ul>
              <li>
                <code>## Heading</code> starts a section; blank lines separate beats.
              </li>
              <li>
                <code>[c:claim-id]</code> links a sentence to a claim in the Claims page.
              </li>
              <li>
                <code>{'{setup:key}'}</code> and <code>{'{payoff:key}'}</code> mark a promise and
                where it is resolved.
              </li>
            </ul>
          </details>
        </div>
        <aside className="card" aria-labelledby="outline-h">
          <h3 id="outline-h">Structure and timing</h3>
          <label htmlFor="wpm">
            Narration speed: <strong>{wpm}</strong> words per minute
          </label>
          <input
            id="wpm"
            type="range"
            min={100}
            max={220}
            step={5}
            value={wpm}
            onChange={(e) => props.onWpm(Number(e.target.value))}
          />
          <p data-testid="totals">
            <strong>{d.words.toLocaleString('en-US')}</strong> spoken words · about{' '}
            <strong>{formatDuration(d.seconds)}</strong>
          </p>
          <p className="small muted">
            An estimate from word count, speed and pauses at punctuation and breaks.
          </p>
          <ol className="outline">
            {a.sections.map((s) => {
              const beats = a.beats.filter((b) => b.section === s.index);
              const part = d.sections[s.index];
              return (
                <li key={s.index}>
                  <strong>{s.heading}</strong>
                  <span className="small muted">
                    {' '}
                    · {beats.length} beat{beats.length === 1 ? '' : 's'} · {part?.words ?? 0} words
                    · {formatDuration(part?.seconds ?? 0)}
                  </span>
                  <ol className="beats">
                    {beats.map((b, i) => {
                      const first = a.masked
                        .slice(b.start, b.end)
                        .trim()
                        .split(/\s+/)
                        .slice(0, 7)
                        .join(' ');
                      return (
                        <li key={i} className="small">
                          {first}…{' '}
                          <span className="muted">
                            ({countWords(a.masked.slice(b.start, b.end))} words)
                          </span>
                        </li>
                      );
                    })}
                  </ol>
                </li>
              );
            })}
          </ol>
        </aside>
      </div>
      <section className="card" aria-labelledby="export-h">
        <h3 id="export-h">Export revision {rev.n}</h3>
        {dirty ? (
          <p className="small warn-text">Exports use the saved revision, not your unsaved edits.</p>
        ) : null}
        <div className="inline-group">
          <button
            type="button"
            onClick={() =>
              download(`${slug(rev.title)}-r${rev.n}.md`, revisionMarkdown(rev), 'text/markdown')
            }
          >
            Download Markdown
          </button>
          <button
            type="button"
            className="secondary"
            onClick={() =>
              download(
                `${slug(rev.title)}-r${rev.n}-narration.txt`,
                narrationText(rev, ws),
                'text/plain',
              )
            }
          >
            Download narration text
          </button>
          <button type="button" className="secondary" onClick={props.onExportReport}>
            Download audit report
          </button>
          <button
            type="button"
            className="secondary"
            onClick={() =>
              download(
                `${slug(rev.title)}-workspace.json`,
                `${JSON.stringify(ws, null, 2)}\n`,
                'application/json',
              )
            }
          >
            Export workspace JSON
          </button>
        </div>
      </section>
      <ImportPanel
        hasScript
        onImport={props.onImport}
        onWorkspace={props.onWorkspace}
        onSample={props.onSample}
      />
    </section>
  );
}
