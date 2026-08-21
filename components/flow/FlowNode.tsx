import type { CSSProperties } from 'react';
import type { FlowNode as Node } from '@/lib/types';
import { nodeProgress } from '@/lib/types';
import { fontPx, nodeH, nodeW } from '@/lib/edges';
import s from './FlowNode.module.css';

type State = 'done' | 'current' | 'todo';

/** 状态由数据推出来，不额外存一个字段：
 *  子步骤全勾完 = done，勾了一部分 = current，一条没勾 = todo。 */
function nodeState(n: Node): State {
  const p = nodeProgress(n);
  if (p === 1) return 'done';
  return p > 0 ? 'current' : 'todo';
}

/** 深色底自动把字翻成纸白，浅色底翻回墨黑 —— 选了颜色不用自己操心可读性。 */
function isDark(hexColor: string): boolean {
  const r = parseInt(hexColor.slice(1, 3), 16);
  const g = parseInt(hexColor.slice(3, 5), 16);
  const b = parseInt(hexColor.slice(5, 7), 16);
  return 0.299 * r + 0.587 * g + 0.114 * b < 140;
}

/** 盒子的内联样式 —— 全部来自头顶工具条设置的 node.style。 */
function boxCss(n: Node): CSSProperties {
  const st = n.style;
  const out: CSSProperties = {};
  if (st?.fill) out.background = st.fill;
  if (st?.border || st?.dashed) { out.borderStyle = st.dashed ? 'dashed' : 'solid'; out.borderWidth = 1; }
  if (st?.border) out.borderColor = st.border;
  return out;
}

/** 文字的内联样式。fontSize 始终跟 lib/edges 的 fontPx 走 ——
 *  高度估算和实际渲染必须用同一个数，不然长标题又会溢出。 */
function textCss(n: Node, lineThrough = false): CSSProperties {
  const st = n.style;
  const out: CSSProperties = { fontSize: fontPx(n) };
  if (st?.bold) out.fontWeight = 700;
  if (st?.italic) out.fontStyle = 'italic';
  if (st?.underline) out.textDecoration = lineThrough ? 'underline line-through' : 'underline';
  if (st?.color) out.color = st.color;
  else if (st?.fill) out.color = isDark(st.fill) ? 'var(--rf-on-gold)' : 'var(--rf-ink)';
  return out;
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

/** 节点挂的链接。挡住冒泡 —— 点链接不该顺手选中或拖动节点。 */
function HrefMark({ url }: { url: string }) {
  return (
    <a className={s.hrefMark} href={url} target="_blank" rel="noopener noreferrer" title={url}
       onClick={e => e.stopPropagation()} onPointerDown={e => e.stopPropagation()}>↗</a>
  );
}

function LockMark() {
  return (
    <svg className={s.lockMark} width="9" height="9" viewBox="0 0 24 24" fill="none"
         stroke="currentColor" strokeWidth="2.4">
      <rect x="4" y="10.5" width="16" height="10.5" />
      <path d="M8 10.5V7a4 4 0 0 1 8 0v3.5" />
    </svg>
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
  const st = node.style;

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
                   fill={st?.fill ?? 'var(--rf-paper)'} stroke={st?.border ?? 'var(--rf-ink)'}
                   strokeWidth="1" strokeLinejoin="miter"
                   strokeDasharray={st?.dashed ? '4 4' : undefined} />
        </svg>
        <span className={s.diamondText} style={textCss(node)}>
          {node.title}
          {node.href && <HrefMark url={node.href} />}
          {footnote !== undefined && (
            <Footnote n={footnote} active={activeFootnote} onOpen={() => onOpenNote?.(node.id)} />
          )}
        </span>
        {node.locked && <LockMark />}
      </div>
    );
  }

  /* 起止 —— 黑色实心条（填了浅色时字自动翻回墨色） */
  if (node.shape === 'terminator') {
    return (
      <div data-node className={`${s.node} ${s.terminator}`} style={{ ...pos, ...boxCss(node) }}
           onClick={() => onSelect?.(node.id)}
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
        <span className={s.title} style={textCss(node)}>
          {node.title}
          {node.href && <HrefMark url={node.href} />}
          {footnote !== undefined && (
            <Footnote n={footnote} active={activeFootnote} onOpen={() => onOpenNote?.(node.id)} />
          )}
        </span>
        <span className={s.endLabel}
              style={st?.fill && !isDark(st.fill) ? { color: 'var(--rf-ink-3)' } : undefined}>
          {terminal === 'end' ? 'END' : 'START'}
        </span>
        {node.locked && <LockMark />}
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
      style={{ ...pos, ...boxCss(node) }}
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
      <span className={s.title} style={textCss(node, state === 'done')}>
        {node.title}
        {node.href && <HrefMark url={node.href} />}
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
      {node.locked && <LockMark />}
    </div>
  );
}
