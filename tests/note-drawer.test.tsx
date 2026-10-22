// @vitest-environment jsdom
import React, { useState } from 'react';
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import { NotePopover } from '@/components/flow/NotePopover';
import type { FlowNode, Note } from '@/lib/types';

afterEach(cleanup);
// Motion's auto-height measurement restores scroll; browser scrolling is verified in the local UI instead.
beforeAll(() => { vi.spyOn(window, 'scrollTo').mockImplementation(() => {}); });
afterAll(() => vi.restoreAllMocks());
const longMail = 'Dear Provider,\nThis is a local fake email template.\n'.repeat(100) + 'END-MAIL-KEEP';
const original: Note = {
  text: longMail, contact: '测试联系人',
  steps: [{ text: '核对假资料', done: true }],
  fields: [{ label: '测试编号', value: 'FAKE-ONLY-123' }],
  links: [{ label: '假资料链接', url: 'https://example.com/test' }],
};

function setup(note: Note = original) {
  const changes: (Note | undefined)[] = [];
  const canvasPointers: string[] = [];
  function Harness() {
    const [node, setNode] = useState<FlowNode>({ id: 'node-a', title: '测试：法院诉讼邮件', note });
    const [pinned, setPinned] = useState(false);
    const [expanded, setExpanded] = useState(false);
    return <div onPointerDown={event => {
      if (!(event.target as Element).closest('[data-node],[data-pop]')) canvasPointers.push('pan');
    }}><button type="button" data-node onClick={() => { setPinned(true); setExpanded(true); }}>打开节点附注</button>
    <NotePopover node={node} index={3} x={10} y={10} canvasW={1200} pinned={pinned} expanded={expanded}
      onPin={() => { setPinned(true); setExpanded(true); }} onEnter={() => {}} onLeave={() => {}}
      onClose={() => { setPinned(false); setExpanded(false); }}
      onToggleExpand={() => { setPinned(true); setExpanded(value => !value); }}
      onChange={next => { changes.push(next); setNode(current => ({ ...current, note: next })); }} /></div>;
  }
  const result = render(<Harness />);
  return { changes, canvasPointers, ...result };
}

