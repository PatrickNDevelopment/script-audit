import { useEffect, useMemo, useState } from 'react';
import {
  applySuggestion,
  AUDITS,
  auditReport,
  commitEdit,
  current,
  grounding,
  narrative,
  newWorkspace,
  packaging,
  reject,
  REASONS,
  restore,
  revertTo,
  sampleWorkspace,
  setStatus,
  spoken,
  undo,
  type AuditId,
  type ChangeResult,
  type Finding,
  type Suggestion,
  type Workspace,
} from './engine';
import { download, slug } from './lib/files';
import { loadBackendUrl, loadWorkspace, saveBackendUrl, saveWorkspace } from './lib/storage';
import { AiPanel } from './ui/AiPanel';
import { Audits, blockReason, type Coverage } from './ui/Audits';
import { Claims } from './ui/Claims';
import { Editor, type Draft } from './ui/Editor';
import { Compare, History } from './ui/History';
import { About, Settings } from './ui/Settings';

type Route = 'editor' | 'audits' | 'claims' | 'history' | 'compare' | 'settings' | 'about';
const ROUTES: { id: Route; label: string }[] = [
  { id: 'editor', label: 'Editor' },
  { id: 'audits', label: 'Audits' },
  { id: 'claims', label: 'Claims' },
  { id: 'history', label: 'History' },
  { id: 'compare', label: 'Compare' },
  { id: 'settings', label: 'Settings' },
  { id: 'about', label: 'About' },
];

