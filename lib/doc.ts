import { autoLayout } from './layout';
import type { FlowDoc, FlowEdge, FlowNode, Shape } from './types';

/** 生成一个没被占用的 id */
function nextId(doc: FlowDoc, prefix = 'n'): string {
  let i = doc.nodes.length + 1;
  while (doc.nodes.some(n => n.id === `${prefix}${i}`)) i++;
  return `${prefix}${i}`;
}

/** 新建一张空白流程图。给一个起点，不然面对全空的画布没人知道从哪下手。 */
export function blankDoc(title = '未命名流程'): FlowDoc {
  return autoLayout({
    title,
    direction: 'TB',
    nodes: [{ id: 'start', title: '开始', shape: 'terminator' }],
    edges: [],
  });
}

/** 图的末梢：没有后继的节点。 */
function tails(doc: FlowDoc): string[] {
  return doc.nodes.filter(n => !doc.edges.some(e => e.source === n.id)).map(n => n.id);
}

/** 在某个节点后面接一步。
 *  没选中时不要傻乎乎丢个孤立节点 —— 如果整张图只有一个末梢，那接在它后面
 *  就是唯一合理的意图（新建空白图之后连点「＋节点」就该串成一条链）。
 *  有多个末梢才说明有分支，这时才不猜。 */
export function addNode(doc: FlowDoc, afterId?: string | null): { doc: FlowDoc; id: string } {
  if (!afterId) {
    const t = tails(doc);
    if (t.length === 1) afterId = t[0];
  }
  const id = nextId(doc);
  const node: FlowNode = { id, title: '新步骤', shape: 'process' };
  const next: FlowDoc = {
    ...doc,
    nodes: [...doc.nodes, node],
    edges: afterId ? [...doc.edges, { source: afterId, target: id }] : doc.edges,
  };
  return { doc: autoLayout(next), id };
}

/** 删节点。中间那步被删掉时，把它的上下游接起来 —— 不然链子会断成两截。 */
export function removeNode(doc: FlowDoc, id: string): FlowDoc {
  const preds = doc.edges.filter(e => e.target === id).map(e => e.source);
  const succs = doc.edges.filter(e => e.source === id).map(e => e.target);
  const bridged = preds.flatMap(p => succs.map(t => ({ source: p, target: t })));

  const kept = doc.edges.filter(e => e.source !== id && e.target !== id);
  const seen = new Set(kept.map(e => `${e.source}>${e.target}`));
  for (const e of bridged) {
    const k = `${e.source}>${e.target}`;
    if (!seen.has(k)) { kept.push(e); seen.add(k); }
  }

  return autoLayout({ ...doc, nodes: doc.nodes.filter(n => n.id !== id), edges: kept });
}

/** 连一条线。已经有了或者自己连自己就原样返回。 */
export function connect(doc: FlowDoc, source: string, target: string): FlowDoc {
  if (source === target) return doc;
  if (doc.edges.some(e => e.source === source && e.target === target)) return doc;
  return autoLayout({ ...doc, edges: [...doc.edges, { source, target }] });
}

/** 改节点属性。形状变了要重排 —— 菱形和矩形宽度不一样。 */
export function patchNode(doc: FlowDoc, id: string, patch: Partial<FlowNode>): FlowDoc {
  const next = { ...doc, nodes: doc.nodes.map(n => (n.id === id ? { ...n, ...patch } : n)) };
  return 'shape' in patch ? autoLayout(next) : next;
}

export const SHAPES: { value: Shape; label: string }[] = [
  { value: 'process',    label: '步骤' },
  { value: 'decision',   label: '判断' },
  { value: 'terminator', label: '起止' },
];

/** 改一条连线：线上文字、虚实。 */
export function patchEdge(doc: FlowDoc, index: number, patch: Partial<FlowEdge>): FlowDoc {
  return { ...doc, edges: doc.edges.map((e, i) => (i === index ? { ...e, ...patch } : e)) };
}

/** 删一条连线。不重排 —— 删线常常是为了改接法，重排会把人绕晕。 */
export function removeEdge(doc: FlowDoc, index: number): FlowDoc {
  return { ...doc, edges: doc.edges.filter((_, i) => i !== index) };
}
