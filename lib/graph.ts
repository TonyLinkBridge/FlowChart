import type { FlowDoc } from './types';

/** 前驱 / 后继表。排期和泳道都要用，抽出来别写两遍。 */
export function adjacency(doc: FlowDoc) {
  const preds = new Map<string, string[]>();
  const succs = new Map<string, string[]>();
  for (const n of doc.nodes) { preds.set(n.id, []); succs.set(n.id, []); }
  for (const e of doc.edges) {
    preds.get(e.target)?.push(e.source);
    succs.get(e.source)?.push(e.target);
  }
  return { preds, succs };
}

/** 拓扑排序（Kahn）。有环就退回原始顺序 —— 结果会不准，但不会崩。 */
export function topoOrder(doc: FlowDoc): string[] {
  const { preds, succs } = adjacency(doc);
  const indeg = new Map(doc.nodes.map(n => [n.id, preds.get(n.id)!.length]));
  const queue = doc.nodes.filter(n => indeg.get(n.id) === 0).map(n => n.id);
  const order: string[] = [];
  while (queue.length) {
    const id = queue.shift()!;
    order.push(id);
    for (const t of succs.get(id) ?? []) {
      const d = indeg.get(t)! - 1;
      indeg.set(t, d);
      if (d === 0) queue.push(t);
    }
  }
  return order.length === doc.nodes.length ? order : doc.nodes.map(n => n.id);
}

/** 每个节点排第几列：从起点数过来的最长路径。
 *  用最长而不是最短，是为了让并行分支（是/否）落在同一列上对齐。 */
export function depths(doc: FlowDoc): Map<string, number> {
  const { preds } = adjacency(doc);
  const d = new Map<string, number>();
  for (const id of topoOrder(doc)) {
    const p = preds.get(id)!;
    d.set(id, p.length ? Math.max(...p.map(x => (d.get(x) ?? 0) + 1)) : 0);
  }
  return d;
}

/** 起止节点该印 START 还是 END：没人指向它就是起点，它不指向别人就是终点。
 *  孤零零一个节点（新建空白图时）算起点。 */
export function terminalRole(doc: FlowDoc, id: string): 'start' | 'end' {
  const hasPred = doc.edges.some(e => e.target === id);
  return hasPred ? 'end' : 'start';
}
