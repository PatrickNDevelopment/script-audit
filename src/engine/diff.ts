/**
 * Deterministic text diff for side-by-side comparison: lines first, then words inside changed
 * blocks. Common prefix and suffix are trimmed before the LCS, and the LCS table is bounded, so a
 * large script degrades to a coarser diff instead of hanging.
 */

export interface DiffOp {
  type: 'eq' | 'del' | 'ins';
  text: string;
}

const MAX_CELLS = 2_000_000;

function lcsOps(a: string[], b: string[]): DiffOp[] | null {
  const n = a.length;
  const m = b.length;
  if ((n + 1) * (m + 1) > MAX_CELLS) return null;
  const w = m + 1;
  const t = new Uint32Array((n + 1) * w);
  for (let i = n - 1; i >= 0; i -= 1) {
    for (let j = m - 1; j >= 0; j -= 1) {
      t[i * w + j] =
        a[i] === b[j]
          ? (t[(i + 1) * w + j + 1] as number) + 1
          : Math.max(t[(i + 1) * w + j] as number, t[i * w + j + 1] as number);
    }
  }
  const ops: DiffOp[] = [];
  let i = 0;
  let j = 0;
  while (i < n && j < m) {
    if (a[i] === b[j]) {
      ops.push({ type: 'eq', text: a[i] as string });
      i += 1;
      j += 1;
    } else if ((t[(i + 1) * w + j] as number) >= (t[i * w + j + 1] as number)) {
      ops.push({ type: 'del', text: a[i] as string });
      i += 1;
    } else {
      ops.push({ type: 'ins', text: b[j] as string });
      j += 1;
    }
  }
  while (i < n) ops.push({ type: 'del', text: a[i++] as string });
  while (j < m) ops.push({ type: 'ins', text: b[j++] as string });
  return ops;
}

function merge(ops: DiffOp[]): DiffOp[] {
  const out: DiffOp[] = [];
  for (const op of ops) {
    if (op.text === '') continue;
    const last = out[out.length - 1];
    if (last && last.type === op.type) last.text += op.text;
    else out.push({ ...op });
  }
  return out;
}

function diffTokens(a: string[], b: string[]): DiffOp[] {
  let p = 0;
  while (p < a.length && p < b.length && a[p] === b[p]) p += 1;
  let s = 0;
  while (s < a.length - p && s < b.length - p && a[a.length - 1 - s] === b[b.length - 1 - s])
    s += 1;
  const head: DiffOp[] = a.slice(0, p).map((text) => ({ type: 'eq', text }));
  const tail: DiffOp[] = a.slice(a.length - s).map((text) => ({ type: 'eq', text }));
  const ma = a.slice(p, a.length - s);
  const mb = b.slice(p, b.length - s);
  const mid = lcsOps(ma, mb) ?? [
    { type: 'del' as const, text: ma.join('') },
    { type: 'ins' as const, text: mb.join('') },
  ];
  return [...head, ...mid, ...tail];
}

export function wordTokens(s: string): string[] {
  return s.match(/\s+|[\p{L}\p{N}]+(?:['’][\p{L}\p{N}]+)*|[^\s\p{L}\p{N}]/gu) ?? [];
}

function lineTokens(s: string): string[] {
  return s.match(/[^\n]*\n|[^\n]+$/g) ?? [];
}

export function diffText(a: string, b: string): DiffOp[] {
  if (a === b) return a ? [{ type: 'eq', text: a }] : [];
  const lines = diffTokens(lineTokens(a), lineTokens(b));
  // Refine adjacent deleted/inserted line blocks to word level.
  const out: DiffOp[] = [];
  let i = 0;
  while (i < lines.length) {
    const op = lines[i] as DiffOp;
    if (op.type === 'eq') {
      out.push(op);
      i += 1;
      continue;
    }
    let del = '';
    let ins = '';
    while (i < lines.length && (lines[i] as DiffOp).type !== 'eq') {
      const o = lines[i] as DiffOp;
      if (o.type === 'del') del += o.text;
      else ins += o.text;
      i += 1;
    }
    out.push(...diffTokens(wordTokens(del), wordTokens(ins)));
  }
  return merge(out);
}

export function sideOf(ops: DiffOp[], side: 'old' | 'new'): string {
  return ops
    .filter((o) => o.type === 'eq' || o.type === (side === 'old' ? 'del' : 'ins'))
    .map((o) => o.text)
    .join('');
}

export function changeCount(ops: DiffOp[]): { added: number; removed: number } {
  const words = (s: string) => (s.match(/[\p{L}\p{N}]+/gu) ?? []).length;
  return {
    added: ops.filter((o) => o.type === 'ins').reduce((t, o) => t + words(o.text), 0),
    removed: ops.filter((o) => o.type === 'del').reduce((t, o) => t + words(o.text), 0),
  };
}
