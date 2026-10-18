/** Exports: the revision as Markdown, a narration sheet, and an audit report. */
import { ruleName } from './audits';
import { RULES } from './rules';
import { analyze, duration, formatDuration, mask } from './text';
import {
  AUDIT_NAMES,
  AUDITS,
  type AuditId,
  type Finding,
  type Revision,
  type Workspace,
} from './types';

export function revisionMarkdown(rev: Revision): string {
  const body = rev.text.endsWith('\n') ? rev.text : `${rev.text}\n`;
  return rev.title.trim() ? `# ${rev.title.trim()}\n\n${body}` : body;
}

/** Narration text: tags and Markdown markers removed, headings as cues, glossary appended. */
export function narrationText(rev: Revision, ws: Workspace): string {
  const a = analyze(rev.text);
  const lines: string[] = [];
  if (rev.title.trim()) lines.push(rev.title.trim(), '');
  const d = duration(a, ws.settings.wpm);
  lines.push(
    `Estimated length: ${formatDuration(d.seconds)} at ${ws.settings.wpm} words per minute (${d.words} words). This is an estimate.`,
    '',
  );
  for (const sec of a.sections) {
    const beats = a.beats.filter((b) => b.section === sec.index);
    if (!beats.length) continue;
    lines.push(`[${sec.heading}]`);
    for (const b of beats) {
      const spoken = mask(rev.text.slice(b.start, b.end))
        .replace(/[ \t]+/g, ' ')
        .replace(/ ?\n ?/g, ' ')
        .replace(/ ([,.;:!?…])/g, '$1')
        .trim();
      if (spoken) lines.push(spoken, '');
    }
  }
  const used = ws.glossary.filter((g) =>
    new RegExp(
      `(^|[^\\p{L}\\p{N}])${g.term.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}(?=$|[^\\p{L}\\p{N}])`,
      'iu',
    ).test(rev.text),
  );
  if (used.length) {
    lines.push('Pronunciation', ...used.map((g) => `- ${g.term}: ${g.say}`), '');
  }
  return `${lines.join('\n').trim()}\n`;
}

export interface AuditRun {
  revision: number;
  findings: Finding[];
}

function oneLine(s: string, max = 160): string {
  const t = s.replace(/\s+/g, ' ').trim();
  return t.length > max ? `${t.slice(0, max - 1)}…` : t;
}

export function auditReport(
  rev: Revision,
  ws: Workspace,
  runs: Partial<Record<AuditId, AuditRun>>,
  coverage: { assertions: number; covered: number } | null,
): string {
  const out: string[] = [
    `# Audit report: ${rev.title.trim() || 'Untitled script'}`,
    '',
    `Revision ${rev.n} (${rev.at}). Status: ${ws.status}.`,
    '',
    'These are deterministic writing checks. They do not verify facts and do not predict views, click-through or retention.',
    '',
  ];
  for (const id of AUDITS) {
    const run = runs[id];
    out.push(`## ${AUDIT_NAMES[id]}`, '');
    if (!run) {
      out.push('Not run.', '');
      continue;
    }
    if (run.revision !== rev.n)
      out.push(`Ran on revision ${run.revision}, not the current revision ${rev.n}.`, '');
    if (id === 'grounding' && coverage)
      out.push(`Covered assertions: ${coverage.covered} of ${coverage.assertions}.`, '');
    const open = run.findings.filter((f) => !ws.rejected.includes(f.key));
    const rejected = run.findings.length - open.length;
    out.push(`${open.length} open finding(s), ${rejected} rejected.`, '');
    for (const f of open) {
      out.push(
        `- **${f.rule} ${ruleName(f.rule)}**: ${f.message} ${f.target === 'title' ? '(title)' : ''} — "${oneLine(f.excerpt)}"`,
      );
    }
    if (open.length) out.push('');
  }
  out.push(
    '## Rules',
    '',
    ...Object.entries(RULES).map(([k, r]) => `- ${k} ${r.name}: ${r.explanation}`),
    '',
  );
  return out.join('\n');
}
