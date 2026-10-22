// @vitest-environment jsdom
import React, { useState } from 'react';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterAll, afterEach, beforeAll, expect, it, vi } from 'vitest';
import { RichTextEditor, type RichTextValue } from '@/components/arc/rich-text-editor/rich-text-editor';
import { NoteSections } from '@/components/views/NoteSections';
import { NotePopover } from '@/components/flow/NotePopover';
import type { Note } from '@/lib/types';

beforeAll(() => {
  vi.spyOn(window, 'scrollTo').mockImplementation(() => {});
  // Selection layout and scrolling are browser boundaries absent in jsdom.
  Range.prototype.getBoundingClientRect = () => ({ x: 100, y: 150, top: 150, left: 100, right: 200, bottom: 170, width: 100, height: 20, toJSON() {} });
  Range.prototype.getClientRects = () => [] as unknown as DOMRectList;
  vi.spyOn(HTMLElement.prototype, 'offsetWidth', 'get').mockReturnValue(320);
  vi.spyOn(HTMLElement.prototype, 'offsetHeight', 'get').mockReturnValue(40);
});
afterEach(cleanup);
afterAll(() => vi.restoreAllMocks());
function select(editor: HTMLElement, collapsed = false) {
  editor.focus();
  const range = document.createRange(); range.selectNodeContents(editor.firstElementChild!);
  if (collapsed) range.collapse(false);
  window.getSelection()!.removeAllRanges(); window.getSelection()!.addRange(range);
}

it('refuses executable link protocols through the real link form, not just HTML paste', async () => {
  const values: RichTextValue[] = [];
  render(<RichTextEditor defaultMarkdown="链接文字" onChange={v => values.push(v)} />);
  const editor = screen.getByRole('textbox'); select(editor);
  fireEvent.keyDown(editor, { key: 'k', ctrlKey: true });
  const address = await screen.findByRole('textbox', { name: 'Link address' });
  await userEvent.type(address, 'javascript:alert(1)');
  await userEvent.click(screen.getByRole('button', { name: 'Apply link' }));
  expect(editor.querySelector('a')).toBeNull();
  expect(values.at(-1)!.html).toBe('<p>链接文字</p>');
});

it('preserves line breaks in pasted plain-text email rather than joining the lines', () => {
  const changes: string[] = [];
  function Harness() {
    const [text, setText] = useState('');
    return <NoteSections collapsible note={{ text }} onChange={n => { changes.push(n.text!); setText(n.text!); }} onRemoveNote={() => {}} />;
  }
  render(<Harness />);
  const editor = screen.getByRole('textbox'); select(editor, true);
  fireEvent.paste(editor, { clipboardData: { getData: (type: string) => type === 'text/plain' ? 'Dear Manager,\n第一行\n第二行\n' : '' } });
  expect(changes.at(-1)).toBe('Dear Manager,\n第一行\n第二行\n');
});

it('does not save an incomplete Chinese IME composition', () => {
  const changes: string[] = [];
  render(<NoteSections collapsible note={{ text: '' }} onChange={n => changes.push(n.text!)} onRemoveNote={() => {}} />);
  const editor = screen.getByRole('textbox');
  editor.innerHTML = '<p>中文输入</p>';
  fireEvent.input(editor, { inputType: 'insertCompositionText', data: '中', isComposing: true });
  expect(changes).toEqual([]);
  fireEvent.compositionEnd(editor);
  expect(changes).toEqual(['中文输入']);
});

it('closes the slash menu with Escape before closing the note drawer', async () => {
  function Harness() {
    const [expanded, setExpanded] = useState(true);
    const [note, setNote] = useState<Note | undefined>({ text: '' });
    return <NotePopover node={{ id: 'fake', title: '假邮件', note }} index={1} x={0} y={0} canvasW={1000}
      expanded={expanded} pinned onPin={() => {}} onEnter={() => {}} onLeave={() => {}} onClose={() => setExpanded(false)}
      onToggleExpand={() => setExpanded(v => !v)} onChange={setNote} />;
  }
  render(<Harness />);
  const editor = await screen.findByRole('textbox');
  editor.innerHTML = '<p>/</p>';
  const range = document.createRange(); range.setStart(editor.firstElementChild!.firstChild!, 1); range.collapse(true);
  editor.focus(); window.getSelection()!.removeAllRanges(); window.getSelection()!.addRange(range);
  fireEvent.input(editor, { inputType: 'insertText', data: '/' });
  await screen.findByRole('listbox', { name: 'Blocks' });
  await userEvent.keyboard('{Escape}');
  expect(screen.queryByRole('listbox')).toBeNull();
  await waitFor(() => expect(screen.queryByRole('listbox')).toBeNull());
  expect(screen.getByRole('dialog')).toBeTruthy();
  await userEvent.keyboard('{Escape}');
  await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
});
