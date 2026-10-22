// @vitest-environment jsdom
import React, { useRef, useState } from 'react';
import { cleanup, render, screen, act } from '@testing-library/react';
import { afterEach, expect, it } from 'vitest';
import { SaveBarrier } from '@/lib/save-barrier';
import { acceptRestoredDocument, publishMergedSave } from '@/lib/save-document';
import { sameVersionValue } from '@/lib/version-diff';
import type { FlowDoc } from '@/lib/types';

afterEach(cleanup);

it.each([false, true])('publishes merged peer content before the save barrier resumes (extra local edits: %s)', async extraEdits => {
  const local: FlowDoc = { title: '本地', nodes: [{ id: 'a', title: '本地步骤' }], edges: [] };
  const merged: FlowDoc = { ...local, nodes: [...local.nodes, { id: 'peer', title: '同事步骤' }] };
  const latest = extraEdits ? { ...local, nodes: [...local.nodes, { id: 'new', title: '刚输入的步骤' }] } : local;
  let run!: () => Promise<void>;
  let seen: FlowDoc | undefined;
  function Harness() {
    const [doc, setDoc] = useState(latest);
    const docRef = useRef(doc);
    docRef.current = doc;
    const loaded = useRef<FlowDoc | null>(null);
    run = async () => {
      const barrier = new SaveBarrier();
      let finish!: () => void;
      const response = new Promise<void>(resolve => { finish = resolve; });
      barrier.track('chosen', response.then(() => {
        publishMergedSave(local, merged, docRef, loaded, setDoc);
      }));
      const prepare = barrier.waitFor('chosen').then(() => { seen = docRef.current; });
      finish();
      await prepare;
    };
    return <div>{doc.nodes.map(node => node.title).join('、')}</div>;
  }
  render(<Harness />);
  await act(async () => { await run(); });
  expect(seen?.nodes.some(node => node.id === 'peer')).toBe(true);
  expect(seen?.nodes.some(node => node.id === 'new')).toBe(extraEdits);
  if (!extraEdits) expect(sameVersionValue(seen, merged)).toBe(true);
  expect(screen.getByText(/同事步骤/)).toBeTruthy();
});

it('accepts only the still-open flow and never replaces newer local data', () => {
  const original: FlowDoc = { title: '未改动', nodes: [], edges: [] };
  const restored = { ...original, title: '恢复后' };
  const sync = { current: { id: 'a' as string | null, doc: original as FlowDoc | null, version: 10 } };
  const current = { current: original }, loaded = { current: original as FlowDoc | null };
  let rendered: FlowDoc | undefined;
  const render = (doc: FlowDoc) => { rendered = doc; };
  expect(acceptRestoredDocument('a', { doc: restored, version: 11 }, 'b', sync, current, loaded, render)).toBe(false);
  expect(current.current).toBe(original);
  expect(acceptRestoredDocument('a', { doc: restored, version: 9 }, 'a', sync, current, loaded, render)).toBe(false);
  expect(rendered).toBeUndefined();
  expect(acceptRestoredDocument('a', { doc: restored, version: 11 }, 'a', sync, current, loaded, render)).toBe(true);
  expect(sync.current).toEqual({ id: 'a', doc: restored, version: 11 });
  expect(current.current).toBe(restored);
  expect(loaded.current).toBe(restored);
  expect(rendered).toBe(restored);
});
