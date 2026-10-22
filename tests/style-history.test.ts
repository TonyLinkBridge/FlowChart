import { describe, expect, it } from 'vitest';
import { applyStyleHistory } from '@/lib/style-history';
import type { FlowDoc } from '@/lib/types';

const before: FlowDoc = { title: '流程', nodes: [
  { id: 'a', title: '步骤', x: 10, y: 20, note: { text: '旧邮件', steps: [{ text: '核对', done: false }] } },
  { id: 'b', title: '后续', x: 10, y: 100, note: { text: 'B 旧邮件' } },
], edges: [{ source: 'a', target: 'b', label: '继续' }] };
describe('只撤回外观动作本身', () => {
  it('removes only the fill that changed, preserving later mail, title, owner, other styles and extra nodes', () => {
    const after: FlowDoc = { ...before, nodes: [{ ...before.nodes[0], style: { fill: '#B4322F' } }, before.nodes[1]] };
    const current: FlowDoc = { ...after, title: '新标题', nodes: [
      { ...after.nodes[0], title: '新步骤名', owner: 'Tony', style: { fill: '#B4322F', bold: true }, note: { text: '新邮件\n\nEND\n', steps: [{ text: '核对', done: true }] } },
      { ...after.nodes[1], note: { text: 'B 新邮件' } }, { id: 'extra', title: '另加步骤' },
    ] };
    const expected: FlowDoc = { ...current, nodes: [{ ...current.nodes[0], style: { bold: true } }, current.nodes[1], current.nodes[2]] };
    expect(applyStyleHistory(current, after, before)).toEqual(expected);
    expect(current.nodes[0].style?.fill).toBe('#B4322F');
    expect(applyStyleHistory(expected, before, after)).toEqual(current);
  });
  it('undoes size-related layout only where the action moved nodes, preserving every current note and existing locked geometry', () => {
    const after: FlowDoc = { ...before, nodes: [{ ...before.nodes[0], style: { size: 'l' }, x: 40 }, { ...before.nodes[1], y: 160 }] };
    const current: FlowDoc = { ...after, nodes: [{ ...after.nodes[0], note: { text: 'A 新邮件' } }, { ...after.nodes[1], x: 55, note: { text: 'B 新邮件' } }] };
    expect(applyStyleHistory(current, after, before)).toEqual({ ...current, nodes: [
      { ...before.nodes[0], note: { text: 'A 新邮件' } }, { ...before.nodes[1], x: 55, note: { text: 'B 新邮件' } },
    ] });
  });
  it('does not restore a node removed later, recreate a removed note, or change branches when undoing styles', () => {
    const after: FlowDoc = { ...before, nodes: [{ ...before.nodes[0], style: { fill: '#B4322F' } }, before.nodes[1]] };
    const current: FlowDoc = { ...after, nodes: [{ ...after.nodes[0], note: undefined }], edges: [] };
    expect(applyStyleHistory(current, after, before)).toEqual({ ...current, nodes: [{ ...before.nodes[0], note: undefined }] });
    const removed: FlowDoc = { ...current, nodes: [] };
    expect(applyStyleHistory(removed, after, before)).toEqual(removed);
  });
});
