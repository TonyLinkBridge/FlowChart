// @vitest-environment jsdom
import React, { useState } from 'react';
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import { NoteRichTextEditor } from '@/components/views/NoteRichTextEditor';

const mail = 'Dear **Manager**,\r\nFirst line.\r\n\r\n\r\nRegards,\r\nLocal Team\r\n';
beforeAll(() => {
  vi.spyOn(window, 'scrollTo').mockImplementation(() => {});
  vi.stubGlobal('ResizeObserver', class { observe() {} unobserve() {} disconnect() {} });
});
afterEach(cleanup);
afterAll(() => { vi.restoreAllMocks(); vi.unstubAllGlobals(); });
function setup(text = mail) {
  const user = userEvent.setup(), changes: string[] = [];
  function Harness() {
    const [value, setValue] = useState(text);
    return <NoteRichTextEditor value={value} onChange={next => { changes.push(next); setValue(next); }} />;
  }
  return { ...render(<Harness />), user, changes };
}
function source() { return screen.getByRole('textbox', { name: '附注／邮件模板原文' }) as HTMLTextAreaElement; }
function richEditor() { return screen.getByRole('textbox', { name: '附注／邮件模板格式编辑' }); }

describe('展开附注的 Arc Tabs', () => {
  it('associates each named tab with the active editing panel without saving', async () => {
    const { user, changes } = setup();
    const list = screen.getByRole('tablist', { name: '附注编辑方式' });
    const rich = within(list).getByRole('tab', { name: '格式编辑' });
    const raw = within(list).getByRole('tab', { name: '原文编辑' });
    expect(rich.getAttribute('aria-selected')).toBe('true');
    expect(screen.getByRole('tabpanel', { name: '格式编辑' }).id).toBe(rich.getAttribute('aria-controls'));
    expect(richEditor()).toBeTruthy();
    for (let i = 0; i < 3; i++) {
      await user.click(raw);
      expect(source().value).toBe(mail.replace(/\r\n/g, '\n'));
      expect(screen.getByRole('tabpanel', { name: '原文编辑' }).id).toBe(raw.getAttribute('aria-controls'));
      expect(screen.queryByRole('textbox', { name: '附注／邮件模板格式编辑' })).toBeNull();
      await user.click(rich);
      expect(screen.queryByRole('textbox', { name: '附注／邮件模板原文' })).toBeNull();
    }
    expect(changes).toEqual([]);
  });

  it('keeps arrow, Home and End navigation inside the editor and tabs into only the active panel', async () => {
    const { user, changes } = setup();
    const leaked: string[] = [], listener = (event: KeyboardEvent) => leaked.push(event.key);
    const rich = screen.getByRole('tab', { name: '格式编辑' }); rich.focus();
    window.addEventListener('keydown', listener); window.addEventListener('keyup', listener);
    try {
      await user.keyboard('{ArrowRight}');
      await waitFor(() => expect(screen.getByRole('tab', { name: '原文编辑' }).getAttribute('aria-selected')).toBe('true'));
      expect(document.activeElement).toBe(screen.getByRole('tab', { name: '原文编辑' }));
      await user.tab();
      expect(document.activeElement).toBe(screen.getByRole('tabpanel', { name: '原文编辑' }));
      await user.tab(); expect(document.activeElement).toBe(source());
      screen.getByRole('tab', { name: '原文编辑' }).focus();
      await user.keyboard('{Home}');
      expect(rich.getAttribute('aria-selected')).toBe('true');
      await user.keyboard('{End}');
      expect(screen.getByRole('tab', { name: '原文编辑' }).getAttribute('aria-selected')).toBe('true');
      await user.keyboard('{ArrowLeft}'); expect(rich.getAttribute('aria-selected')).toBe('true');
      expect(leaked).toEqual([]); expect(changes).toEqual([]);
    } finally { window.removeEventListener('keydown', listener); window.removeEventListener('keyup', listener); }
  });

  it.each(['#### Keep heading\n\n3) Keep numbering\n', 'first\r\nsecond\nthird\r'])('keeps unsupported or mixed-line-ending mail in raw mode: %j', async text => {
    const { user, changes } = setup(text);
    const rich = screen.getByRole('tab', { name: '格式编辑' }) as HTMLButtonElement;
    const raw = screen.getByRole('tab', { name: '原文编辑' });
    expect(rich.disabled).toBe(true); expect(raw.getAttribute('aria-selected')).toBe('true');
    await user.click(rich); raw.focus(); await user.keyboard('{ArrowLeft}{Home}');
    expect(raw.getAttribute('aria-selected')).toBe('true');
    expect(screen.queryByRole('textbox', { name: '附注／邮件模板格式编辑' })).toBeNull();
    expect(source().value).toBe(text.replace(/\r\n?/g, '\n')); expect(changes).toEqual([]);
  });

  it('saves the first real rich edit after returning from source and retains CRLF on undo', async () => {
    const { user, changes } = setup();
    await user.click(screen.getByRole('tab', { name: '原文编辑' }));
    await user.click(screen.getByRole('tab', { name: '格式编辑' }));
    const editor = richEditor();
    editor.innerHTML = editor.innerHTML.replace('First line.', 'Edited line.');
    fireEvent.input(editor, { inputType: 'insertText', data: '.' });
    expect(changes).toEqual([mail.replace('First line.', 'Edited line.')]);
    editor.focus(); await user.keyboard('{Control>}z{/Control}');
    expect(changes.at(-1)).toBe(mail);
  });

  it('keeps raw edits when switching back to rich without adding another change', async () => {
    const { user, changes } = setup();
    await user.click(screen.getByRole('tab', { name: '原文编辑' }));
    const next = '**Latest**\n\n原文编辑\n\n\nEND\n';
    fireEvent.change(source(), { target: { value: next } });
    await user.click(screen.getByRole('tab', { name: '格式编辑' }));
    expect(richEditor().textContent).toContain('Latest');
    await user.click(screen.getByRole('tab', { name: '原文编辑' }));
    expect(source().value).toBe(next); expect(changes).toEqual([next]);
  });

  it('does not swallow the next edit when the already-selected rich tab is clicked', async () => {
    const { user, changes } = setup();
    await user.click(screen.getByRole('tab', { name: '格式编辑' }));
    const editor = richEditor();
    editor.innerHTML = editor.innerHTML.replace('First line.', 'First edit kept.');
    fireEvent.input(editor, { inputType: 'insertText', data: '.' });
    expect(changes).toEqual([mail.replace('First line.', 'First edit kept.')]);
  });

  it('stays in source mode when editing an initially unsupported template into supported text', async () => {
    const { changes } = setup('#### Unsupported heading\n');
    fireEvent.change(source(), { target: { value: 'A plain template\n\nEND\n' } });
    expect(source().value).toBe('A plain template\n\nEND\n');
    expect(screen.getByRole('tab', { name: '原文编辑' }).getAttribute('aria-selected')).toBe('true');
    expect((screen.getByRole('tab', { name: '格式编辑' }) as HTMLButtonElement).disabled).toBe(false);
    expect(changes).toEqual(['A plain template\n\nEND\n']);
  });
});
