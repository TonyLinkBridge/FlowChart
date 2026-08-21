import { adjacency, depths } from './graph';
import { nodeH, nodeW } from './edges';
import type { FlowDoc } from './types';

const ROW_GAP = 30;   // 层与层之间留的空
export const COL_GAP = 44;   // 同一层里两个节点之间留的空
const PAD_X = 48;     // 别让图贴着画布左边缘
const PAD_Y = 28;

/** 自动排版：分层 + 重心对齐。
 *  层号 = 从起点数过来的最长路径（并行分支因此会对齐在同一层）。
 *  每个节点想待的位置 = 它所有前置节点的中点平均值 —— 这样主干自然走直线，
 *  分支自然向两边分开，不用手填坐标。
 *
 *  没用 dagre：图就这么点大，自己写七十行反而好控制，也少一个依赖。 */
export function autoLayout(doc: FlowDoc): FlowDoc {
  if (!doc.nodes.length) return doc;

  const layer = depths(doc);
  const { preds } = adjacency(doc);
  const byId = new Map(doc.nodes.map(n => [n.id, n]));

  const layers = new Map<number, string[]>();
  for (const n of doc.nodes) {
    const l = layer.get(n.id) ?? 0;
    if (!layers.has(l)) layers.set(l, []);
    layers.get(l)!.push(n.id);
  }

  const center = new Map<string, number>();   // 节点中心的 x
  const top = new Map<string, number>();      // 节点上沿的 y
  let y = 0;

  for (const l of [...layers.keys()].sort((a, b) => a - b)) {
    const ids = layers.get(l)!;

    // 想待的位置：前置节点的中点平均值；没有前置就先放 0
    const want = new Map(ids.map(id => {
      const p = preds.get(id)!.filter(x => center.has(x));
      return [id, p.length ? p.reduce((s, x) => s + center.get(x)!, 0) / p.length : 0];
    }));

    // 按想去的位置从左到右排，然后从左往右扫一遍把重叠的推开
    const sorted = [...ids].sort((a, b) => want.get(a)! - want.get(b)!);
    let cursor = -Infinity;
    for (const id of sorted) {
      const half = nodeW(byId.get(id)!) / 2;
      const x = Math.max(want.get(id)!, cursor + half);
      center.set(id, x);
      cursor = x + half + COL_GAP;
    }

    // 这一层整体挪一下，让它的中点落在前置节点的中点上（主干才会是直的）
    const anchors = ids.flatMap(id => preds.get(id)!).filter(x => center.has(x));
    if (anchors.length) {
      const target = anchors.reduce((s, x) => s + center.get(x)!, 0) / anchors.length;
      const lo = Math.min(...ids.map(id => center.get(id)! - nodeW(byId.get(id)!) / 2));
      const hi = Math.max(...ids.map(id => center.get(id)! + nodeW(byId.get(id)!) / 2));
      const shift = target - (lo + hi) / 2;
      for (const id of ids) center.set(id, center.get(id)! + shift);
    }

    for (const id of ids) top.set(id, y);
    y += Math.max(...ids.map(id => nodeH(byId.get(id)!))) + ROW_GAP;
  }

  // 整体平移，让最左边贴到 0
  const minX = Math.min(...doc.nodes.map(n => center.get(n.id)! - nodeW(n) / 2));

  return {
    ...doc,
    nodes: doc.nodes.map(n => ({
      ...n,
      x: Math.round(center.get(n.id)! - nodeW(n) / 2 - minX) + PAD_X,
      y: Math.round(top.get(n.id)!) + PAD_Y,
    })),
  };
}
