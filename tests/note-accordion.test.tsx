// @vitest-environment jsdom
import React, { useState } from 'react';
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import { NotePopover } from '@/components/flow/NotePopover';
import { NoteSections } from '@/components/views/NoteSections';
import type { Note } from '@/lib/types';

afterEach(cleanup);
// Motion restores scroll after measuring auto height; jsdom has no scrolling/layout implementation.
beforeAll(() => {
  vi.spyOn(window, 'scrollTo').mockImplementation(() => {});
  vi.stubGlobal('ResizeObserver', class { observe() {} unobserve() {} disconnect() {} });
});
afterAll(() => { vi.restoreAllMocks(); vi.unstubAllGlobals(); });
const mail = 'Dear Provider,\nLocal fake email only.\n'.repeat(100) + 'END-MAIL-KEEP';
const original: Note = {
  text: mail, contact: '测试联系人',
  steps: [{ text: '核对假资料', done: true }],
  fields: [{ label: '测试编号', value: 'FAKE-ONLY-123' }],
  links: [{ label: '假资料链接', url: 'https://example.com/test' }],
};
const titles = ['操作步骤', '要填的资料', '相关链接', '联系人', '附注／邮件模板'];
const trigger = (name: string) => screen.getByRole('button', { name });

function setup(note: Note = original) {
  const changes: (Note | undefined)[] = [];
  function Harness() {
    const [current, setCurrent] = useState<Note | undefined>(note);
    const [expanded, setExpanded] = useState(false);
    return <NotePopover node={{ id: 'fake-only', title: '假数据邮件', note: current }} index={1}
      x={10} y={10} canvasW={1200} pinned expanded={expanded}
      onPin={() => setExpanded(true)} onEnter={() => {}} onLeave={() => {}} onClose={() => setExpanded(false)}
      onToggleExpand={() => setExpanded(value => !value)}
      onChange={next => { changes.push(next); setCurrent(next); }} />;
  }
  render(<Harness />);
  return { changes };
}