function routeFromHash(): Route {
  const h = window.location.hash.replace(/^#\/?/, '');
  return ROUTES.some((r) => r.id === h) ? (h as Route) : 'editor';
}

const now = (): string => new Date().toISOString();

function boot(): { ws: Workspace | null; recovered: { raw: string; errors: string[] } | null } {
  const r = loadWorkspace();
  if (r.kind === 'ok') return { ws: r.workspace, recovered: null };
  if (r.kind === 'recovered') return { ws: null, recovered: { raw: r.raw, errors: r.errors } };
  return { ws: null, recovered: null };
}

export function App() {
  const [start] = useState(boot);
  const [ws, setWs] = useState<Workspace | null>(start.ws);
  const [recovered, setRecovered] = useState(start.recovered);
  const [draft, setDraft] = useState<Draft | null>(null);
  const [ran, setRan] = useState<AuditId[]>([]);
  const [tab, setTab] = useState<AuditId>('grounding');
  const [route, setRoute] = useState<Route>(routeFromHash);
  const [message, setMessage] = useState('');
  const [storageError, setStorageError] = useState<string | null>(null);
  const [backend, setBackend] = useState(loadBackendUrl);
  const [pair, setPair] = useState<{ a: number; b: number } | null>(null);

  useEffect(() => {
    const on = () => setRoute(routeFromHash());
    window.addEventListener('hashchange', on);
    return () => window.removeEventListener('hashchange', on);
  }, []);
  useEffect(() => {
    document.title = `${ROUTES.find((r) => r.id === route)?.label ?? ''} · ScriptAudit`;
  }, [route]);

  const rev = ws ? current(ws) : null;
  const dirty = !!draft && !!rev && (draft.title !== rev.title || draft.text !== rev.text);

  const ground = useMemo(
    () => (rev && ws && ran.includes('grounding') ? grounding(rev.text, ws.claims) : null),
    [rev, ws, ran],
  );
  const results = useMemo(() => {
    const out: Partial<Record<AuditId, Finding[]>> = {};
    if (!rev || !ws) return out;
    if (ground) out.grounding = ground.findings;
    if (ran.includes('narrative')) out.narrative = narrative(rev.text);
    if (ran.includes('spoken')) out.spoken = spoken(rev.text, ws.glossary, ws.settings);
    if (ran.includes('packaging')) out.packaging = packaging(rev.title, rev.text, ws.claims);
    return out;
  }, [rev, ws, ran, ground]);
  const coverage: Coverage | null = ground
    ? { assertions: ground.assertions, covered: ground.covered }
    : null;

  function commit(next: Workspace | null, msg: string) {
    setWs(next);
    setStorageError(saveWorkspace(next));
    if (msg) setMessage(msg);
  }

  function change(r: ChangeResult, msg: string) {
    if (r.ok) commit(r.ws, msg);
    else setMessage(REASONS[r.reason]);
  }

  function replaceAll(next: Workspace, msg: string) {
    setDraft(null);
    setRan([]);
    setPair(null);
    commit(next, msg);
    window.location.assign('#/editor');
  }

  function onApply(s: Suggestion) {
    if (!ws) return;
    const block = blockReason(ws, dirty);
    if (block) return setMessage(block);
    const r = applySuggestion(ws, s, now());
    change(
      r,
      r.ok
        ? `Applied ${s.label}. Revision ${current(r.ws)?.n} created; use Undo in History to go back.`
        : '',
    );
  }

  const anyRun = AUDITS.some((a) => results[a] !== undefined);
  const openFindings = AUDITS.flatMap((a) => results[a] ?? []).filter(
    (f) => !ws?.rejected.includes(f.key),
  );

  return (
    <div className="app">
      <a
        className="skip"
        href="#main"
        onClick={(e) => {
          e.preventDefault();
          document.getElementById('main')?.focus();
        }}
      >
        Skip to content
      </a>
      <header className="top">
        <div className="brand">
          <h1>ScriptAudit</h1>
          <p className="small muted">
            Four separate script audits, suggestions you accept one by one
          </p>
        </div>
        <nav aria-label="Sections">
          <ul>
            {ROUTES.map((r) => (
              <li key={r.id}>
                <a href={`#/${r.id}`} aria-current={route === r.id ? 'page' : undefined}>
                  {r.label}
                </a>
              </li>
            ))}
          </ul>
        </nav>
      </header>
      {ws?.sample ? (
        <div className="sample-banner" role="note" data-testid="sample-banner">
          <strong>Sample script.</strong> The town, people, events, numbers and sources are invented
          for this demo.
        </div>
      ) : null}
      {recovered ? (
        <div className="notice danger" role="alert">
          <strong>The saved workspace could not be read and was not loaded.</strong> A copy was kept
          in browser storage.
          <ul>
            {recovered.errors.slice(0, 5).map((e, i) => (
              <li key={i}>{e}</li>
            ))}
          </ul>
          <button
            type="button"
            onClick={() =>
              download('script-audit-recovered.json', recovered.raw, 'application/json')
            }
          >
            Download the unreadable copy
          </button>{' '}
          <button type="button" className="secondary" onClick={() => setRecovered(null)}>
            Dismiss
          </button>
        </div>
      ) : null}
      {storageError ? (
        <div className="notice warn" role="alert">
          {storageError}
        </div>
      ) : null}
      <p className="status" role="status" aria-live="polite">
        {message}
      </p>
      <main id="main" tabIndex={-1}>
        {route === 'editor' ? (
          <Editor
            ws={ws}
            draft={draft}
            onDraft={setDraft}
            onSave={() => {
              if (!ws || !draft) return;
              const r = commitEdit(ws, draft.title, draft.text, now());
              if (r.ok) setDraft(null);
              change(r, r.ok ? `Saved revision ${current(r.ws)?.n}.` : '');
            }}
            onImport={(title, text, from) =>
              replaceAll(newWorkspace(title, text, now()), `Imported ${from} as revision 1.`)
            }
            onWorkspace={(next, from) =>
              replaceAll(next, `Opened workspace ${from} (${next.revisions.length} revisions).`)
            }
            onSample={() =>
              replaceAll(
                sampleWorkspace(now()),
                'Loaded the sample script (invented). Run the audits on the Audits page.',
              )
            }
            onStatus={(s) =>
              ws &&
              commit(
                setStatus(ws, s),
                s === 'approved'
                  ? 'Approved. The script is locked against changes.'
                  : 'Reopened for editing.',
              )
            }
            onWpm={(wpm) => ws && commit({ ...ws, settings: { ...ws.settings, wpm } }, '')}
            onExportReport={() => {
              if (!ws || !rev) return;
              const runs = Object.fromEntries(
                AUDITS.filter((a) => results[a]).map((a) => [
                  a,
                  { revision: rev.n, findings: results[a] as Finding[] },
                ]),
              );
              download(
                `${slug(rev.title)}-r${rev.n}-audit-report.md`,
                auditReport(rev, ws, runs, coverage),
                'text/markdown',
              );
              if (!anyRun)
                setMessage('The report lists audits that have not been run as "Not run".');
            }}
          />
        ) : null}
        {route !== 'editor' && route !== 'about' && route !== 'settings' && (!ws || !rev) ? (
          <div className="card empty">
            <p>No script yet. Start in the Editor.</p>
            <a href="#/editor">Go to the Editor</a>
          </div>
        ) : null}
        {route === 'audits' && ws && rev ? (
          <>
            <Audits
              ws={ws}
              rev={rev}
              dirty={dirty}
              results={results}
              coverage={coverage}
              tab={tab}
              onTab={setTab}
              onRun={(a) => {
                setRan((r) => (r.includes(a) ? r : [...r, a]));
                setMessage(`Ran the ${a} audit on revision ${rev.n}.`);
              }}
              onApply={onApply}
              onReject={(key) =>
                commit(
                  reject(ws, key),
                  'Rejected. The finding stays listed under "Rejected" and can be restored.',
                )
              }
              onRestore={(key) => commit(restore(ws, key), 'Restored the finding.')}
              onGlossary={(term, say) => {
                if (ws.glossary.some((g) => g.term.toLowerCase() === term.toLowerCase()))
                  return setMessage(`“${term}” is already in the glossary.`);
                commit(
                  { ...ws, glossary: [...ws.glossary, { term, say }] },
                  `Added “${term}” to the glossary.`,
                );
              }}
            />
            <AiPanel
              backend={backend}
              rev={rev}
              open={openFindings}
              block={blockReason(ws, dirty)}
              onApply={onApply}
            />
          </>
        ) : null}
        {route === 'claims' && ws && rev ? (
          <Claims
            claims={ws.claims}
            rev={rev}
            onChange={(claims, msg) => commit({ ...ws, claims }, msg)}
          />
        ) : null}
        {route === 'history' && ws ? (
          <History
            ws={ws}
            block={blockReason(ws, dirty)}
            onUndo={() => {
              const r = undo(ws, now());
              change(
                r,
                r.ok
                  ? `Undone. Revision ${current(r.ws)?.n} has the exact text of the revision before.`
                  : '',
              );
            }}
            onRevert={(n) => {
              const r = revertTo(ws, n, now());
              change(
                r,
                r.ok
                  ? `Reverted. Revision ${current(r.ws)?.n} has the exact text of revision ${n}.`
                  : '',
              );
            }}
            onCompare={(a, b) => {
              setPair({ a, b });
              window.location.assign('#/compare');
            }}
          />
        ) : null}
        {route === 'compare' && ws ? (
          <Compare
            ws={ws}
            a={pair?.a ?? 1}
            b={pair?.b ?? rev?.n ?? 1}
            onPick={(a, b) => setPair({ a, b })}
          />
        ) : null}
        {route === 'settings' ? (
          ws ? (
            <Settings
              settings={ws.settings}
              glossary={ws.glossary}
              backend={backend}
              onSettings={(s) => commit({ ...ws, settings: s }, '')}
              onGlossary={(g, msg) => commit({ ...ws, glossary: g }, msg)}
              onBackend={(url) => {
                setBackend(url);
                saveBackendUrl(url);
                setMessage(`Backend address set to ${url}.`);
              }}
            />
          ) : (
            <div className="card empty">
              <p>Settings belong to a script. Start in the Editor.</p>
              <a href="#/editor">Go to the Editor</a>
            </div>
          )
        ) : null}
        {route === 'about' ? <About /> : null}
      </main>
      <footer className="foot small muted">
        <p>
          Deterministic writing checks. They do not verify facts or predict views, click-through or
          retention. Your script stays in this browser. <a href="#/about">About</a>
        </p>
      </footer>
    </div>
  );
}
