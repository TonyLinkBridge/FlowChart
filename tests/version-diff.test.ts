import { describe, expect, it } from 'vitest';
import { diffDocuments } from '@/lib/version-diff';
import type { FlowDoc } from '@/lib/types';

const current: FlowDoc = {
  title: '测试流程',
  nodes: [
    { id: 'a', title: '请求核实', note: { text: '最新的完整邮件模板' }, x: 20, y: 30 },
    { id: 'b', title: '通知机构', note: { text: '法院诉讼通知' } },
  ],
  edges: [{ source: 'a', target: 'b', label: '已核实' }],
};

describe('恢复前的内容差异', () => {
  it('identifies lost notes even when the node title is unchanged', () => {
    const target = structuredClone(current);
    delete target.nodes[0].note;
    const diff = diffDocuments(current, target);
    expect(diff.hasChanges).toBe(true);
    expect(diff.summary.notesRemoved).toBe(1);
    expect(diff.nodesChanged[0].fields).toEqual(['note']);
    expect(diff.nodesChanged[0].before.note?.text).toBe('最新的完整邮件模板');
    expect(diff.nodesChanged[0].after.note).toBeUndefined();
  });

  it('shows removed steps and their full mail templates', () => {
    const target: FlowDoc = { title: current.title, nodes: [current.nodes[0]], edges: [] };
    const diff = diffDocuments(current, target);
    expect(diff.nodesRemoved).toEqual([current.nodes[1]]);
    expect(diff.summary.nodesRemoved).toBe(1);
    expect(diff.summary.notesRemoved).toBe(1);
    expect(diff.edgesRemoved).toEqual([{ source: 'a', target: 'b', label: '已核实' }]);
  });

  it('shows additions, title edits, layout and document-level changes', () => {
    const target = structuredClone(current);
    target.title = '旧流程';
    target.nodes[0] = { ...target.nodes[0], title: '旧的核实步骤', x: 200 };
    target.nodes.push({ id: 'c', title: '案件结束' });
    const diff = diffDocuments(current, target);
    expect(diff.summary.nodesAdded).toBe(1);
    expect(diff.summary.nodesChanged).toBe(1);
    expect(diff.nodesChanged[0].fields).toEqual(['title', 'x']);
    expect(diff.documentChanges).toContainEqual({ field: 'title', before: '测试流程', after: '旧流程' });
  });

  it('does not call equal objects different because of JSON key order', () => {
    const target: FlowDoc = {
      edges: [{ label: '已核实', target: 'b', source: 'a' }],
      nodes: current.nodes.map(n => ({ y: n.y, x: n.x, note: n.note, title: n.title, id: n.id })),
      title: '测试流程',
    };
    expect(diffDocuments(current, target).hasChanges).toBe(false);
  });

  it('keeps parallel edges and detects a change to just one edge label', () => {
    const base = { ...current, edges: [...current.edges, { source: 'a', target: 'b', label: '补件' }] };
    const target = { ...current, edges: [...current.edges, { source: 'a', target: 'b', label: '待补件' }] };
    const diff = diffDocuments(base, target);
    expect(diff.edgesChanged).toEqual([
      { before: { source: 'a', target: 'b', label: '补件' }, after: { source: 'a', target: 'b', label: '待补件' } },
    ]);
    expect(diff.summary.edgesAdded).toBe(0);
    expect(diff.summary.edgesRemoved).toBe(0);
  });

  it('counts notes removed together with deleted nodes without mutating either document', () => {
    const before = structuredClone(current);
    const target: FlowDoc = { title: '测试流程', nodes: [], edges: [] };
    expect(diffDocuments(current, target).summary.notesRemoved).toBe(2);
    expect(current).toEqual(before);
    expect(target).toEqual({ title: '测试流程', nodes: [], edges: [] });
  });

  it('explains node-order changes that would renumber the annotations', () => {
    const target = { ...current, nodes: [...current.nodes].reverse() };
    const diff = diffDocuments(current, target);
    expect(diff.hasChanges).toBe(true);
    expect(diff.documentChanges).toContainEqual({ field: 'nodeOrder', before: ['请求核实 [a]', '通知机构 [b]'], after: ['通知机构 [b]', '请求核实 [a]'] });
  });

  it('distinguishes reordered parallel edge labels and repeated node titles even with additions', () => {
    const base: FlowDoc = { title: '顺序', nodes: [{ id: 'a', title: '同名' }, { id: 'b', title: '同名' }], edges: [{ source: 'a', target: 'b', label: '是' }, { source: 'a', target: 'b', label: '否' }] };
    const target = { ...base, nodes: [...base.nodes].reverse().concat({ id: 'c', title: '新增' }), edges: [...base.edges].reverse() };
    const changes = diffDocuments(base, target).documentChanges;
    const nodes = changes.find(c => c.field === 'nodeOrder');
    expect(nodes?.before).toEqual(['同名 [a]', '同名 [b]']);
    expect(nodes?.after).toEqual(['同名 [b]', '同名 [a]', '新增 [c]']);
    const edges = changes.find(c => c.field === 'edgeOrder');
    expect(edges?.before).not.toEqual(edges?.after);
    expect((edges?.after as string[])[0]).toContain('否');
  });

  it('preserves complete long templates in the comparison', () => {
    const text = '邮件模板完整内容\n'.repeat(1500);
    const source = { ...current, nodes: [{ id: 'a', title: '核实', note: { text } }] };
    const target = { ...source, nodes: [{ id: 'a', title: '核实' }] };
    expect(diffDocuments(source, target).nodesChanged[0].before.note?.text).toBe(text);
  });
});
