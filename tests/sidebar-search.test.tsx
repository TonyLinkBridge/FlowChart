// @vitest-environment jsdom
import React, { useState } from 'react';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it } from 'vitest';
import { Sidebar } from '@/components/chrome/Sidebar';
import type { Workspace } from '@/lib/store';

afterEach(cleanup);
const workspace: Workspace = {
  currentId: 'a', folders: [{ id: 'ops', name: '案件分组' }, { id: 'done', name: '交付分组' }, { id: 'empty', name: '空分组' }],
  docs: [
    { id: 'a', folderId: 'ops', version: 1, updatedAt: 1, doc: { title: '法院 Verification', nodes: [{ id: 'n', title: 'NODE-ONLY', note: { text: 'MAIL-ONLY' } }], edges: [] } },
    { id: 'b', folderId: 'done', version: 2, updatedAt: 2, doc: { title: '交付域名', nodes: [], edges: [] } },
    { id: 'c', folderId: null, version: 3, updatedAt: 3, doc: { title: 'Archive 归档', nodes: [], edges: [] } },
  ],
};
function setup(initial = workspace) {
  const events: { action: string; args: unknown[] }[] = [];
  const record = (action: string, ...args: unknown[]) => { events.push({ action, args }); };
  function Harness() {
    const [ws, setWs] = useState(initial);
    return <Sidebar ws={ws} spaces={[{ id: 'other-team', name: '另一个 Team' }]}
      onClose={() => record('close')} onPick={id => record('pick', id)}
      onNew={id => record('new', id)} onNewFolder={() => record('new-folder')}
      onRename={(id, title) => {
        record('rename', id, title);
        setWs(current => ({ ...current, docs: current.docs.map(d => d.id === id ? { ...d, doc: { ...d.doc, title } } : d) }));
      }}
      onDelete={id => record('delete', id)} onRenameFolder={(...args) => record('rename-folder', ...args)}
      onDropFolder={id => record('drop-folder', id)} onMoveSpace={(...args) => record('move-space', ...args)}
      onMove={(id, folderId) => {
        record('move', id, folderId);
        setWs(current => ({ ...current, docs: current.docs.map(d => d.id === id ? { ...d, folderId } : d) }));
      }} />;
  }
  return { ...render(<Harness />), user: userEvent.setup(), events };
}
const search = () => screen.getByRole('searchbox', { name: '搜索流程' });

