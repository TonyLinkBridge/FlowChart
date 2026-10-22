// @vitest-environment jsdom
import React, { useState } from 'react';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import { FlowTitleEditor } from '@/components/chrome/FlowTitleEditor';
import { InlineEdit } from '@/components/arc/inline-edit/inline-edit';

beforeAll(() => {
  vi.spyOn(window, 'scrollTo').mockImplementation(() => {});
  vi.stubGlobal('ResizeObserver', class { observe() {} unobserve() {} disconnect() {} });
});
afterEach(cleanup);
afterAll(() => { vi.restoreAllMocks(); vi.unstubAllGlobals(); });
function setup(initial = '原来的标题') {
  const confirmed: { id: string; title: string }[] = [];
  function Harness() {
    const [value, setValue] = useState(initial);
    return <><FlowTitleEditor flowId="fake-a" value={value} onConfirm={(id, title) => {
      confirmed.push({ id, title }); setValue(title);
    }} /><button>外部位置</button></>;
  }
  return { ...render(<Harness />), user: userEvent.setup(), confirmed };
}
const input = () => screen.getByRole('textbox', { name: '流程图标题' });

describe('左上标题使用 Arc Inline edit', () => {
  it('does not normalize or save an untouched old title, even when its spacing is unusual', async () => {
    const { user, confirmed } = setup('  Old   title  ');
    await user.click(screen.getByRole('button', { name: '流程图标题: Old title' }));
    await user.keyboard('{Enter}');
    expect(confirmed).toEqual([]);
    const display = screen.getByRole('button', { name: '流程图标题: Old title' });
    expect(display).toBe(document.activeElement);
    expect(display.getAttribute('aria-label')).toBe('流程图标题:   Old   title  ');
  });

  it('supports Space to edit, Enter to confirm and Tab to commit a later draft', async () => {
    const { user, confirmed } = setup();
    screen.getByRole('button', { name: '流程图标题: 原来的标题' }).focus();
    await user.keyboard(' ');
    expect(document.activeElement).toBe(input());
    fireEvent.change(input(), { target: { value: '确认后的标题' } }); await user.keyboard('{Enter}');
    await waitFor(() => expect(confirmed).toEqual([{ id: 'fake-a', title: '确认后的标题' }]));
    await user.click(screen.getByRole('button', { name: '流程图标题: 确认后的标题' }));
    fireEvent.change(input(), { target: { value: 'Tab 确认的标题' } });
    // Save/cancel stay inside the component; leaving its final action commits.
    await user.tab(); await user.tab(); await user.tab();
    await waitFor(() => expect(confirmed.at(-1)).toEqual({ id: 'fake-a', title: 'Tab 确认的标题' }));
    expect(screen.getByRole('button', { name: '外部位置' })).toBe(document.activeElement);
  });

  it('cancels with Escape or the cancel button, blocks canvas keys and disables exiting actions', async () => {
    const { user, confirmed } = setup();
    await user.click(screen.getByRole('button', { name: '流程图标题: 原来的标题' }));
    const leaked: string[] = [], listener = (event: KeyboardEvent) => leaked.push(event.key);
    window.addEventListener('keydown', listener); window.addEventListener('keyup', listener);
    try {
      await user.type(input(), ' 本地草稿');
      await user.keyboard('{Delete}{Escape}');
      expect(confirmed).toEqual([]); expect(leaked).toEqual([]);
      await user.click(screen.getByRole('button', { name: '流程图标题: 原来的标题' }));
      fireEvent.change(input(), { target: { value: '另一个草稿' } });
      const cancel = screen.getByRole('button', { name: '取消编辑' });
      const submit = screen.getByRole('button', { name: '确认流程图标题' });
      await user.click(cancel);
      if (submit.isConnected) expect((submit as HTMLButtonElement).disabled).toBe(true);
      expect(confirmed).toEqual([]);
    } finally { window.removeEventListener('keydown', listener); window.removeEventListener('keyup', listener); }
  });

  it('keeps Chinese composition intact when Enter or Escape belongs to the IME', async () => {
    const { user, confirmed } = setup();
    await user.click(screen.getByRole('button', { name: '流程图标题: 原来的标题' }));
    fireEvent.change(input(), { target: { value: '正在输入中文' } });
    fireEvent.keyDown(input(), { key: 'Enter', isComposing: true });
    fireEvent.keyDown(input(), { key: 'Escape', isComposing: true });
    expect((input() as HTMLInputElement).value).toBe('正在输入中文'); expect(confirmed).toEqual([]);
    await user.keyboard('{Escape}'); expect(confirmed).toEqual([]);
  });

  it('keeps empty input invalid and links a readable validation message to the input', async () => {
    const { user, confirmed } = setup();
    await user.click(screen.getByRole('button', { name: '流程图标题: 原来的标题' }));
    fireEvent.change(input(), { target: { value: '   ' } });
    await user.click(screen.getByRole('button', { name: '确认流程图标题' }));
    expect(input().getAttribute('aria-invalid')).toBe('true');
    const ids = input().getAttribute('aria-describedby')!.split(' ');
    expect(ids.some(id => document.getElementById(id)?.textContent?.includes('流程名称不能为空'))).toBe(true);
    expect(confirmed).toEqual([]);
  });

  it('resets the editing session for another flow and accepts external title updates while idle', async () => {
    const changes: string[] = [], user = userEvent.setup();
    const props = { onConfirm: (_id: string, value: string) => changes.push(value) };
    const { rerender } = render(<FlowTitleEditor {...props} flowId="fake-a" value="A 原名" />);
    await user.click(screen.getByRole('button', { name: '流程图标题: A 原名' }));
    fireEvent.change(input(), { target: { value: 'A 草稿' } });
    rerender(<FlowTitleEditor {...props} flowId="fake-b" value="B 原名" />);
    expect(screen.queryByRole('textbox')).toBeNull();
    expect(screen.getByRole('button', { name: '流程图标题: B 原名' })).toBeTruthy();
    rerender(<FlowTitleEditor {...props} flowId="fake-b" value="B 外部更新" />);
    expect(screen.getByRole('button', { name: '流程图标题: B 外部更新' })).toBeTruthy(); expect(changes).toEqual([]);
  });

  it('retains the Arc async rejection rollback and retry when onSave is actually asynchronous', async () => {
    let fail = true; const persisted: string[] = [], user = userEvent.setup();
    function Harness() {
      const [value, setValue] = useState('原名');
      return <InlineEdit label="测试名称" value={value} onSave={async next => {
        if (fail) throw new Error('本地模拟失败');
        persisted.push(next); setValue(next);
      }} />;
    }
    render(<Harness />);
    await user.click(screen.getByRole('button', { name: '测试名称: 原名' }));
    fireEvent.change(screen.getByRole('textbox', { name: '测试名称' }), { target: { value: '新名' } });
    await user.keyboard('{Enter}');
    const retry = await screen.findByRole('button', { name: '重试' });
    expect(screen.getByRole('button', { name: '测试名称: 原名' })).toBeTruthy(); expect(persisted).toEqual([]);
    fail = false; await user.click(retry);
    expect((screen.getByRole('textbox', { name: '测试名称' }) as HTMLInputElement).value).toBe('新名');
    await user.keyboard('{Enter}'); await waitFor(() => expect(persisted).toEqual(['新名']));
  });
});
