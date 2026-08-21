import type { FlowNode as Node } from '@/lib/types';
import { nodeProgress } from '@/lib/types';
import { nodeH, nodeW } from '@/lib/edges';
import s from './FlowNode.module.css';

type State = 'done' | 'current' | 'todo';

/** 状态由数据推出来，不额外存一个字段：
 *  子步骤全勾完 = done，勾了一部分 = current，一条没勾 = todo。 */
function nodeState(n: Node): State {
  const p = nodeProgress(n);
  if (p === 1) return 'done';
  return p > 0 ? 'current' : 'todo';
}

function Check() {
  return (
    <svg width="9" height="9" viewBox="0 0 24 24" fill="none" stroke="var(--rf-on-gold)"
         strokeWidth="3.4" strokeLinecap="round" strokeLinejoin="round">
      <path d="M5 12.5l4.5 4.5L19 7" />
    </svg>
  );
}

function Box({ state, onClick }: { state: State; onClick?: () => void }) {
  const cls =
    state === 'done' ? `${s.box} ${s.boxDone}` :
    state === 'current' ? `${s.box} ${s.boxCurrent}` : `${s.box} ${s.boxTodo}`;
  return (
    <span
      className={cls}
      role="checkbox"
      aria-checked={state === 'done'}
      onClick={e => { e.stopPropagation(); onClick?.(); }}
    >
      {state === 'done' ? <Check /> : state === 'current' ? <i /> : null}
    </span>
  );
}

/** 脚注号。三种形状共用 —— 之前只矩形有，起止和判断写了附注也看不见。 */
function Footnote({ n, active, onOpen }: { n: number; active?: boolean; onOpen?: () => void }) {
  return (
    <sup
      className={`${s.fn} ${active ? s.fnActive : ''}`}
      title="移上来看，点一下钉住"
      onClick={e => { e.stopPropagation(); onOpen?.(); }}
    >
      {String(n).padStart(2, '0')}
    </sup>
  );
}

export function FlowNode({
  node, footnote, activeFootnote, onSelect, onToggle, onOpenNote, terminal, onDragStart, onMarkerHover, panMode,
}: {
  node: Node;
  footnote?: number;
  activeFootnote?: boolean;
  onSelect?: (id: string) => void;
  onToggle?: (id: string) => void;
  onOpenNote?: (id: string) => void;
  /** 起止条上印 START 还是 END —— 由它在图里的位置决定，不能绑 id */
  terminal?: 'start' | 'end';
  onDragStart?: (id: string, e: React.PointerEvent) => void;
  onMarkerHover?: (id: string | null) => void;
  /** 空格按住时整个画布进入拖动模式，节点要让路，不然拖不动画布 */
  panMode?: boolean;
}) {
  const pos = { left: node.x ?? 0, top: node.y ?? 0 };

  /* 判断 —— 菱形 */
  if (node.shape === 'decision') {
    const w = nodeW(node), h = nodeH(node);
    return (
      <div data-node className={s.diamond} style={{ ...pos, width: w, height: h }} onClick={() => onSelect?.(node.id)}
           onMouseEnter={footnote !== undefined ? () => onMarkerHover?.(node.id) : undefined}
           onMouseLeave={footnote !== undefined ? () => onMarkerHover?.(null) : undefined}
           onPointerDown={e => {
        // 这两句缺一不可：不 preventDefault，浏览器会把这次按下当成「选中文字」，
        // 拖出几十像素就把手势抢走；不 setPointerCapture，鼠标一旦移出节点范围就收不到事件。
        if (panMode) return;   // 让给画布
        e.preventDefault();
        e.stopPropagation();
        e.currentTarget.setPointerCapture(e.pointerId);
        onDragStart?.(node.id, e);
      }}>
        <svg viewBox={`0 0 ${w} ${h}`} preserveAspectRatio="none">
          <polygon points={`${w/2},1.5 ${w-1.5},${h/2} ${w/2},${h-1.5} 1.5,${h/2}`}
                   fill="var(--rf-paper)" stroke="var(--rf-ink)" strokeWidth="1" strokeLinejoin="miter" />
        </svg>
        <span className={s.diamondText}>
          {node.title}
          {footnote !== undefined && (
            <Footnote n={footnote} active={activeFootnote} onOpen={() => onOpenNote?.(node.id)} />
          )}
        </span>
      </div>
    );
  }

  /* 起止 —— 黑色实心条 */
  if (node.shape === 'terminator') {
    return (
      <div data-node className={`${s.node} ${s.terminator}`} style={pos} onClick={() => onSelect?.(node.id)}
           onMouseEnter={footnote !== undefined ? () => onMarkerHover?.(node.id) : undefined}
           onMouseLeave={footnote !== undefined ? () => onMarkerHover?.(null) : undefined}
           onPointerDown={e => {
        // 这两句缺一不可：不 preventDefault，浏览器会把这次按下当成「选中文字」，
        // 拖出几十像素就把手势抢走；不 setPointerCapture，鼠标一旦移出节点范围就收不到事件。
        if (panMode) return;   // 让给画布
        e.preventDefault();
        e.stopPropagation();
        e.currentTarget.setPointerCapture(e.pointerId);
        onDragStart?.(node.id, e);
      }}>
        <span className={s.title}>
          {node.title}
          {footnote !== undefined && (
            <Footnote n={footnote} active={activeFootnote} onOpen={() => onOpenNote?.(node.id)} />
          )}
        </span>
        <span className={s.endLabel}>{terminal === 'end' ? 'END' : 'START'}</span>
      </div>
    );
  }

  /* 处理 —— 单行矩形 */
  const state = nodeState(node);
  const cls = [
    s.node,
    node.muted && s.muted,
    state === 'current' && s.current,
    state === 'done' && s.done,
  ].filter(Boolean).join(' ');

  return (
    <div
      data-node
      className={cls}
      style={pos}
      onClick={() => onSelect?.(node.id)}
      onPointerDown={e => {
        // 这两句缺一不可：不 preventDefault，浏览器会把这次按下当成「选中文字」，
        // 拖出几十像素就把手势抢走；不 setPointerCapture，鼠标一旦移出节点范围就收不到事件。
        if (panMode) return;   // 让给画布
        e.preventDefault();
        e.stopPropagation();
        e.currentTarget.setPointerCapture(e.pointerId);
        onDragStart?.(node.id, e);
      }}
      /* 有附注的节点，鼠标移到哪儿都弹 —— 不该要求瞄准那个小上标 */
      onMouseEnter={footnote !== undefined ? () => onMarkerHover?.(node.id) : undefined}
      onMouseLeave={footnote !== undefined ? () => onMarkerHover?.(null) : undefined}
    >
      {!node.muted && <Box state={state} onClick={() => onToggle?.(node.id)} />}
      <span className={s.title}>
        {node.title}
        {footnote !== undefined && (
          <Footnote n={footnote} active={activeFootnote} onOpen={() => onOpenNote?.(node.id)} />
        )}
      </span>
      {state === 'current' ? (
        <span className={s.nowTag}>NOW</span>
      ) : node.owner ? (
        <span className={s.meta}>
          {node.owner}{node.days ? <> <span className={s.pipe}>|</span> {node.days}D</> : null}
        </span>
      ) : null}
    </div>
  );
}
