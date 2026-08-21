import type { FlowDoc } from '@/lib/types';
import { edgeLabelPos, edgePath } from '@/lib/edges';

export function FlowEdges({ doc, selectedEdge, onSelectEdge }: {
  doc: FlowDoc;
  selectedEdge?: number | null;
  onSelectEdge?: (i: number) => void;
}) {
  const by = new Map(doc.nodes.map(n => [n.id, n]));
  return (
    <>
      <svg style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', overflow: 'visible' }} fill="none">
        {doc.edges.map((e, i) => {
          const a = by.get(e.source), b = by.get(e.target);
          if (!a || !b) return null;
          const d = edgePath(a, b);
          const on = selectedEdge === i;
          return (
            <g key={i}>
              {/* 1px 的线太细点不中，叠一条透明粗线当热区 */}
              <path d={d} stroke="transparent" strokeWidth="12" style={{ cursor: 'pointer' }}
                    onClick={ev => { ev.stopPropagation(); onSelectEdge?.(i); }} />
              <path d={d} strokeWidth={on ? 2 : 1} pointerEvents="none"
                    stroke={on ? 'var(--rf-gold)' : e.dashed ? 'var(--rf-ink-4)' : 'var(--rf-ink)'}
                    strokeDasharray={e.dashed ? '4 4' : undefined} />
            </g>
          );
        })}
      </svg>
      {doc.edges.filter(e => e.label).map((e, i) => {
        const a = by.get(e.source), b = by.get(e.target);
        if (!a || !b) return null;
        const { x, y } = edgeLabelPos(a, b);
        return (
          <span key={i} style={{
            position: 'absolute', left: x - 10, top: y - 8,
            background: 'var(--rf-paper)', padding: '0 6px',
            fontFamily: 'var(--rf-mono)', fontSize: 10, letterSpacing: '0.5px',
            color: e.dashed ? 'var(--rf-ink-4)' : 'var(--rf-ink)',
          }}>{e.label}</span>
        );
      })}
    </>
  );
}
