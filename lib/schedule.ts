import { adjacency, topoOrder } from './graph';
import { nodeProgress, type FlowDoc } from './types';

interface Slot { start: number; end: number; days: number }

/** 排期：沿着图往下推，每一步的最早开工日 = 所有前置步骤全部完工的那天。
 *  这就是关键路径的正向计算 —— 分支合并处自动取最晚的那条。 */
export function schedule(doc: FlowDoc) {
  const { preds } = adjacency(doc);
  const seq = topoOrder(doc);

  const byId = new Map(doc.nodes.map(n => [n.id, n]));
  const slots = new Map<string, Slot>();
  for (const id of seq) {
    const n = byId.get(id)!;
    const start = Math.max(0, ...preds.get(id)!.map(p => slots.get(p)?.end ?? 0));
    const days = n.days ?? 0;
    slots.set(id, { start, end: start + days, days });
  }

  const total = Math.max(1, ...[...slots.values()].map(s => s.end));

  /** 「今天」没有真实日期可用，就用干完的活推：进度推到哪儿，今天就在哪儿。 */
  const today = Math.max(0, ...doc.nodes
    .filter(n => nodeProgress(n) > 0)
    .map(n => { const s = slots.get(n.id)!; return s.start + s.days * nodeProgress(n); }));

  return { slots, total, today };
}

/** 计划完工日已经过了、活还没干完 —— 这就是「卡住了」。 */
export function isLate(doc: FlowDoc, id: string, slot: Slot, today: number) {
  const n = doc.nodes.find(x => x.id === id);
  return !!n && slot.end < today - 0.001 && nodeProgress(n) < 1;
}
