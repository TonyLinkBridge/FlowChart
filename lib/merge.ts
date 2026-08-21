import type { FlowDoc, FlowEdge, FlowNode } from './types';

/** 三方合并：base = 我上次同步到的版本，mine = 我手上的，theirs = 服务器上别人存的。
 *  粒度到「单个节点 / 单条线」：我改过的以我为准，我没碰的以对方为准 ——
 *  两个人只要不同时改同一个节点，双方的修改都保得住。
 *  同一个节点两边都改了 → 我的版本赢（clashes 里报出来，前端提示）。 */

const same = (a: unknown, b: unknown) => JSON.stringify(a) === JSON.stringify(b);
const edgeKey = (e: FlowEdge) => `${e.source}>${e.target}`;

export function mergeDocs(base: FlowDoc, mine: FlowDoc, theirs: FlowDoc): { doc: FlowDoc; clashes: string[] } {
  const clashes: string[] = [];
  const bN = new Map(base.nodes.map(n => [n.id, n]));
  const tN = new Map(theirs.nodes.map(n => [n.id, n]));
  const mN = new Map(mine.nodes.map(n => [n.id, n]));

  // 顺序以对方（最新落库的）为主干，我新加的排后面
  const order: string[] = theirs.nodes.map(n => n.id);
  for (const n of mine.nodes) if (!tN.has(n.id)) order.push(n.id);

  const nodes: FlowNode[] = [];
  for (const id of order) {
    const b = bN.get(id), m = mN.get(id), t = tN.get(id);
    if (m && t) {
      const iChanged = !b || !same(m, b);
      const theyChanged = !b || !same(t, b);
      if (iChanged && theyChanged && !same(m, t)) clashes.push(m.title);
      nodes.push(iChanged ? m : t);
    } else if (m && !t) {
      if (!b) nodes.push(m);                       // 我新加的 → 保留
      else if (!same(m, b)) { nodes.push(m); clashes.push(m.title); }   // 对方删了但我改过 → 留我的
      // 对方删了、我也没碰 → 跟着删
    } else if (!m && t) {
      if (!b) nodes.push(t);                       // 对方新加的 → 保留
      else if (!same(t, b)) { nodes.push(t); clashes.push(t.title); }   // 我删了但对方改过 → 留对方的
      // 我删了、对方没碰 → 保持删除
    }
  }

  const ids = new Set(nodes.map(n => n.id));
  const bE = new Map(base.edges.map(e => [edgeKey(e), e]));
  const tE = new Map(theirs.edges.map(e => [edgeKey(e), e]));
  const mE = new Map(mine.edges.map(e => [edgeKey(e), e]));

  const edgeOrder: string[] = theirs.edges.map(edgeKey);
  for (const e of mine.edges) if (!tE.has(edgeKey(e))) edgeOrder.push(edgeKey(e));

  const edges: FlowEdge[] = [];
  for (const k of edgeOrder) {
    const b = bE.get(k), m = mE.get(k), t = tE.get(k);
    let keep: FlowEdge | undefined;
    if (m && t) keep = !b || !same(m, b) ? m : t;
    else if (m && !t) keep = !b ? m : !same(m, b) ? m : undefined;
    else if (!m && t) keep = !b ? t : !same(t, b) ? t : undefined;
    // 两端节点都还在才留 —— 合并后不能出悬空线
    if (keep && ids.has(keep.source) && ids.has(keep.target)) edges.push(keep);
  }

  const pick = <K extends 'title' | 'subtitle' | 'direction'>(k: K): FlowDoc[K] =>
    !same(mine[k], base[k]) ? mine[k] : theirs[k];

  return {
    doc: { title: pick('title'), subtitle: pick('subtitle'), direction: pick('direction'), nodes, edges },
    clashes: [...new Set(clashes)],
  };
}
