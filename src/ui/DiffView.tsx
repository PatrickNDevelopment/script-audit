/** Side-by-side diff. Deletions are struck through on the left, insertions underlined on the right. */
import { changeCount, type DiffOp } from '../engine';

function Side(props: { ops: DiffOp[]; side: 'old' | 'new'; label: string; testId?: string }) {
  const keep = props.side === 'old' ? 'del' : 'ins';
  return (
    <div className="diff-side">
      <h4>{props.label}</h4>
      <div className="diff-text" data-testid={props.testId}>
        {props.ops.map((o, i) =>
          o.type === 'eq' ? (
            <span key={i}>{o.text}</span>
          ) : o.type === keep ? (
            o.type === 'del' ? (
              <del key={i}>{o.text}</del>
            ) : (
              <ins key={i}>{o.text}</ins>
            )
          ) : null,
        )}
      </div>
    </div>
  );
}

export function DiffView(props: {
  ops: DiffOp[];
  oldLabel: string;
  newLabel: string;
  testId?: string;
}) {
  const c = changeCount(props.ops);
  return (
    <div className="diff" data-testid={props.testId}>
      <p className="small muted" aria-live="polite">
        {c.removed === 0 && c.added === 0 && !props.ops.some((o) => o.type !== 'eq')
          ? 'No differences.'
          : `${c.removed} word(s) removed, ${c.added} word(s) added (punctuation and spacing changes are highlighted too).`}
      </p>
      <div className="diff-grid">
        <Side
          ops={props.ops}
          side="old"
          label={props.oldLabel}
          testId={props.testId ? `${props.testId}-old` : undefined}
        />
        <Side
          ops={props.ops}
          side="new"
          label={props.newLabel}
          testId={props.testId ? `${props.testId}-new` : undefined}
        />
      </div>
    </div>
  );
}
