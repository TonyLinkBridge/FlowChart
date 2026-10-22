// @vitest-environment jsdom
import React, { useState } from 'react';
import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import { NoteSections } from '@/components/views/NoteSections';
import type { Note } from '@/lib/types';

const mail = '  Dear **Manager**,\r\nFirst line.\r\n\r\n\r\nRegards,\r\nCase Team\r\n';
const original: Note = { text: mail, contact: '假联系人', steps: [{ text: '检查', done: false }],
  fields: [{ label: '编号', value: 'LOCAL-ONLY' }], links: [{ label: '参考', url: 'https://example.test' }] };
const clipboard = Object.getOwnPropertyDescriptor(navigator, 'clipboard');
beforeAll(() => {
  vi.spyOn(window, 'scrollTo').mockImplementation(() => {});
  vi.stubGlobal('ResizeObserver', class { observe() {} unobserve() {} disconnect() {} });
});
afterEach(() => {
  cleanup(); vi.useRealTimers();
  if (clipboard) Object.defineProperty(navigator, 'clipboard', clipboard);
  else Reflect.deleteProperty(navigator, 'clipboard');
});
afterAll(() => { vi.restoreAllMocks(); vi.unstubAllGlobals(); });
function setup(note = original) {
  const user = userEvent.setup(), copied: string[] = [], changes: Note[] = [];
  // Only the browser clipboard boundary is fake; editor, Arc and callbacks stay real.
  Object.defineProperty(navigator, 'clipboard', { configurable: true, value: {
    writeText: async (value: string) => { copied.push(value); },
  } });
  function Harness() {
    const [current, setCurrent] = useState(note);
    return <NoteSections collapsible note={current} onChange={next => { changes.push(next); setCurrent(next); }} onRemoveNote={() => {}} />;
  }
  return { ...render(<Harness />), user, copied, changes };
}

describe('展开附注的 Arc 复制原文', () => {
  it('copies exact source including Markdown, leading spaces, CRLF, blank lines and final newline without saving', async () => {
    const { user, copied, changes } = setup();
    expect(copied).toEqual([]);
    await user.click(screen.getByRole('button', { name: '复制原文' }));
    await waitFor(() => expect(screen.getByRole('status').textContent).toContain('已复制'));
    expect(copied).toEqual([mail]); expect(changes).toEqual([]);
  });

  it('copies the latest raw edit, not rendered HTML or the first loaded value', async () => {
    const { user, copied, changes } = setup();
    await user.click(screen.getByRole('tab', { name: '原文编辑' }));
    const next = '#### 保留标题\n\n3) 特殊编号\n`raw`\n';
    fireEvent.change(screen.getByRole('textbox', { name: '附注／邮件模板原文' }), { target: { value: next } });
    expect(changes).toEqual([{ ...original, text: next }]);
    await user.click(screen.getByRole('button', { name: '复制原文' }));
    expect(copied).toEqual([next]); expect(changes).toHaveLength(1);
  });

  it('reports failure truthfully and permits retry without changing the note', async () => {
    const { user, copied, changes } = setup();
    Object.defineProperty(navigator, 'clipboard', { configurable: true, value: undefined });
    await user.click(screen.getByRole('button', { name: '复制原文' }));
    await waitFor(() => expect(screen.getByRole('status').textContent).toContain('无法复制'));
    expect(copied).toEqual([]); expect(changes).toEqual([]);
    Object.defineProperty(navigator, 'clipboard', { configurable: true, value: {
      writeText: async (value: string) => { copied.push(value); },
    } });
    await user.click(screen.getByRole('button', { name: '复制原文' }));
    await waitFor(() => expect(screen.getByRole('status').textContent).toContain('已复制'));
    expect(copied).toEqual([mail]); expect(changes).toEqual([]);
  });

  it('disables whitespace-only copy and leaves the original small editor unchanged', async () => {
    const { user, copied, changes } = setup({ text: ' \n\t' });
    const button = screen.getByRole('button', { name: '复制原文' }) as HTMLButtonElement;
    expect(button.disabled).toBe(true); await user.click(button);
    expect(copied).toEqual([]); expect(changes).toEqual([]);
    cleanup();
    render(<NoteSections note={original} onChange={() => {}} onRemoveNote={() => {}} />);
    expect(screen.queryByRole('button', { name: '复制原文' })).toBeNull();
  });

  it('copies using Enter and Space without leaking keyboard shortcuts to the canvas', async () => {
    const { user, copied, changes } = setup();
    const leaked: string[] = [], listener = (event: KeyboardEvent) => leaked.push(event.key);
    window.addEventListener('keydown', listener); window.addEventListener('keyup', listener);
    try {
      screen.getByRole('tab', { name: '格式编辑' }).focus();
      // Copy lives before the editor modes in the tab order.
      await user.tab({ shift: true });
      const button = screen.getByRole('button', { name: '复制原文' });
      expect(document.activeElement).toBe(button);
      leaked.length = 0;
      await user.keyboard('{Enter} {Delete}{Backspace}');
      expect(copied).toEqual([mail, mail]); expect(leaked).toEqual([]);
      expect(document.activeElement).toBe(button); expect(changes).toEqual([]);
    } finally { window.removeEventListener('keydown', listener); window.removeEventListener('keyup', listener); }
  });

  it('returns its live status to idle after feedback instead of keeping stale confirmation', async () => {
    setup(); vi.useFakeTimers();
    await act(async () => { fireEvent.click(screen.getByRole('button', { name: '复制原文' })); });
    expect(screen.getByRole('status').textContent).toContain('已复制');
    await act(async () => { vi.advanceTimersByTime(1900); });
    expect(screen.getByRole('status').textContent).toBe('');
    expect(screen.getByRole('button', { name: '复制原文' }).getAttribute('data-copy-state')).toBe('idle');
  });
});
