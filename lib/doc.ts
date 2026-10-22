import { autoLayout } from './layout';
import { nodeH, nodeW } from './edges';
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

/** 只拆开用户选中的那条线，不调用整图自动排版。失败时原图完全不变。 */
export function insertNodeOnEdge(doc: FlowDoc, index: number): { doc: FlowDoc; id: string } | { error: string } {
  const edge = Number.isInteger(index) ? doc.edges[index] : undefined;
  const source = doc.nodes.find(n => n.id === edge?.source);
  const target = doc.nodes.find(n => n.id === edge?.target);
  if (!edge || !source || !target) return { error: '这条连线已不存在，请重新选择。' };
  if (doc.nodes.some(n => !Number.isFinite(n.x) || !Number.isFinite(n.y))) {
    return { error: '节点位置尚未就绪，请稍后再试。' };
  }
  if (target.y! <= source.y!) return { error: '这条回连或横向连线暂不支持直接插入，请先调整位置。' };

  const downstream = new Set<string>();
  const queue = [target.id];
  const successors = new Map<string, string[]>();
  for (const e of doc.edges) successors.set(e.source, [...(successors.get(e.source) ?? []), e.target]);
  for (let i = 0; i < queue.length; i++) {
    const id = queue[i];
    if (downstream.has(id)) continue;
    downstream.add(id);
    queue.push(...(successors.get(id) ?? []));
  }
  if (downstream.has(source.id)) return { error: '这条连线包含循环，直接插入可能影响其他步骤，请先调整连线。' };

  const id = nextId(doc);
  const node: FlowNode = { id, title: '新步骤', shape: 'process' };
  const gap = 30;
  const bottom = source.y! + nodeH(source);
  const shift = Math.max(0, bottom + gap * 2 + nodeH(node) - target.y!);
  if (shift && doc.nodes.some(n => downstream.has(n.id) && n.locked)) {
    return { error: '后续有锁定节点，无法安全腾出位置。请先留出空位或解锁。' };
  }
  node.x = target.x! + (nodeW(target) - nodeW(node)) / 2;
  node.y = shift ? bottom + gap : Math.floor((bottom + target.y! - nodeH(node)) / 2);
  const nodes = doc.nodes.map(n => shift && downstream.has(n.id) ? { ...n, y: n.y! + shift } : n);
  const overlaps = (a: FlowNode, b: FlowNode) =>
    a.x! < b.x! + nodeW(b) + 16 && a.x! + nodeW(a) + 16 > b.x! &&
    a.y! < b.y! + nodeH(b) + 16 && a.y! + nodeH(a) + 16 > b.y!;
  const stationary = nodes.filter(n => !downstream.has(n.id));
  if (nodes.some(n => overlaps(node, n)) || (shift && nodes.some(n =>
    downstream.has(n.id) && stationary.some(other => overlaps(n, other))))) {
    return { error: '插入后会挤到其他节点。请先给这条连线留一点空位，再插入。' };
  }
  // 插在源节点后面；旧节点的相对顺序和附注编号保持不变。
  nodes.splice(nodes.findIndex(n => n.id === source.id) + 1, 0, node);
  const edges = doc.edges.flatMap((e, i) => i === index ? [
    { ...e, target: id },
    { source: id, target: e.target, ...(e.dashed === undefined ? {} : { dashed: e.dashed }) },
  ] : [e]);
  return { doc: { ...doc, nodes, edges }, id };
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
