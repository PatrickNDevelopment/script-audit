/** Shared types for audits, suggestions and the workspace. */

export type AuditId = 'grounding' | 'narrative' | 'spoken' | 'packaging';
export const AUDITS: readonly AuditId[] = ['grounding', 'narrative', 'spoken', 'packaging'];

export const AUDIT_NAMES: Record<AuditId, string> = {
  grounding: 'Grounding and citations',
  narrative: 'Narrative structure',
  spoken: 'Spoken readability',
  packaging: 'Packaging and marketability',
};

export interface Finding {
  /** `rule|excerpt|k`: stable across edits elsewhere in the text. */
  key: string;
  audit: AuditId;
  rule: string;
  target: 'text' | 'title';
  start: number;
  end: number;
  excerpt: string;
  message: string;
  /** Words that triggered the rule, shown so the user sees why. */
  triggers: string[];
  fix: { replacement: string; note: string } | null;
}

export interface Suggestion {
  key: string;
  target: 'text' | 'title';
  start: number;
  end: number;
  expected: string;
  replacement: string;
  label: string;
  source: 'audit' | 'ai';
}

export interface ClaimSource {
  citation: string;
  url: string;
  quote: string;
}

export interface Claim {
  id: string;
  statement: string;
  sources: ClaimSource[];
}

export interface GlossaryEntry {
  term: string;
  say: string;
}

export interface Settings {
  wpm: number;
  maxWords: number;
}

export const DEFAULT_SETTINGS: Settings = { wpm: 150, maxWords: 28 };

export type RevisionKind = 'import' | 'edit' | 'apply' | 'revert' | 'ai-apply';

export interface Revision {
  n: number;
  at: string;
  note: string;
  kind: RevisionKind;
  title: string;
  text: string;
}

export interface Workspace {
  schema: 'script-audit.workspace';
  version: 1;
  sample: boolean;
  status: 'draft' | 'approved';
  revisions: Revision[];
  claims: Claim[];
  glossary: GlossaryEntry[];
  /** finding key -> rejected */
  rejected: string[];
  settings: Settings;
}

export const LIMITS = {
  textChars: 200_000,
  titleChars: 200,
  revisions: 300,
  claims: 500,
  sourcesPerClaim: 10,
  glossary: 300,
  markdownBytes: 2_000_000,
  workspaceBytes: 20_000_000,
} as const;
