import type { FlowNode } from './types';

const NODE_W = 260;
/** 标题里有换行就长高一行。最多两行 —— 再多就该写进附注了，
 *  节点撑得太高，整张图会散。 */
export const titleLines = (n: FlowNode) =>
  Math.min(2, (n.title.match(/\n/g)?.length ?? 0) + 1);

export const nodeH = (n: FlowNode) => {
  const extra = (titleLines(n) - 1) * 18;
  if (n.shape === 'decision') return 64 + extra;
  return (n.shape === 'terminator' ? 44 : 46) + extra;
};
export const nodeW = (n: FlowNode) => (n.shape === 'decision' ? 200 : NODE_W);

/** 节点的连接点。菱形从左右出，其余从上下出。 */
export function ports(n: FlowNode) {
  const x = n.x ?? 0, y = n.y ?? 0, w = nodeW(n), h = nodeH(n);
  return { x, y, w, h, cx: x + w / 2, top: y, bottom: y + h, left: x, right: x + w, mid: y + h / 2 };
}

/** 直角走线：主干直上直下，分支先横后竖。
 *  屏幕和导出共用这一份 —— 两边各画各的迟早对不上。 */
export function edgePath(a: FlowNode, b: FlowNode) {
  const p = ports(a), q = ports(b);
  if (Math.abs(p.cx - q.cx) < 4) return `M${p.cx} ${p.bottom} V${q.top}`;
  const from = q.cx > p.cx ? p.right : p.left;
  return `M${from} ${p.mid} H${q.cx} V${q.top}`;
}

/** 连线上「是 / 否」标签的位置 */
export function edgeLabelPos(a: FlowNode, b: FlowNode) {
  const p = ports(a), q = ports(b);
  return { x: (q.cx > p.cx ? p.right + q.cx : p.left + q.cx) / 2, y: p.mid - 10 };
}
