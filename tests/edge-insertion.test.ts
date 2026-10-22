import { describe, expect, it } from 'vitest';
import * as operations from '@/lib/doc';
import { footnoteIndex, type FlowDoc } from '@/lib/types';
import { branchedFlow } from './fixtures/branched-flow';

const copy = (): FlowDoc => structuredClone(branchedFlow);
function insert(doc: FlowDoc, index: number) {
  const result = operations.insertNodeOnEdge(doc, index);
  if ('error' in result) throw new Error(result.error);
  return result;
}

describe('在指定连线上插入一步', () => {
  it('replaces only the chosen branch and preserves its label, dash style and complete node data', () => {
    const doc = copy(), before = structuredClone(doc);
    const { doc: next, id } = insert(doc, 2);
    expect(next.edges).toEqual([
      doc.edges[0], doc.edges[1], { source: 'decision', target: id, label: '是', dashed: true },
      { source: id, target: 'court', dashed: true }, ...doc.edges.slice(3),
    ]);
    for (const old of doc.nodes) {
      expect(next.nodes.find(n => n.id === old.id)).toEqual({ ...old, x: expect.any(Number), y: expect.any(Number) });
    }
    expect([...footnoteIndex(next)]).toEqual([...footnoteIndex(doc)]);
    expect(doc).toEqual(before);
  });

  it('does not move any existing node when the gap already fits the new step', () => {
    const doc = copy();
    doc.nodes.filter(n => !['notice', 'unrelated'].includes(n.id)).forEach(n => { n.y! += 124; });
    const { doc: next, id } = insert(doc, 0);
    expect(next.nodes.filter(n => n.id !== id)).toEqual(doc.nodes);
    expect(next.nodes.find(n => n.id === id)).toMatchObject({ x: 300, y: 200, title: '新步骤' });
  });

  it('makes exactly enough room for a tight trunk without moving an unrelated node', () => {
    const doc = copy(), { doc: next, id } = insert(doc, 0);
    expect(next.nodes.find(n => n.id === id)).toMatchObject({ x: 300, y: 176 });
    for (const old of doc.nodes) {
      const expectedY = ['notice', 'unrelated'].includes(old.id) ? old.y : old.y! + 76;
      expect(next.nodes.find(n => n.id === old.id)).toEqual({ ...old, y: expectedY });
    }
  });

  it('moves only the chosen branch and its shared downstream join, not the sibling branch', () => {
    const doc = copy(), { doc: next, id } = insert(doc, 2);
    expect(next.nodes.find(n => n.id === id)).toMatchObject({ x: 100, y: 346 });
    expect(next.nodes.find(n => n.id === 'court')!.y).toBe(422);
    expect(next.nodes.find(n => n.id === 'join')!.y).toBe(672);
    for (const old of doc.nodes.filter(n => !['court', 'join'].includes(n.id))) {
      expect(next.nodes.find(n => n.id === old.id)).toEqual(old);
    }
  });

  it('uses the exact edge index even for parallel edges', () => {
    const doc = copy(); doc.edges.splice(2, 0, { source: 'decision', target: 'court', label: '另一个条件' });
    const { doc: next, id } = insert(doc, 3);
    expect(next.edges[2]).toEqual(doc.edges[2]);
    expect(next.edges[3]).toEqual({ source: 'decision', target: id, label: '是', dashed: true });
  });

  it('does not reuse an existing node id', () => {
    const doc = copy(); doc.nodes[6].id = 'n8';
    expect(insert(doc, 0).id).toBe('n9');
  });

  it.each([-1, 100, 0.5, NaN])('rejects invalid edge index %s without changing the document', index => {
    const doc = copy(), before = structuredClone(doc);
    expect(operations.insertNodeOnEdge(doc, index)).toHaveProperty('error'); expect(doc).toEqual(before);
  });

  it('refuses to move locked downstream nodes but permits insertion with enough room', () => {
    const doc = copy(); doc.nodes.find(n => n.id === 'wait')!.locked = true;
    expect(operations.insertNodeOnEdge(doc, 0)).toHaveProperty('error');
    doc.nodes.filter(n => !['notice', 'unrelated'].includes(n.id)).forEach(n => { n.y! += 124; });
    expect(insert(doc, 0).doc.nodes.find(n => n.id === 'wait')!.y).toBe(300);
  });

  it('rejects a cycle rather than shifting the source through its own descendants', () => {
    const doc = copy(); doc.edges.push({ source: 'join', target: 'notice' });
    expect(operations.insertNodeOnEdge(doc, 0)).toHaveProperty('error');
  });

  it('rejects collisions with another branch without partially applying the operation', () => {
    const doc = copy(); doc.nodes.push({ id: 'obstacle', title: '不能被盖住', x: 300, y: 176 });
    const before = structuredClone(doc);
    expect(operations.insertNodeOnEdge(doc, 0)).toHaveProperty('error'); expect(doc).toEqual(before);
  });

  it('also rejects a collision caused by shifting a distant downstream join', () => {
    const doc = copy(); doc.nodes.push({ id: 'obstacle', title: '另一条独立分支', x: 300, y: 726 });
    const before = structuredClone(doc);
    expect(operations.insertNodeOnEdge(doc, 0)).toHaveProperty('error'); expect(doc).toEqual(before);
  });

  it('rejects dangling, backward and unpositioned connections safely', () => {
    const doc = copy(); doc.edges[0].target = 'missing';
    expect(operations.insertNodeOnEdge(doc, 0)).toHaveProperty('error');
    doc.edges[0] = { source: 'wait', target: 'notice' };
    expect(operations.insertNodeOnEdge(doc, 0)).toHaveProperty('error');
    doc.edges[0] = { source: 'notice', target: 'wait' }; delete doc.nodes[0].x;
    expect(operations.insertNodeOnEdge(doc, 0)).toHaveProperty('error');
  });
});
