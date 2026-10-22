import type { FlowDoc, FlowEdge, FlowNode } from './types';

/** Local undo metadata only; never serialized to a flow or version snapshot. */
export interface InsertionChange {
  before: FlowDoc;
  after: FlowDoc;
  nodeId: string;
  edgeIndex: number;
}

// Parallel edges have no IDs. Keep the selected occurrence, not just the endpoints.
function edgeOccurrence(edges: FlowEdge[], sourceEdges: FlowEdge[], index: number): number {
  const edge = sourceEdges[index];
  const sameEnds = (candidate: FlowEdge) => candidate.source === edge.source && candidate.target === edge.target;
  let occurrence = sourceEdges.slice(0, index).filter(sameEnds).length;
  return edges.findIndex(candidate => sameEnds(candidate) && occurrence-- === 0);
}

/** Replay only one edge insertion's membership, wiring and positional delta.
 * Retained nodes always come from current, including their latest notes and titles.
 * Redo restores the removed node's last content from the undo receipt, not its initial blank value. */
export function replayInsertion(current: FlowDoc, change: InsertionChange, direction: 'undo' | 'redo', saved = change.after): FlowDoc {
  const { before, after, nodeId, edgeIndex } = change;
  const original = before.edges[edgeIndex];
  const inserted = saved.nodes.find(node => node.id === nodeId);
  const undo = direction === 'undo';
  if (!original || !inserted || !current.nodes.some(node => node.id === original.source) ||
      !current.nodes.some(node => node.id === original.target)) return current;
  if (current.nodes.some(node => node.id === nodeId) !== undo) return current;

  const incoming = undo
    ? current.edges.findIndex(edge => edge.source === original.source && edge.target === nodeId)
    : edgeOccurrence(current.edges, before.edges, edgeIndex);
  const outgoing = undo
    ? current.edges.find(edge => edge.source === nodeId && edge.target === original.target)
    : saved.edges.find(edge => edge.source === nodeId && edge.target === original.target);
  // Do not invent connections when the original insertion is no longer present.
  if (incoming < 0 || !outgoing) return current;
  const edges = current.edges.flatMap((edge, index) => {
    if (index === incoming) return undo
      ? [{ ...edge, target: original.target }]
      : [{ ...edge, target: nodeId }, outgoing];
    return undo && (edge.source === nodeId || edge.target === nodeId) ? [] : [edge];
  });

  const from = new Map((undo ? after : before).nodes.map(node => [node.id, node]));
  const to = new Map((undo ? before : after).nodes.map(node => [node.id, node]));
  const nodes = current.nodes.filter(node => !undo || node.id !== nodeId).map(node => {
    const source = from.get(node.id), target = to.get(node.id);
    if (!source || !target) return node;
    let next: FlowNode = node;
    for (const key of ['x', 'y'] as const) {
      // An independent later move is not part of the insertion being replayed.
      if (source[key] === target[key] || node[key] !== source[key]) continue;
      next = { ...next };
      if (target[key] === undefined) delete next[key];
      else next[key] = target[key];
    }
    return next;
  });
  if (!undo) nodes.splice(nodes.findIndex(node => node.id === original.source) + 1, 0, inserted);
  return { ...current, nodes, edges };
}
