import { describe, expect, it } from 'vitest';
import { replayScopedChange, type ScopedChange } from '@/lib/scoped-history';
import type { FlowDoc } from '@/lib/types';

const before: FlowDoc = { title: '流程', nodes: [
  { id: 'a', title: '步骤 A', x: 10, y: 20, note: { text: '旧邮件', steps: [{ text: '核对 A', done: false }, { text: '核对 B', done: true }] } },
  { id: 'b', title: '步骤 B', x: 10, y: 100, note: { text: 'B 邮件' } },
], edges: [{ source: 'a', target: 'b', label: '是', dashed: true }] };
const added: FlowDoc = { ...before, nodes: [{ ...before.nodes[0], x: 48, y: 28 }, { ...before.nodes[1], x: 48, y: 104 },
  { id: 'new', title: '新步骤', x: 48, y: 180 }], edges: [...before.edges, { source: 'b', target: 'new' }] };
const checked: FlowDoc = { ...before, nodes: [{ ...before.nodes[0], done: true, note: {
  ...before.nodes[0].note, steps: [{ text: '核对 A', done: true }, { text: '核对 B', done: true }],
} }, before.nodes[1]] };
const add: ScopedChange = { kind: 'add-node', before, after: added, nodeId: 'new' };
const check: ScopedChange = { kind: 'completion', before, after: checked, nodeId: 'a' };

describe('普通加节点和完成状态的局部撤销', () => {
  it('undoes add-node membership, edges and layout only, preserving latest mail and bringing back the new node with its edited content on redo', () => {
    const current: FlowDoc = { ...added, title: '最新标题', nodes: added.nodes.map(n => n.id === 'a' ? {
      ...n, title: '新节点名', owner: 'Tony', note: { ...n.note, text: '新邮件\n\nEND\n' },
    } : n.id === 'new' ? { ...n, note: { text: '新框自己的邮件' } } : n) };
    const snapshot = structuredClone(current);
    const undone = replayScopedChange(current, add, 'undo');
    expect(undone).toEqual({ ...current, nodes: [{ ...current.nodes[0], x: 10, y: 20 }, { ...current.nodes[1], x: 10, y: 100 }], edges: before.edges });
    expect(replayScopedChange(undone, add, 'redo', current)).toEqual(current);
    expect(current).toEqual(snapshot);
  });

  it('keeps independent geometry, branches and removed data, and never duplicates an added node or invents its deleted parent', () => {
    const extra = { id: 'extra', title: '独立新增', x: 500, y: 500 };
    const edge = { source: 'a', target: 'extra', label: '新条件' };
    const current: FlowDoc = { ...added, nodes: [{ ...added.nodes[0], note: undefined, x: 77 }, added.nodes[1], added.nodes[2], extra], edges: [...added.edges, edge] };
    const undone = replayScopedChange(current, add, 'undo');
    expect(undone.nodes).toEqual([{ ...before.nodes[0], note: undefined, x: 77 }, before.nodes[1], extra]);
    expect(undone.edges).toEqual([...before.edges, edge]);
    expect(replayScopedChange(undone, add, 'redo', current)).toEqual(current);
    expect(replayScopedChange(current, add, 'redo', current)).toBe(current);
    const noParent = { ...undone, nodes: [undone.nodes[0], extra], edges: [edge] };
    expect(replayScopedChange(noParent, add, 'redo', current)).toBe(noParent);
  });

  it('changes only the checked flag and completion aggregate, retaining a renamed step, new mail, fields, links and contact', () => {
    const note = { text: '新邮件\r\n\r\nEND\r\n', steps: [{ text: '核对 A', done: true }, { text: '核对 B 新名称', done: true }],
      fields: [{ label: '案件', value: 'NEW' }], links: [{ label: '参考', url: 'https://example.test' }], contact: '新联系人' };
    const current: FlowDoc = { ...checked, nodes: [{ ...checked.nodes[0], note }, checked.nodes[1]] };
    const undone = replayScopedChange(current, check, 'undo');
    expect(undone).toEqual({ ...current, nodes: [{ ...before.nodes[0], note: { ...note, steps: [{ text: '核对 A', done: false }, note.steps[1]] } }, current.nodes[1]] });
    expect(replayScopedChange(undone, check, 'redo', current)).toEqual(current);
  });

  it('matches uniquely named steps after insertion or reorder and never applies old completion flags to newly added steps', () => {
    const current: FlowDoc = { ...checked, nodes: [{ ...checked.nodes[0], note: { text: '最新邮件', steps: [
      { text: '新步骤', done: false }, { text: '核对 B', done: true }, { text: '核对 A', done: true },
    ] } }, checked.nodes[1]] };
    const result = replayScopedChange(current, check, 'undo');
    expect(result.nodes[0].note).toEqual({ text: '最新邮件', steps: [
      { text: '新步骤', done: false }, { text: '核对 B', done: true }, { text: '核对 A', done: false },
    ] });
    expect(result.nodes[0].done).toBeUndefined();
  });

  it('does not guess which duplicate step was deleted and never recreates a removed note or node', () => {
    const from: FlowDoc = { ...before, nodes: [{ ...before.nodes[0], note: { text: '旧邮件', steps: [{ text: '重复', done: false }, { text: '重复', done: false }] } }] };
    const to: FlowDoc = { ...from, nodes: [{ ...from.nodes[0], done: false, note: { text: '旧邮件', steps: [{ text: '重复', done: true }, { text: '重复', done: false }] } }] };
    const change: ScopedChange = { kind: 'completion', before: from, after: to, nodeId: 'a' };
    const current: FlowDoc = { ...to, nodes: [{ ...to.nodes[0], note: { text: '保留的新邮件', steps: [{ text: '重复', done: false }] } }] };
    expect(replayScopedChange(current, change, 'undo')).toBe(current);
    const noNote: FlowDoc = { ...checked, nodes: [{ ...checked.nodes[0], note: undefined }, checked.nodes[1]] };
    expect(replayScopedChange(noNote, check, 'undo').nodes[0].note).toBeUndefined();
    const removed = { ...checked, nodes: [checked.nodes[1]] };
    expect(replayScopedChange(removed, check, 'undo')).toBe(removed);
  });

  it('undoes and redoes a whole-node check including mixed substeps, without replaying old mail', () => {
    const current: FlowDoc = { ...checked, nodes: [{ ...checked.nodes[0], note: { ...checked.nodes[0].note, text: '重做时最新邮件' } }, checked.nodes[1]] };
    const undone = replayScopedChange(current, check, 'undo');
    expect(undone.nodes[0].note!.steps).toEqual(before.nodes[0].note!.steps);
    expect(undone.nodes[0].note!.text).toBe('重做时最新邮件');
    expect(replayScopedChange(undone, check, 'redo', current)).toEqual(current);
    const plainBefore: FlowDoc = { title: '普通步骤', nodes: [{ id: 'a', title: '无子步骤' }], edges: [] };
    const plainAfter: FlowDoc = { ...plainBefore, nodes: [{ ...plainBefore.nodes[0], done: true }] };
    const plain: ScopedChange = { kind: 'completion', before: plainBefore, after: plainAfter, nodeId: 'a' };
    const latest: FlowDoc = { ...plainBefore, nodes: [{ ...plainBefore.nodes[0], note: { text: '之后写的新邮件' } }] };
    const redone = replayScopedChange(latest, plain, 'redo');
    expect(redone.nodes[0]).toEqual({ ...latest.nodes[0], done: true });
    expect(replayScopedChange(redone, plain, 'undo')).toEqual(latest);
  });
});
