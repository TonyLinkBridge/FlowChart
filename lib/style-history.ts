import type { FlowDoc, FlowNode, NodeStyle } from './types';

/** Replay only the style/position delta of a restyle action, never its old document content.
 * Size changes also lay out nodes, so keep that geometry undoable without copying old notes.
 * Structural actions continue to use the editor's original snapshot history. */
export function applyStyleHistory(current: FlowDoc, from: FlowDoc, to: FlowDoc): FlowDoc {
  const sources = new Map(from.nodes.map(node => [node.id, node]));
  const targets = new Map(to.nodes.map(node => [node.id, node]));
  let changed = false;
  const nodes = current.nodes.map(node => {
    const source = sources.get(node.id), target = targets.get(node.id);
    if (!source || !target) return node;
    let next: FlowNode = node;
    const keys = new Set([...Object.keys(source.style ?? {}), ...Object.keys(target.style ?? {})] as (keyof NodeStyle)[]);
    const style = { ...node.style };
    let styleChanged = false;
    for (const key of keys) {
      if (source.style?.[key] === target.style?.[key]) continue;
      styleChanged = true;
      if (target.style?.[key] === undefined) delete style[key];
      else Object.assign(style, { [key]: target.style[key] });
    }
    if (styleChanged) {
      next = { ...next };
      if (Object.keys(style).length) next.style = style;
      else delete next.style;
    }
    for (const key of ['x', 'y'] as const) {
      if (source[key] === target[key]) continue;
      next = { ...next };
      if (target[key] === undefined) delete next[key];
      else next[key] = target[key];
    }
    if (next !== node) changed = true;
    return next;
  });
  return changed ? { ...current, nodes } : current;
}
