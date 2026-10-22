import type { FlowDoc, FlowEdge, FlowNode } from './types';

export interface NodeChange {
  id: string;
  title: string;
  fields: string[];
  before: FlowNode;
  after: FlowNode;
}

export interface DocumentDiff {
  hasChanges: boolean;
  currentCounts: { nodes: number; edges: number; notes: number };
  targetCounts: { nodes: number; edges: number; notes: number };
  currentNodeTitles: Record<string, string>;
  targetNodeTitles: Record<string, string>;
  summary: {
    nodesAdded: number; nodesRemoved: number; nodesChanged: number;
    notesAdded: number; notesRemoved: number; notesChanged: number;
    edgesAdded: number; edgesRemoved: number; edgesChanged: number;
  };
  nodesAdded: FlowNode[];
  nodesRemoved: FlowNode[];
  nodesChanged: NodeChange[];
  edgesAdded: FlowEdge[];
  edgesRemoved: FlowEdge[];
  edgesChanged: { before: FlowEdge; after: FlowEdge }[];
  documentChanges: { field: string; before: unknown; after: unknown }[];
}

/** Ignore object-key order and absent optional fields; keep array order meaningful. */
export function sameVersionValue(a: unknown, b: unknown): boolean {
  const canonical = (value: unknown): string | undefined => JSON.stringify(value, (_key, v) =>
    v && typeof v === 'object' && !Array.isArray(v)
      ? Object.fromEntries(Object.entries(v).sort(([x], [y]) => x.localeCompare(y)))
      : v);
  return canonical(a) === canonical(b);
}

const counts = (doc: FlowDoc) => ({
  nodes: doc.nodes.length, edges: doc.edges.length, notes: doc.nodes.filter(n => n.note).length,
});

/** Direction is current → selected snapshot: “removed” means it will disappear on restore. */
export function diffDocuments(current: FlowDoc, target: FlowDoc): DocumentDiff {
  const before = new Map(current.nodes.map(n => [n.id, n]));
  const after = new Map(target.nodes.map(n => [n.id, n]));
  const nodesAdded = target.nodes.filter(n => !before.has(n.id));
  const nodesRemoved = current.nodes.filter(n => !after.has(n.id));
  const nodesChanged: NodeChange[] = [];
  for (const next of target.nodes) {
    const previous = before.get(next.id);
    if (!previous) continue;
    const fields = [...new Set([...Object.keys(previous), ...Object.keys(next)])]
      .filter(key => !sameVersionValue(previous[key as keyof FlowNode], next[key as keyof FlowNode]));
    if (fields.length) nodesChanged.push({ id: next.id, title: next.title, fields, before: previous, after: next });
  }

  // Match identical edges first so parallel lines are not lost to a source/target Map.
  const remaining = [...current.edges];
  const unmatched: FlowEdge[] = [];
  for (const edge of target.edges) {
    const index = remaining.findIndex(old => sameVersionValue(old, edge));
    if (index < 0) unmatched.push(edge);
    else remaining.splice(index, 1);
  }
  const edgesAdded: FlowEdge[] = [];
  const edgesChanged: DocumentDiff['edgesChanged'] = [];
  for (const edge of unmatched) {
    const index = remaining.findIndex(old => old.source === edge.source && old.target === edge.target);
    if (index < 0) edgesAdded.push(edge);
    else edgesChanged.push({ before: remaining.splice(index, 1)[0], after: edge });
  }
  const documentChanges: DocumentDiff['documentChanges'] = (['title', 'subtitle', 'direction'] as const)
    .filter(field => !sameVersionValue(current[field], target[field]))
    .map(field => ({ field, before: current[field], after: target[field] }));
  const nodeLabel = (node: FlowNode) => `${node.title || '未命名步骤'} [${node.id}]`;
  const edgeLabel = (edge: FlowEdge, nodes: Map<string, FlowNode>) =>
    `${nodes.has(edge.source) ? nodeLabel(nodes.get(edge.source)!) : edge.source} → ${nodes.has(edge.target) ? nodeLabel(nodes.get(edge.target)!) : edge.target}${edge.label ? ` · ${edge.label}` : ''}${edge.dashed ? ' · 虚线' : ''}`;
  if (!sameVersionValue(current.nodes.map(n => n.id), target.nodes.map(n => n.id)))
    documentChanges.push({ field: 'nodeOrder', before: current.nodes.map(nodeLabel), after: target.nodes.map(nodeLabel) });
  if (!sameVersionValue(current.edges, target.edges))
    documentChanges.push({ field: 'edgeOrder', before: current.edges.map(e => edgeLabel(e, before)), after: target.edges.map(e => edgeLabel(e, after)) });

  let notesAdded = nodesAdded.filter(n => n.note).length;
  let notesRemoved = nodesRemoved.filter(n => n.note).length;
  let notesChanged = 0;
  for (const node of nodesChanged) if (node.fields.includes('note')) {
    if (!node.before.note && node.after.note) notesAdded++;
    else if (node.before.note && !node.after.note) notesRemoved++;
    else notesChanged++;
  }
  return {
    hasChanges: !sameVersionValue(current, target),
    currentCounts: counts(current), targetCounts: counts(target),
    currentNodeTitles: Object.fromEntries(current.nodes.map(n => [n.id, n.title])),
    targetNodeTitles: Object.fromEntries(target.nodes.map(n => [n.id, n.title])),
    summary: {
      nodesAdded: nodesAdded.length, nodesRemoved: nodesRemoved.length, nodesChanged: nodesChanged.length,
      notesAdded, notesRemoved, notesChanged,
      edgesAdded: edgesAdded.length, edgesRemoved: remaining.length, edgesChanged: edgesChanged.length,
    },
    nodesAdded, nodesRemoved, nodesChanged, edgesAdded, edgesRemoved: remaining, edgesChanged, documentChanges,
  };
}