describe('流程库的 Arc 名称搜索', () => {
  it('keeps search and header outside the focusable list and isolates scroll keys and wheel without suppressing native scrolling', async () => {
    const { user, events } = setup();
    const area = screen.getByRole('region', { name: '流程库名单' });
    expect(area.contains(search())).toBe(false);
    expect(area.contains(screen.getByTitle('新建流程图'))).toBe(false);
    expect(area.getAttribute('tabindex')).toBe('0');
    const leaked: string[] = [], listener = (event: Event) => leaked.push(event.type);
    for (const type of ['keydown', 'keyup', 'wheel', 'paste']) window.addEventListener(type, listener);
    try {
      area.focus();
      for (const key of ['ArrowDown', 'PageDown', 'Home', 'End', ' ', 'Delete']) {
        const event = new KeyboardEvent('keydown', { key, bubbles: true, cancelable: true });
        area.dispatchEvent(event); expect(event.defaultPrevented).toBe(false);
        fireEvent.keyUp(area, { key });
      }
      const wheel = new WheelEvent('wheel', { deltaY: 160, bubbles: true, cancelable: true });
      area.dispatchEvent(wheel); expect(wheel.defaultPrevented).toBe(false);
      fireEvent.paste(area); expect(leaked).toEqual([]); expect(events).toEqual([]);
      await user.type(search(), '交付');
      expect(area.querySelectorAll('[data-flow-row]')).toHaveLength(1);
      await user.click(screen.getByRole('button', { name: '清空搜索' }));
      expect(area.querySelectorAll('[data-flow-row]')).toHaveLength(3);
      expect(document.activeElement).toBe(search()); expect(events).toEqual([]);
    } finally { for (const type of ['keydown', 'keyup', 'wheel', 'paste']) window.removeEventListener(type, listener); }
  });

  it('filters names case-insensitively with trimmed query and preserves original groups without callbacks', async () => {
    const before = JSON.stringify(workspace), { user, events } = setup();
    await user.type(search(), '  vERiF  ');
    expect(screen.getByDisplayValue('法院 Verification')).toBeTruthy();
    expect(screen.getAllByDisplayValue('案件分组').some(el => el.tagName === 'INPUT')).toBe(true);
    expect(screen.queryByDisplayValue('交付域名')).toBeNull();
    expect(screen.queryByDisplayValue('交付分组')).toBeNull();
    expect(screen.queryByDisplayValue('空分组')).toBeNull();
    expect(events).toEqual([]); expect(JSON.stringify(workspace)).toBe(before);
    expect(search().getAttribute('aria-controls')).toBeTruthy();
    expect(document.getElementById(search().getAttribute('aria-describedby')!)?.textContent).toContain('当前空间');
  });

  it('does not search node text, email contents, folder names or any unloaded workspace', async () => {
    const { user, events } = setup();
    for (const value of ['NODE-ONLY', 'MAIL-ONLY', '案件分组', '未加载 Team 的流程']) {
      fireEvent.change(search(), { target: { value } });
      expect(screen.getByRole('status').textContent).toContain('没有匹配的流程');
      expect(document.querySelectorAll('[data-flow-row]')).toHaveLength(0);
    }
    await user.click(screen.getByRole('button', { name: '清空搜索' }));
    expect(document.activeElement).toBe(search());
    expect(document.querySelectorAll('[data-flow-row]')).toHaveLength(3);
    expect(screen.getByDisplayValue('空分组')).toBeTruthy();
    expect(events).toEqual([]);
  });

  it('keeps Escape, Space, Delete and paste away from the canvas and disables the exiting clear button', async () => {
    const { user, events } = setup();
    const leaked: string[] = [], listener = (event: Event) => leaked.push(event.type);
    for (const event of ['keydown', 'keyup', 'paste']) window.addEventListener(event, listener);
    try {
      await user.type(search(), 'Fake Search');
      fireEvent.paste(search(), { clipboardData: { getData: () => '本地假搜索' } });
      await user.keyboard('{Delete}{Backspace}{Escape}');
      expect((search() as HTMLInputElement).value).toBe('');
      expect(document.activeElement).toBe(search());
      await user.keyboard('{Escape}');
      fireEvent.change(search(), { target: { value: '法院' } });
      const clear = screen.getByRole('button', { name: '清空搜索' });
      await user.click(clear);
      // Exit animation may keep a visual glyph, but it must no longer be interactive.
      if (clear.isConnected) expect((clear as HTMLButtonElement).disabled).toBe(true);
      await waitFor(() => expect(screen.queryByRole('button', { name: '清空搜索' })).toBeNull());
      expect(leaked).toEqual([]); expect(events).toEqual([]);
    } finally { for (const event of ['keydown', 'keyup', 'paste']) window.removeEventListener(event, listener); }
  });

  it('does not clear an in-progress Chinese composition when Escape is used to cancel IME', () => {
    const { events } = setup();
    fireEvent.change(search(), { target: { value: '法院' } });
    fireEvent.keyDown(search(), { key: 'Escape', isComposing: true });
    expect((search() as HTMLInputElement).value).toBe('法院');
    fireEvent.keyDown(search(), { key: 'Escape' });
    expect((search() as HTMLInputElement).value).toBe(''); expect(events).toEqual([]);
  });

  it('keeps selection, moving and rename callbacks working while filtered, without hiding an ongoing rename', async () => {
    const { user, events } = setup();
    await user.type(search(), '交付');
    await user.click(screen.getByDisplayValue('交付域名'));
    expect(events).toEqual([{ action: 'pick', args: ['b'] }]);
    await user.selectOptions(screen.getByTitle('移到分组'), 'ops');
    expect(screen.getAllByDisplayValue('案件分组').some(el => el.tagName === 'INPUT')).toBe(true);
    expect(events.at(-1)).toEqual({ action: 'move', args: ['b', 'ops'] });
    const name = screen.getByDisplayValue('交付域名');
    fireEvent.doubleClick(name);
    fireEvent.change(name, { target: { value: '新名称' } });
    expect(screen.getByDisplayValue('新名称')).toBe(name);
    expect(events.at(-1)).toEqual({ action: 'rename', args: ['b', '新名称'] });
    fireEvent.blur(name);
    expect(screen.queryByDisplayValue('新名称')).toBeNull();
    await user.click(screen.getByRole('button', { name: '清空搜索' }));
    expect(screen.getByDisplayValue('新名称')).toBeTruthy();
  });

  it('retains the delete confirmation and can cancel without selecting or deleting a flow', async () => {
    const { user, events } = setup();
    await user.type(search(), '交付');
    await user.click(screen.getByTitle('删除'));
    expect((await screen.findByRole('dialog')).textContent).toContain('交付域名');
    await user.click(screen.getByRole('button', { name: '取消' }));
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
    expect(screen.getByDisplayValue('交付域名')).toBeTruthy(); expect(events).toEqual([]);
  });

  it('clears a filter before explicit new-flow or new-folder actions so new items are not hidden', async () => {
    const { user, events } = setup();
    await user.type(search(), '不存在');
    await user.click(screen.getByTitle('新建流程图'));
    expect((search() as HTMLInputElement).value).toBe('');
    expect(events).toEqual([{ action: 'new', args: [null] }]);
    await user.type(search(), '不存在'); await user.click(screen.getByTitle('新建分组'));
    expect((search() as HTMLInputElement).value).toBe('');
    expect(events.at(-1)).toEqual({ action: 'new-folder', args: [] });
  });
});
