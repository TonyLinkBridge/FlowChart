import type { FlowDoc } from '@/lib/types';
import { ports } from '@/lib/edges';
import type { View } from '@/lib/viewport';
import s from './EdgeInsertControls.module.css';

/** 放在缩放层外：小按钮跟着连线走，但不会缩得点不中。 */
export function EdgeInsertControls({ doc, viewport, activeEdge = null, onHoverEdge, onInsert }: {
  doc: FlowDoc;
  viewport: View;
  activeEdge?: number | null;
  onHoverEdge?: (index: number | null) => void;
  onInsert: (index: number) => void;
}) {
  const byId = new Map(doc.nodes.map(n => [n.id, n]));
  const routes = doc.edges.map(edge => {
    const source = byId.get(edge.source), target = byId.get(edge.target);
    if (!source || !target) return null;
    const a = ports(source), b = ports(target);
    if (![a.x, a.y, b.x, b.y].every(Number.isFinite)) return null;
    const straight = Math.abs(a.cx - b.cx) < 4;
    return { source, target, a, b, straight, x: b.cx, y: ((straight ? a.bottom : a.mid) + b.top) / 2 };
  });
  return <div className={s.overlay}>
    {doc.edges.map((edge, index) => {
      const route = routes[index];
      if (!route) return null;
      const { source, target, a, b } = route;
      // 汇合线共用同一根竖线时，把动作放在各自的横线上，不能把两个按钮叠起来。
      const shared = routes.some((r, i) => i !== index && r && r.x === route.x && r.y === route.y);
      const x = shared && !route.straight ? ((b.cx > a.cx ? a.right : a.left) + b.cx) / 2 : route.x;
      const y = shared && !route.straight ? a.mid : route.y;
      const label = `插入一步：${source.title} → ${target.title}${edge.label ? `（${edge.label}）` : ''}`;
      return <button key={index} type="button" data-pop data-active={activeEdge === index} className={s.insert}
        style={{ left: viewport.x + x * viewport.z, top: viewport.y + y * viewport.z }}
        aria-label={label} title={label}
        onPointerEnter={() => onHoverEdge?.(index)} onPointerLeave={() => onHoverEdge?.(null)}
        onPointerDown={event => event.stopPropagation()}
        onKeyDown={event => {
          // 插入后焦点仍在按钮上，⌘/Ctrl+Z 必须继续交给原有撤销机制。
          if ((event.metaKey || event.ctrlKey) && ['z', 'y'].includes(event.key.toLowerCase())) return;
          event.stopPropagation();
          if (event.key === 'Escape') event.currentTarget.blur();
        }}
        onKeyUp={event => event.stopPropagation()}
        onClick={event => { event.stopPropagation(); onInsert(index); }}>
        <span aria-hidden="true">＋</span>
      </button>;
    })}
  </div>;
}
