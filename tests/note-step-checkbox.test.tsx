// @vitest-environment jsdom
import React, { useState } from 'react';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import { NoteSections } from '@/components/views/NoteSections';
import type { Note } from '@/lib/types';

const original: Note = { text: 'Dear Manager,\r\n\r\nEND-MAIL\r\n', contact: '假联系人',
  steps: [{ text: '核对材料', done: false }, { text: '发出通知', done: true }, { text: '', done: false }],
  fields: [{ label: '案件', value: 'FAKE-ONLY' }], links: [{ label: '参考', url: 'https://example.test' }] };
beforeAll(() => {
  vi.spyOn(window, 'scrollTo').mockImplementation(() => {});
  vi.stubGlobal('ResizeObserver', class { observe() {} unobserve() {} disconnect() {} });
});
afterEach(cleanup);
afterAll(() => { vi.restoreAllMocks(); vi.unstubAllGlobals(); });
function setup() {
  const changes: Note[] = [];
  function Harness() {
    const [note, setNote] = useState(original);
    return <NoteSections note={note} onChange={next => { changes.push(next); setNote(next); }} onRemoveNote={() => {}} />;
  }
  return { ...render(<Harness />), user: userEvent.setup(), changes };
}

describe('附注操作步骤使用 Arc Checkbox', () => {
  // Catches inaccessible spans and missing controlled state/name wiring in NoteSections.
  it('can Tab to a named checkbox and toggle with Space without rewriting other note fields', async () => {
    const { user, changes } = setup();
    const first = screen.getByRole('checkbox', { name: '操作步骤 1：核对材料' });
    expect(changes).toEqual([]);
    await user.tab(); await user.tab();
    expect(document.activeElement).toBe(first);
    await user.keyboard(' ');
    expect(first.getAttribute('aria-checked')).toBe('true');
    expect(screen.getByText('2 / 3')).toBeTruthy();
    expect(changes).toEqual([{ ...original, steps: [{ text: '核对材料', done: true }, original.steps![1], original.steps![2]] }]);
    await user.keyboard(' ');
    expect(first.getAttribute('aria-checked')).toBe('false'); expect(changes.at(-1)).toEqual(original);
  });

  it('only toggles the clicked step once and keeps a meaningful name for an empty step', async () => {
    const { user, changes } = setup();
    await user.click(screen.getByRole('checkbox', { name: '操作步骤 2：发出通知' }));
    expect(changes).toHaveLength(1);
    expect(changes[0]).toEqual({ ...original, steps: [original.steps![0], { text: '发出通知', done: false }, original.steps![2]] });
    expect(screen.getByRole('checkbox', { name: '操作步骤 3：未命名步骤' }).getAttribute('aria-checked')).toBe('false');
    fireEvent.change(screen.getAllByPlaceholderText('这一步要做什么')[0], { target: { value: '最新步骤文字' } });
    expect(screen.getByRole('checkbox', { name: '操作步骤 1：最新步骤文字' })).toBeTruthy();
  });

  it('does not submit an enclosing form on Space or click and isolates canvas keys and paste', async () => {
    const submits: string[] = [], keys: string[] = [], pastes: string[] = [], changes: Note[] = [];
    const listener = (event: KeyboardEvent) => keys.push(event.key);
    const paste = () => pastes.push('canvas paste');
    render(<form onSubmit={event => { event.preventDefault(); submits.push('submit'); }}>
      <NoteSections note={original} onChange={next => changes.push(next)} onRemoveNote={() => {}} />
    </form>);
    const checkbox = screen.getByRole('checkbox', { name: '操作步骤 1：核对材料' });
    window.addEventListener('keydown', listener); window.addEventListener('keyup', listener); window.addEventListener('paste', paste);
    try {
      checkbox.focus(); const user = userEvent.setup();
      await user.keyboard('{Delete} '); fireEvent.paste(checkbox); await user.click(checkbox);
      expect(keys).toEqual([]); expect(pastes).toEqual([]); expect(submits).toEqual([]); expect(changes).toHaveLength(2);
    } finally {
      window.removeEventListener('keydown', listener); window.removeEventListener('keyup', listener); window.removeEventListener('paste', paste);
    }
  });
});