describe('附注侧栏使用 Arc Accordion', () => {
  it('opens the complete email by default and hides the other four groups without saving', async () => {
    const { changes } = setup();
    await userEvent.click(trigger('展开'));
    await screen.findByRole('dialog');
    for (const title of titles)
      expect(trigger(title).getAttribute('aria-expanded')).toBe(title === '附注／邮件模板' ? 'true' : 'false');
    expect(screen.getByRole('textbox').getAttribute('contenteditable')).toBe('true');
    await userEvent.click(screen.getByRole('tab', { name: '原文编辑' }));
    expect((screen.getByRole('textbox') as HTMLTextAreaElement).value).toBe(mail);
    expect(changes).toEqual([]);
  });

  it('retains unsaved-to-server input when switching groups and reopening the drawer', async () => {
    const { changes } = setup();
    await userEvent.click(trigger('展开'));
    await screen.findByRole('dialog');
    await userEvent.click(screen.getByRole('tab', { name: '原文编辑' }));
    fireEvent.change(screen.getByRole('textbox'), { target: { value: mail + '\n本地修改' } });
    await userEvent.click(trigger('操作步骤'));
    expect(trigger('附注／邮件模板').getAttribute('aria-expanded')).toBe('false');
    expect(screen.getByDisplayValue('核对假资料')).toBeTruthy();
    await userEvent.click(trigger('附注／邮件模板'));
    expect((screen.getByRole('textbox') as HTMLTextAreaElement).value).toBe(mail + '\n本地修改');
    await userEvent.keyboard('{Escape}');
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
    await userEvent.click(trigger('展开'));
    await screen.findByRole('dialog');
    await userEvent.click(screen.getByRole('tab', { name: '原文编辑' }));
    expect((screen.getByRole('textbox') as HTMLTextAreaElement).value).toBe(mail + '\n本地修改');
    expect(changes).toEqual([{ ...original, text: mail + '\n本地修改' }]);
  });

  it('updates every structured group through the original callback without dropping other fields', async () => {
    const { changes } = setup();
    await userEvent.click(trigger('展开'));
    await screen.findByRole('dialog');
    await userEvent.click(trigger('操作步骤'));
    fireEvent.change(screen.getByDisplayValue('核对假资料'), { target: { value: '新假步骤' } });
    await userEvent.click(trigger('要填的资料'));
    fireEvent.change(screen.getByDisplayValue('FAKE-ONLY-123'), { target: { value: 'FAKE-ONLY-456' } });
    await userEvent.click(trigger('相关链接'));
    fireEvent.change(screen.getByDisplayValue('https://example.com/test'), { target: { value: 'https://example.com/local' } });
    await userEvent.click(trigger('联系人'));
    fireEvent.change(screen.getByDisplayValue('测试联系人'), { target: { value: '新假联系人' } });
    expect(changes).toHaveLength(4);
    expect(changes.at(-1)).toEqual({
      text: mail, contact: '新假联系人',
      steps: [{ text: '新假步骤', done: true }],
      fields: [{ label: '测试编号', value: 'FAKE-ONLY-456' }],
      links: [{ label: '假资料链接', url: 'https://example.com/local' }],
    });
  });

  it('supports arrow, Home, End, Enter and Space keys without leaking keys to the canvas', async () => {
    setup();
    await userEvent.click(trigger('展开'));
    await screen.findByRole('dialog');
    const leaked: string[] = [];
    const onKey = (event: KeyboardEvent) => { leaked.push(event.key); };
    window.addEventListener('keydown', onKey);
    try {
      trigger('附注／邮件模板').focus();
      await userEvent.keyboard('{ArrowUp}');
      await waitFor(() => expect(document.activeElement).toBe(trigger('联系人')));
      await userEvent.keyboard('{Home}');
      await waitFor(() => expect(document.activeElement).toBe(trigger('操作步骤')));
      await userEvent.keyboard('{End}');
      await waitFor(() => expect(document.activeElement).toBe(trigger('附注／邮件模板')));
      await userEvent.keyboard('{ArrowDown}');
      await waitFor(() => expect(document.activeElement).toBe(trigger('操作步骤')));
      await userEvent.keyboard('{Enter}');
      expect(trigger('操作步骤').getAttribute('aria-expanded')).toBe('true');
      await userEvent.keyboard(' ');
      expect(trigger('操作步骤').getAttribute('aria-expanded')).toBe('false');
    } finally { window.removeEventListener('keydown', onKey); }
    expect(leaked).toEqual([]);
  });

  it('keeps collapsed content mounted but out of the accessible tree and links trigger IDs to panels', async () => {
    setup();
    await userEvent.click(trigger('展开'));
    const dialog = await screen.findByRole('dialog');
    const email = trigger('附注／邮件模板');
    await userEvent.click(screen.getByRole('tab', { name: '原文编辑' }));
    const panel = document.getElementById(email.getAttribute('aria-controls')!)!;
    expect(panel.getAttribute('aria-labelledby')).toBe(email.id);
    expect(email.closest('h3')).toBeTruthy();
    const input = within(dialog).getByRole('textbox');
    await userEvent.click(email);
    await waitFor(() => expect(within(dialog).queryByRole('textbox')).toBeNull());
    expect(panel.hasAttribute('inert')).toBe(true);
    expect(panel.getAttribute('aria-hidden')).toBe('true');
    expect(panel.contains(input)).toBe(true);
    expect((input as HTMLTextAreaElement).value).toBe(mail);
    await userEvent.click(email);
    expect(within(dialog).getByRole('textbox')).toBe(input);
  });

  it('keeps empty email editable and does not change existing non-drawer section layout', async () => {
    const { changes } = setup({});
    await userEvent.click(trigger('展开'));
    await screen.findByRole('dialog');
    await userEvent.click(screen.getByRole('tab', { name: '原文编辑' }));
    fireEvent.change(screen.getByRole('textbox'), { target: { value: '第一段假邮件' } });
    expect(changes).toEqual([{ text: '第一段假邮件' }]);
    cleanup();
    render(<NoteSections note={original} onChange={() => {}} onRemoveNote={() => {}} />);
    expect(screen.queryByRole('button', { name: '操作步骤' })).toBeNull();
    expect(screen.getByDisplayValue('核对假资料')).toBeTruthy();
    expect(screen.getByDisplayValue('测试联系人')).toBeTruthy();
  });
});