describe('附注展开使用 Arc Drawer', () => {
  it('keeps the small preview read-only until explicitly expanded', () => {
    const { changes } = setup();
    expect(screen.queryByRole('dialog')).toBeNull();
    expect(screen.getByText(/END-MAIL-KEEP/).textContent).toContain(longMail);
    expect(screen.getByRole('button', { name: '展开' })).toBeTruthy();
    expect(changes).toEqual([]);
  });

  it('opens a named right-side drawer with the complete template and structured fields', async () => {
    const { changes } = setup();
    await userEvent.click(screen.getByRole('button', { name: '展开' }));
    const dialog = await screen.findByRole('dialog');
    expect(dialog.getAttribute('aria-modal')).toBe('true');
    expect(dialog.getAttribute('data-side')).toBe('right');
    expect(dialog.getAttribute('aria-labelledby')).toBeTruthy();
    expect(dialog.getAttribute('aria-describedby')).toBeTruthy();
    expect(within(dialog).getByRole('heading', { level: 2 }).textContent).toContain('测试：法院诉讼邮件');
    expect(within(dialog).getByRole('textbox').getAttribute('contenteditable')).toBe('true');
    await userEvent.click(within(dialog).getByRole('button', { name: '原文编辑' }));
    expect((within(dialog).getByPlaceholderText('补充说明。支持 **粗体** 和 `代码`。') as HTMLTextAreaElement).value).toBe(longMail);
    for (const value of ['核对假资料', '测试编号', 'FAKE-ONLY-123', '假资料链接', 'https://example.com/test', '测试联系人'])
      expect(within(dialog).getByDisplayValue(value)).toBeTruthy();
    expect(changes).toEqual([]);
  });

  it('also opens from the existing parent-controlled node note action', async () => {
    const { changes } = setup();
    await userEvent.click(screen.getByRole('button', { name: '打开节点附注' }));
    await screen.findByRole('dialog');
    await userEvent.keyboard('{Escape}');
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
    expect(screen.getByRole('button', { name: '展开' })).toBeTruthy();
    expect(changes).toEqual([]);
  });

  it('Escape returns to the preview and trigger without reaching canvas shortcuts or changing content', async () => {
    const { changes } = setup();
    const trigger = screen.getByRole('button', { name: '展开' });
    await userEvent.click(trigger);
    await screen.findByRole('dialog');
    const canvasKeys: string[] = [];
    const onCanvasKey = (event: KeyboardEvent) => { canvasKeys.push(event.key); };
    window.addEventListener('keydown', onCanvasKey);
    try { await userEvent.keyboard('{Escape}'); }
    finally { window.removeEventListener('keydown', onCanvasKey); }
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
    expect(changes).toEqual([]);
    expect(canvasKeys).toEqual([]);
    expect(screen.getByText(/END-MAIL-KEEP/)).toBeTruthy();
    await waitFor(() => expect(document.activeElement).toBe(trigger));
  });

  it('forwards edits immediately through the existing callback and keeps every other note field', async () => {
    const { changes } = setup();
    await userEvent.click(screen.getByRole('button', { name: '展开' }));
    const dialog = await screen.findByRole('dialog');
    await userEvent.click(within(dialog).getByRole('button', { name: '原文编辑' }));
    const text = within(dialog).getByPlaceholderText('补充说明。支持 **粗体** 和 `代码`。');
    fireEvent.change(text, { target: { value: longMail + '\n本地修改' } });
    expect(changes).toEqual([{ ...original, text: longMail + '\n本地修改' }]);
    await userEvent.click(within(dialog).getByRole('button', { name: '收起，返回预览' }));
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
    expect(screen.getByText(/END-MAIL-KEEP/).textContent).toContain('本地修改');
    await userEvent.click(screen.getByRole('button', { name: '展开' }));
    const reopened = await screen.findByRole('dialog');
    await userEvent.click(within(reopened).getByRole('button', { name: '原文编辑' }));
    expect((within(reopened).getByPlaceholderText('补充说明。支持 **粗体** 和 `代码`。') as HTMLTextAreaElement).value).toBe(longMail + '\n本地修改');
    expect(changes).toHaveLength(1);
  });

  it('keeps Tab focus inside and does not send Delete or paste to the canvas', async () => {
    setup();
    await userEvent.click(screen.getByRole('button', { name: '展开' }));
    const dialog = await screen.findByRole('dialog');
    for (const shift of [false, true]) {
      const visited = new Set<Element>();
      for (let index = 0; index < 44; index++) {
        await userEvent.tab({ shift });
        expect(dialog.contains(document.activeElement)).toBe(true);
        visited.add(document.activeElement!);
      }
      for (const name of ['Close drawer', '操作步骤', '要填的资料', '相关链接', '联系人', '附注／邮件模板', '删掉整条附注', '收起，返回预览'])
        expect(visited.has(within(dialog).getByRole('button', { name }))).toBe(true);
      expect(visited.has(within(dialog).getByRole('textbox'))).toBe(true);
    }
    const canvasEvents: string[] = [];
    const onCanvas = (event: Event) => { canvasEvents.push(event.type); };
    window.addEventListener('keydown', onCanvas); window.addEventListener('paste', onCanvas);
    try {
      within(dialog).getByRole('button', { name: '收起，返回预览' }).focus();
      await userEvent.keyboard('{Delete}');
      fireEvent.paste(document.activeElement!);
    } finally {
      window.removeEventListener('keydown', onCanvas); window.removeEventListener('paste', onCanvas);
    }
    expect(canvasEvents).toEqual([]);
  });

  it('closing through the backdrop does not start a canvas pan or change content', async () => {
    const { changes, canvasPointers } = setup();
    await userEvent.click(screen.getByRole('button', { name: '展开' }));
    const dialog = await screen.findByRole('dialog');
    const overlay = dialog.previousElementSibling as HTMLElement;
    expect(overlay).toBeTruthy();
    fireEvent.pointerDown(overlay, { button: 0 });
    expect(canvasPointers).toEqual([]);
    await userEvent.click(overlay);
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
    expect(changes).toEqual([]);
    expect(canvasPointers).toEqual([]);
  });

  it('allows an empty note to be expanded and edited', async () => {
    const { changes } = setup({});
    await userEvent.click(screen.getByRole('button', { name: '展开' }));
    const dialog = await screen.findByRole('dialog');
    await userEvent.click(within(dialog).getByRole('button', { name: '原文编辑' }));
    fireEvent.change(within(dialog).getByPlaceholderText('补充说明。支持 **粗体** 和 `代码`。'), { target: { value: '第一段说明' } });
    expect(changes).toEqual([{ text: '第一段说明' }]);
  });
});
