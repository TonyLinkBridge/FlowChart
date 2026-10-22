// @vitest-environment jsdom
import React, { useState } from 'react';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import { NoteSections } from '@/components/views/NoteSections';
import type { Note } from '@/lib/types';

const mail = 'Dear Manager,\nFirst line.\n\nSecond paragraph.\n\n\nRegards,\nCase Team\n';
const original: Note = { text: mail, contact: '假联系人', steps: [{ text: '核对材料', done: false }],
  fields: [{ label: '案件编号', value: 'LOCAL-123' }], links: [{ label: '参考', url: 'https://example.test' }] };
beforeAll(() => {
  vi.spyOn(window, 'scrollTo').mockImplementation(() => {});
  vi.stubGlobal('ResizeObserver', class { observe() {} unobserve() {} disconnect() {} });
});
afterEach(cleanup);
afterAll(() => { vi.restoreAllMocks(); vi.unstubAllGlobals(); });
function setup(note = original) {
  const changes: Note[] = [];
  function Harness() {
    const [current, setCurrent] = useState(note);
    return <NoteSections note={current} collapsible onChange={next => { changes.push(next); setCurrent(next); }} onRemoveNote={() => {}} />;
  }
  return { ...render(<Harness />), changes };
}
function browserEdit(editor: HTMLElement, html: string) {
  editor.innerHTML = html;
  fireEvent.input(editor, { inputType: 'insertText', data: '.' });
}

describe('附注展开栏接入 Arc Rich Text Editor', () => {
  it('opens a rich editor without saving or rewriting any original email whitespace', async () => {
    const { changes } = setup();
    expect(screen.getByRole('textbox').getAttribute('contenteditable')).toBe('true');
    expect(changes).toEqual([]);
    await userEvent.click(screen.getByRole('tab', { name: '原文编辑' }));
    expect((screen.getByRole('textbox', { name: '附注／邮件模板原文' }) as HTMLTextAreaElement).value).toBe(mail);
    await userEvent.click(screen.getByRole('tab', { name: '格式编辑' }));
    expect(changes).toEqual([]);
  });

  it('saves a real rich edit with original line breaks and all other structured fields intact', async () => {
    const { changes } = setup();
    const editor = screen.getByRole('textbox');
    browserEdit(editor, editor.innerHTML.replace('First line.', 'First line edited.'));
    expect(changes).toEqual([{ ...original, text: mail.replace('First line.', 'First line edited.') }]);
    await userEvent.click(screen.getByRole('tab', { name: '原文编辑' }));
    expect((screen.getByRole('textbox') as HTMLTextAreaElement).value).toBe(mail.replace('First line.', 'First line edited.'));
  });

  it('undoes and redoes text edits locally without reaching flow-canvas history', async () => {
    const { changes } = setup();
    const editor = screen.getByRole('textbox'); editor.focus();
    browserEdit(editor, editor.innerHTML.replace('First line.', 'First line edited.'));
    const leaked: string[] = [], onKey = (e: KeyboardEvent) => leaked.push(e.key);
    window.addEventListener('keydown', onKey);
    try {
      await userEvent.keyboard('{Control>}z{/Control}');
      expect(changes.at(-1)?.text).toBe(mail);
      await userEvent.keyboard('{Control>}{Shift>}z{/Shift}{/Control}');
      expect(changes.at(-1)?.text).toBe(mail.replace('First line.', 'First line edited.'));
    } finally { window.removeEventListener('keydown', onKey); }
    expect(leaked).toEqual([]);
  });

  it('preserves Windows line endings on edits and restores exact original bytes on undo', async () => {
    const windowsMail = mail.replace(/\n/g, '\r\n');
    const { changes } = setup({ ...original, text: windowsMail });
    const editor = screen.getByRole('textbox'); editor.focus();
    browserEdit(editor, editor.innerHTML.replace('First line.', 'First line edited.'));
    expect(changes.at(-1)?.text).toBe(windowsMail.replace('First line.', 'First line edited.'));
    await userEvent.keyboard('{Control>}z{/Control}');
    expect(changes.at(-1)?.text).toBe(windowsMail);
  });

  it('keeps a source-edit escape hatch and never rewrites unsupported Markdown', async () => {
    const text = '#### 原标题保持四级\n\n3) 保持原来的编号\n';
    const { changes } = setup({ ...original, text });
    const source = await screen.findByRole('textbox', { name: '附注／邮件模板原文' });
    expect((source as HTMLTextAreaElement).value).toBe(text); expect(changes).toEqual([]);
    expect((screen.getByRole('tab', { name: '格式编辑' }) as HTMLButtonElement).disabled).toBe(true);
    fireEvent.change(source, { target: { value: text + '原文直接补充' } });
    expect(changes.at(-1)?.text).toBe(text + '原文直接补充');
  });

  it('does not resurrect another document through editor undo after an external content change', async () => {
    const changes: string[] = [];
    const { rerender } = render(<NoteSections collapsible note={{ text: '第一张\n邮件\n' }} onChange={n => changes.push(n.text!)} onRemoveNote={() => {}} />);
    rerender(<NoteSections collapsible note={{ text: '另一张\n新的邮件\n' }} onChange={n => changes.push(n.text!)} onRemoveNote={() => {}} />);
    const editor = screen.getByRole('textbox'); editor.focus();
    await userEvent.keyboard('{Control>}z{/Control}');
    expect(changes).toEqual([]);
    await userEvent.click(screen.getByRole('tab', { name: '原文编辑' }));
    expect((screen.getByRole('textbox') as HTMLTextAreaElement).value).toBe('另一张\n新的邮件\n');
  });

  it('retains a long template and keeps non-expanded editors on their original textarea', async () => {
    const text = 'Dear Case Manager,\n完整英文邮件\n\n'.repeat(120) + 'END-MAIL-KEEP\n';
    const { changes } = setup({ ...original, text });
    await userEvent.click(screen.getByRole('tab', { name: '原文编辑' }));
    expect((screen.getByRole('textbox') as HTMLTextAreaElement).value).toBe(text); expect(changes).toEqual([]);
    cleanup(); render(<NoteSections note={original} onChange={() => {}} onRemoveNote={() => {}} />);
    expect(screen.queryByRole('tab', { name: '格式编辑' })).toBeNull();
    expect((screen.getByPlaceholderText('补充说明。支持 **粗体** 和 `代码`。') as HTMLTextAreaElement).value).toBe(mail);
  });
});
