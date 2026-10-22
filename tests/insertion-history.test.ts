import { describe, expect, it } from 'vitest';
import { replayInsertion, type InsertionChange } from '@/lib/insertion-history';
import type { FlowDoc } from '@/lib/types';

const before: FlowDoc = { title: '原流程', nodes: [
  { id: 'a', title: '起点', x: 0, y: 0, note: { text: 'A 旧邮件' } },
  { id: 'b', title: '后续', x: 0, y: 100, note: { text: 'B 旧邮件' } },
  { id: 'c', title: '独立分支', x: 300, y: 100, locked: true },
], edges: [{ source: 'a', target: 'b', label: '是', dashed: true }, { source: 'a', target: 'c', label: '否' }] };
const after: FlowDoc = { ...before, nodes: [before.nodes[0], { id: 'new', title: '新步骤', x: 0, y: 100 },
  { ...before.nodes[1], y: 176 }, before.nodes[2]], edges: [
  { source: 'a', target: 'new', label: '是', dashed: true }, { source: 'new', target: 'b', dashed: true }, before.edges[1],
] };
const change: InsertionChange = { before, after, nodeId: 'new', edgeIndex: 0 };

describe('仅撤回连线上插入的动作', () => {
  it('undoes only the inserted structure and shifted coordinates, preserving latest mail, all note fields and unrelated branches', () => {
    const current: FlowDoc = { ...after, title: '后来改的标题', nodes: after.nodes.map(n => n.id === 'a' ? {
      ...n, title: '后来改的步骤', owner: 'Tony', style: { fill: '#B4322F' }, note: {
        text: '最新邮件\n\nEND\n', steps: [{ text: '核对', done: true }], fields: [{ label: '案件', value: 'NEW' }],
        links: [{ label: '参考', url: 'https://example.test' }], contact: '新联系人',
      },
    } : n.id === 'b' ? { ...n, note: { text: 'B 新邮件' } } : n) };
    const snapshot = structuredClone(current);
    expect(replayInsertion(current, change, 'undo')).toEqual({ ...current, nodes: [
      current.nodes[0], { ...current.nodes[2], y: 100 }, current.nodes[3],
    ], edges: before.edges });
    expect(current).toEqual(snapshot);
  });

  it('redoes without replaying old retained-node content and brings back the inserted node with its last edited mail', () => {
    const saved: FlowDoc = { ...after, nodes: after.nodes.map(n => n.id === 'new' ? {
      ...n, title: '已填写的新步骤', note: { text: '插入框自己的邮件\nEND-NEW\n' },
    } : n) };
    const undone: FlowDoc = { ...before, nodes: before.nodes.map(n => n.id === 'a' ? { ...n, note: { text: '撤销之后又写的邮件' } } : n) };
    const redone = replayInsertion(undone, change, 'redo', saved);
    expect(redone).toEqual({ ...undone, nodes: [undone.nodes[0], saved.nodes[1], { ...undone.nodes[1], y: 176 }, undone.nodes[2]], edges: after.edges });
    expect(replayInsertion(redone, change, 'undo')).toEqual(undone);
    expect(replayInsertion(undone, change, 'redo', redone)).toEqual(redone);
  });

  it('restores the selected parallel edge, in order, while preserving branch text and dash changes made while undone', () => {
    const parallel = { source: 'a', target: 'b', label: '另一条条件' };
    const from: FlowDoc = { ...before, edges: [parallel, ...before.edges] };
    const to: FlowDoc = { ...after, edges: [parallel, ...after.edges] };
    const action: InsertionChange = { ...change, before: from, after: to, edgeIndex: 1 };
    const current: FlowDoc = { ...from, edges: [parallel, { ...before.edges[0], label: '最新条件', dashed: false }, before.edges[1]] };
    const redone = replayInsertion(current, action, 'redo');
    expect(redone.edges).toEqual([parallel, { source: 'a', target: 'new', label: '最新条件', dashed: false }, after.edges[1], before.edges[1]]);
    expect(replayInsertion(redone, action, 'undo')).toEqual(current);
  });

  it('never recreates a removed note, unrelated node or dangling edge, and does not resurrect an insertion when its connection is gone', () => {
    const current: FlowDoc = { ...after, nodes: after.nodes.filter(n => n.id !== 'c').map(n => n.id === 'a' ? { ...n, note: undefined } : n), edges: after.edges.slice(0, 2) };
    const undone = replayInsertion(current, change, 'undo');
    expect(undone.nodes.map(n => n.id)).toEqual(['a', 'b']);
    expect(undone.nodes[0].note).toBeUndefined();
    expect(undone.edges).toEqual([before.edges[0]]);
    const disconnected = { ...undone, edges: [] };
    expect(replayInsertion(disconnected, change, 'redo')).toBe(disconnected);
    const removedTarget = { ...undone, nodes: undone.nodes.filter(n => n.id !== 'b'), edges: [] };
    expect(replayInsertion(removedTarget, change, 'redo')).toBe(removedTarget);
  });

  it('preserves independently moved nodes, extra data and edges, and does not move stationary nodes during replay', () => {
    const extra = { id: 'extra', title: '后来另加', x: 500, y: 300 };
    const extraEdge = { source: 'c', target: 'extra', label: '新分支' };
    const current: FlowDoc = { ...after, nodes: after.nodes.map(n => n.id === 'b' ? { ...n, x: 40, y: 500 } : n.id === 'c' ? { ...n, y: 150 } : n).concat(extra), edges: [...after.edges, extraEdge] };
    const undone = replayInsertion(current, change, 'undo');
    expect(undone.nodes).toEqual([current.nodes[0], current.nodes[2], current.nodes[3], extra]);
    expect(undone.edges).toEqual([...before.edges, extraEdge]);
    expect(replayInsertion(undone, change, 'redo', current)).toEqual(current);
  });
});
