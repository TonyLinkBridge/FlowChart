import type { FlowDoc, FlowNode, NoteStep } from './types';

/** Undo metadata stays local; flow documents and database schemas are unchanged. */
export interface ScopedChange {
  kind: 'add-node' | 'completion';
  before: FlowDoc;
  after: FlowDoc;
  nodeId: string;
}

function matchingStep(current: NoteStep[], source: NoteStep[], index: number): number {
  // Local immutable edits preserve object identity even when another step is added or removed.
  const identity = current.indexOf(source[index]);
  if (identity >= 0) return identity;
  const text = source[index].text;
  if (source.filter(step => step.text === text).length !== 1 || current.filter(step => step.text === text).length !== 1) return -1;
  return current.findIndex(step => step.text === text);
}

/** Replay only ordinary-add structure/layout or the exact completion flags changed by an action. */
export function replayScopedChange(current: FlowDoc, change: ScopedChange, direction: 'undo' | 'redo', saved = change.after): FlowDoc {
  const undo = direction === 'undo';
  const from = undo ? change.after : change.before, to = undo ? change.before : change.after;
  if (change.kind === 'add-node') {
    const exists = current.nodes.some(node => node.id === change.nodeId);
    if (exists !== undo) return current;
    const added = saved.nodes.find(node => node.id === change.nodeId);
    if (!added) return current;
    const connections = change.after.edges.filter(edge => edge.source === change.nodeId || edge.target === change.nodeId);
    if (!undo && connections.some(edge => [edge.source, edge.target].some(id => id !== change.nodeId && !current.nodes.some(node => node.id === id)))) return current;
    const sources = new Map(from.nodes.map(node => [node.id, node]));
    const targets = new Map(to.nodes.map(node => [node.id, node]));
    const nodes = current.nodes.filter(node => !undo || node.id !== change.nodeId).map(node => {
      const source = sources.get(node.id), target = targets.get(node.id);
      if (!source || !target) return node;
      let next = node;
      for (const key of ['x', 'y'] as const) {
        if (source[key] === target[key] || node[key] !== source[key]) continue;
        next = { ...next };
        if (target[key] === undefined) delete next[key]; else next[key] = target[key];
      }
      return next;
    });
    const edges = undo ? current.edges.filter(edge => edge.source !== change.nodeId && edge.target !== change.nodeId) : [...current.edges];
    if (!undo) {
      const nextNode = saved.nodes.slice(saved.nodes.findIndex(node => node.id === added.id) + 1)
        .find(candidate => nodes.some(node => node.id === candidate.id));
      nodes.splice(nextNode ? nodes.findIndex(node => node.id === nextNode.id) : nodes.length, 0, added);
      for (const edge of connections) {
        if (edges.some(other => other.source === edge.source && other.target === edge.target)) continue;
        const index = saved.edges.findIndex(other => other.source === edge.source && other.target === edge.target);
        const nextEdge = saved.edges.slice(index + 1).find(candidate => edges.some(other => other.source === candidate.source && other.target === candidate.target));
        const at = nextEdge ? edges.findIndex(other => other.source === nextEdge.source && other.target === nextEdge.target) : edges.length;
        edges.splice(at, 0, saved.edges[index] ?? edge);
      }
    }
    return { ...current, nodes, edges };
  }

  const node = current.nodes.find(node => node.id === change.nodeId);
  const source = from.nodes.find(node => node.id === change.nodeId), target = to.nodes.find(node => node.id === change.nodeId);
  if (!node || !source || !target) return current;
  const sourceSteps = source.note?.steps ?? [], targetSteps = target.note?.steps ?? [], currentSteps = node.note?.steps ?? [];
  const changes = sourceSteps.flatMap((step, index) => targetSteps[index] && step.done !== targetSteps[index].done ? [index] : []);
  const replay = new Map<number, boolean>();
  for (const index of changes) {
    const at = matchingStep(currentSteps, sourceSteps, index);
    if (at >= 0 && currentSteps[at].done === sourceSteps[index].done) replay.set(at, targetSteps[index].done);
  }
  // No stable step IDs exist: keep new/ambiguous step structures rather than guessing an index.
  if (changes.length && currentSteps.length && !replay.size) return current;
  let next: FlowNode = node;
  const steps = currentSteps.map((step, index) => replay.has(index) ? { ...step, done: replay.get(index)! } : step);
  if (replay.size && node.note) next = { ...next, note: { ...node.note, steps } };
  if (replay.size || (source.done !== target.done && node.done === source.done)) {
    const targetComplete = targetSteps.length ? targetSteps.every(step => step.done) : !!target.done;
    const complete = steps.length ? steps.every(step => step.done) : !!target.done;
    const done = complete === targetComplete ? target.done : complete;
    next = { ...next };
    if (done === undefined) delete next.done; else next.done = done;
  }
  return next === node ? current : { ...current, nodes: current.nodes.map(other => other.id === node.id ? next : other) };
}
