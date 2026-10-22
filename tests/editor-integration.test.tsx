// @vitest-environment jsdom
import React from 'react';
import { act, cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import type { FlowDoc } from '@/lib/types';
import { branchedFlow } from './fixtures/branched-flow';

// Only external identity/realtime and browser rasterization/download are replaced.
// The editor, store, save timer, document operations and all Arc components stay real.
const external = vi.hoisted(() => ({
  user: { id: 'fake-user', firstName: '测试同事' }, memberships: { data: [] },
  collab: { mates: [] as { key: string; name: string; color: string; x?: number; y?: number; status?: 'viewing' | 'typing' | 'idle' }[], ghosts: {}, sendCursor: () => {}, sendDrag: () => {}, sendDragEnd: () => {}, sendSel: () => {}, announceSaved: () => {} },
  png: vi.fn(), download: vi.fn(),
}));
vi.mock('@clerk/nextjs', () => ({
  useUser: () => ({ user: external.user }), useClerk: () => ({ signOut: () => {} }),
  useOrganization: () => ({ organization: null }), useOrganizationList: () => ({ userMemberships: external.memberships }),
  OrganizationSwitcher: () => null, UserButton: () => null,
}));
vi.mock('@/hooks/useCollab', () => ({ useCollab: (id: string | null) => id === 'fake-a' ? external.collab : { ...external.collab, mates: [] } }));
vi.mock('@/lib/export/download', async original => ({
  ...await original<typeof import('@/lib/export/download')>(), svgToPng: external.png, download: external.download,
}));
import Editor from '@/app/dashboard/page';

const originalA: FlowDoc = { title: '假流程 A', nodes: [{ id: 'a', title: '原步骤', x: 100, y: 100, note: { text: '完整邮件 END-MAIL' } }], edges: [] };
const originalB: FlowDoc = { title: '假流程 B', nodes: [{ id: 'b', title: '另一张不可改变的步骤', x: 100, y: 100 }], edges: [] };
const copy = <T,>(value: T): T => JSON.parse(JSON.stringify(value));
let rows: { id: string; folder_id: null; doc: FlowDoc; version: number; updated_at: string }[];
let writes: { id: string; doc: FlowDoc; baseVersion: number }[];
let holdSave: Promise<void> | null;
let failSave: boolean;
const json = (value: unknown, status = 200) => new Response(JSON.stringify(value), { status, headers: { 'Content-Type': 'application/json' } });
function deferred<T>() {
  let resolve!: (value: T) => void, reject!: (reason: Error) => void;
  const promise = new Promise<T>((yes, no) => { resolve = yes; reject = no; });
  return { promise, resolve, reject };
}
beforeAll(() => {
  vi.stubGlobal('ResizeObserver', class { observe() {} unobserve() {} disconnect() {} });
  vi.stubGlobal('IntersectionObserver', class { observe() {} unobserve() {} disconnect() {} });
  HTMLDialogElement.prototype.showModal = function () { this.setAttribute('open', ''); };
  HTMLDialogElement.prototype.close = function () { this.removeAttribute('open'); };
});
beforeEach(() => {
  rows = [originalA, originalB].map((doc, i) => ({ id: i ? 'fake-b' : 'fake-a', folder_id: null, doc: copy(doc), version: 1, updated_at: '2026-10-22T00:00:00Z' }));
  writes = []; holdSave = null; failSave = false; external.collab.mates = [];
  const preference = new Map<string, string>();
  vi.stubGlobal('localStorage', {
    getItem: (key: string) => preference.get(key) ?? null,
    setItem: (key: string, value: string) => { preference.set(key, value); },
    removeItem: (key: string) => { preference.delete(key); }, clear: () => preference.clear(),
    key: (index: number) => [...preference.keys()][index] ?? null, get length() { return preference.size; },
  });
  external.png.mockReset(); external.download.mockReset();
  vi.spyOn(window, 'scrollTo').mockImplementation(() => {});
  vi.stubGlobal('fetch', async (input: string | URL | Request, init?: RequestInit) => {
    const path = String(input), method = init?.method ?? 'GET';
    if (method === 'GET' && path === '/api/folders') return json([]);
    if (method === 'GET' && path === '/api/flows') return json(copy(rows));
    if (method === 'GET' && path.endsWith('/versions')) return json({ versions: [], activity: [] });
    const row = rows.find(r => path === `/api/flows/${r.id}`);
    if (method === 'PATCH' && row) {
      const body = JSON.parse(String(init?.body));
      writes.push({ id: row.id, ...copy(body) });
      const held = holdSave; holdSave = null;
      if (held) await held;
      if (failSave) { failSave = false; return json({ error: '本地假保存失败' }, 503); }
      if (body.baseVersion !== row.version) return json({ doc: row.doc, version: row.version }, 409);
      row.doc = copy(body.doc); row.version++;
      return json({ version: row.version });
    }
    throw new Error(`Unmocked business request blocked: ${method} ${path}`);
  });
});
afterEach(() => { cleanup(); vi.restoreAllMocks(); });
afterAll(() => vi.unstubAllGlobals());
async function setup() {
  const result = render(<Editor />);
  await screen.findByRole('button', { name: '流程图标题: 假流程 A' });
  return result;
}
async function picked(name: string) {
  await userEvent.click(within(screen.getByRole('complementary')).getByDisplayValue(name));
  await screen.findByRole('button', { name: `流程图标题: ${name}` });
}
async function addAndSave() {
  await userEvent.click(screen.getByRole('button', { name: '＋ 节点' }));
  await waitFor(() => expect(rows[0].doc.nodes).toHaveLength(2), { timeout: 2500 });
}
async function startPng() {
  await userEvent.click(screen.getByRole('button', { name: '导出' }));
  await userEvent.click(screen.getByRole('button', { name: /^PNG/ }));
  await screen.findByText('正在生成 PNG…');
}

type ProtectedAction = 'add' | 'step' | 'node';
async function savedProtectedAction(action: ProtectedAction, container: HTMLElement) {
  if (action === 'add') {
    await userEvent.click(screen.getByRole('button', { name: '＋ 节点' }));
    await waitFor(() => expect(rows[0].doc.nodes).toHaveLength(8), { timeout: 2500 });
  } else {
    if (action === 'node') fireEvent.click(container.querySelector('[data-node] [role="checkbox"]')!);
    else {
      fireEvent.click(container.querySelector('[data-node] sup')!);
      await userEvent.click(await screen.findByRole('button', { name: '操作步骤' }));
      await userEvent.click(await screen.findByRole('checkbox', { name: '操作步骤 1：核对材料' }));
    }
    await waitFor(() => expect(rows[0].doc.nodes[0].note!.steps![0].done).toBe(true), { timeout: 2500 });
    if (action === 'step') {
      await userEvent.click(screen.getByRole('button', { name: '收起，返回预览' }));
      await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
    }
  }
  return copy(rows[0].doc);
}
async function savedOriginalMail(container: HTMLElement, text: string, rich = false) {
  const expand = screen.queryByRole('button', { name: '展开' });
  if (expand) await userEvent.click(expand);
  else fireEvent.click(container.querySelector('[data-node] sup')!);
  const section = await screen.findByRole('button', { name: '附注／邮件模板' });
  if (section.getAttribute('aria-expanded') !== 'true') await userEvent.click(section);
  if (rich) {
    const editor = await screen.findByRole('textbox', { name: '附注／邮件模板格式编辑' });
    editor.innerHTML = `<p>${text}</p>`; fireEvent.input(editor, { inputType: 'insertText', data: 'P' });
  } else {
    await userEvent.click(await screen.findByRole('tab', { name: '原文编辑' }));
    fireEvent.change(screen.getByRole('textbox', { name: '附注／邮件模板原文' }), { target: { value: text } });
  }
  await waitFor(() => expect(rows[0].doc.nodes[0].note!.text).toBe(text), { timeout: 2500 });
  await userEvent.click(screen.getByRole('button', { name: '收起，返回预览' }));
  await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
}

describe('实际编辑页的本地联动回归', () => {
  it.each(['add', 'step', 'node'] as const)('undoing the saved %s action preserves the later saved mail through redo and flow switches', async action => {
    const original = { ...copy(branchedFlow), title: '假流程 A' }; rows[0].doc = copy(original);
    const { container } = await setup();
    const after = await savedProtectedAction(action, container);
    const mail = 'Dear Manager,\n\n操作之后已经保存的新邮件。\nEND-SCOPED-MAIL-KEEP\n';
    await savedOriginalMail(container, mail);
    const withMail = copy(after); withMail.nodes[0].note!.text = mail;
    const undone = copy(original); undone.nodes[0].note!.text = mail;
    await userEvent.click(screen.getByRole('button', { name: '撤销' }));
    await waitFor(() => expect(rows[0].doc).toEqual(undone), { timeout: 2500 });
    await userEvent.click(screen.getByRole('button', { name: '重做' }));
    await waitFor(() => expect(rows[0].doc).toEqual(withMail), { timeout: 2500 });
    await userEvent.click(screen.getByRole('button', { name: '撤销' }));
    await waitFor(() => expect(rows[0].doc).toEqual(undone), { timeout: 2500 });
    await picked('假流程 B'); await picked('假流程 A');
    expect(container.querySelectorAll('[data-node]')).toHaveLength(7);
    expect(rows.map(row => row.doc)).toEqual([undone, originalB]);
    expect(writes.every(write => write.id === 'fake-a')).toBe(true);
  });

  it.each(['add', 'step'] as const)('redoing the %s action preserves a new rich email written while undone and flushes only A on an immediate switch', async action => {
    const original = { ...copy(branchedFlow), title: '假流程 A' }; rows[0].doc = copy(original);
    const { container } = await setup();
    const after = await savedProtectedAction(action, container);
    await userEvent.click(screen.getByRole('button', { name: '撤销' }));
    await waitFor(() => expect(rows[0].doc).toEqual(original), { timeout: 2500 });
    const mail = '撤销之后重做之前的新邮件 END-SCOPED-RICH-KEEP';
    await savedOriginalMail(container, mail, true);
    await userEvent.click(screen.getByRole('button', { name: '重做' }));
    const expected = copy(after); expected.nodes[0].note!.text = mail;
    await picked('假流程 B');
    await waitFor(() => expect(rows[0].doc).toEqual(expected), { timeout: 2500 });
    await picked('假流程 A');
    expect(rows.map(row => row.doc)).toEqual([expected, originalB]);
    expect(writes.every(write => write.id === 'fake-a')).toBe(true);
  });

  it('keeps insertion, ordinary add, completion and color undo independent without losing the later saved mail', async () => {
    const original = { ...copy(branchedFlow), title: '假流程 A' }; rows[0].doc = copy(original);
    const { container } = await setup(); const user = userEvent.setup();
    await user.click(screen.getByRole('button', { name: '插入一步：通知用户裁决结果 → 等待 10 个工作日' }));
    await waitFor(() => expect(rows[0].doc.nodes).toHaveLength(8), { timeout: 2500 });
    const inserted = copy(rows[0].doc);
    await user.click(screen.getByRole('button', { name: '＋ 节点' }));
    await waitFor(() => expect(rows[0].doc.nodes).toHaveLength(9), { timeout: 2500 });
    const added = copy(rows[0].doc);
    const completed = await savedProtectedAction('step', container);
    fireEvent.click(container.querySelector('[data-node]')!);
    await user.click(screen.getByRole('button', { name: '填充' }));
    await user.click(within(await screen.findByRole('dialog', { name: '填充色' })).getByRole('button', { name: '#B4322F' }));
    await user.keyboard('{Escape}'); await waitFor(() => expect(screen.queryByRole('dialog', { name: '填充色' })).toBeNull());
    const mail = '四种动作交叉后保存的邮件\n\nEND-FOUR-ACTIONS-KEEP\n';
    await savedOriginalMail(container, mail);
    const colored = copy(completed); colored.nodes[0].style = { fill: '#B4322F' };
    const withMail = (doc: FlowDoc) => { const next = copy(doc); next.nodes[0].note!.text = mail; return next; };
    for (const expected of [completed, added, inserted, original]) {
      await user.click(screen.getByRole('button', { name: '撤销' }));
      await waitFor(() => expect(rows[0].doc).toEqual(withMail(expected)), { timeout: 2500 });
    }
    for (const expected of [inserted, added, completed, colored]) {
      await user.click(screen.getByRole('button', { name: '重做' }));
      await waitFor(() => expect(rows[0].doc).toEqual(withMail(expected)), { timeout: 2500 });
    }
    await picked('假流程 B'); await picked('假流程 A');
    expect(rows[0].doc).toEqual(withMail(colored)); expect(rows[1].doc).toEqual(originalB);
  }, 30_000);

  it('undoing a saved insertion keeps the later saved mail and branches through redo and switching flows', async () => {
    const original = { ...copy(branchedFlow), title: '假流程 A' }; rows[0].doc = copy(original);
    const { container } = await setup(); const user = userEvent.setup();
    await user.click(screen.getByRole('button', { name: '插入一步：是否收到法院诉讼证明？ → 告知机构暂停执行决定（是）' }));
    await waitFor(() => expect(rows[0].doc.nodes).toHaveLength(8), { timeout: 2500 });
    const inserted = copy(rows[0].doc);
    fireEvent.click(container.querySelector('[data-node] sup')!);
    await user.click(screen.getByRole('tab', { name: '原文编辑' }));
    const mail = 'Dear Manager,\n\n插入之后保存的新邮件。\nEND-INSERT-MAIL-KEEP\n';
    fireEvent.change(screen.getByRole('textbox', { name: '附注／邮件模板原文' }), { target: { value: mail } });
    const saved = copy(inserted); saved.nodes.find(n => n.id === 'notice')!.note!.text = mail;
    await waitFor(() => expect(rows[0].doc).toEqual(saved), { timeout: 2500 });
    await user.click(screen.getByRole('button', { name: '收起，返回预览' }));
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
    await user.click(screen.getByRole('button', { name: '撤销' }));
    const undone = copy(original); undone.nodes[0].note!.text = mail;
    await waitFor(() => expect(rows[0].doc).toEqual(undone), { timeout: 2500 });
    expect(container.querySelectorAll('[data-node]')).toHaveLength(7);
    await user.click(screen.getByRole('button', { name: '重做' }));
    await waitFor(() => expect(rows[0].doc).toEqual(saved), { timeout: 2500 });
    await user.click(screen.getByRole('button', { name: '撤销' }));
    await waitFor(() => expect(rows[0].doc).toEqual(undone), { timeout: 2500 });
    await picked('假流程 B'); await picked('假流程 A');
    expect(container.querySelectorAll('[data-node]')).toHaveLength(7);
    expect(rows.map(row => row.doc)).toEqual([undone, originalB]);
    expect(writes.every(write => write.id === 'fake-a')).toBe(true);
  });

  it('redoing an insertion keeps a newer rich email edited while undone and saves it before an immediate flow switch', async () => {
    const original = { ...copy(branchedFlow), title: '假流程 A' }; rows[0].doc = copy(original);
    const { container } = await setup(); const user = userEvent.setup();
    await user.click(screen.getByRole('button', { name: '插入一步：通知用户裁决结果 → 等待 10 个工作日' }));
    await waitFor(() => expect(rows[0].doc.nodes).toHaveLength(8), { timeout: 2500 });
    const inserted = copy(rows[0].doc);
    await user.click(screen.getByRole('button', { name: '撤销' }));
    await waitFor(() => expect(rows[0].doc).toEqual(original), { timeout: 2500 });
    fireEvent.click(container.querySelector('[data-node] sup')!);
    const editor = await screen.findByRole('textbox', { name: '附注／邮件模板格式编辑' });
    editor.innerHTML = '<p>重做前最新邮件 END-REDO-INSERT-KEEP</p>';
    fireEvent.input(editor, { inputType: 'insertText', data: 'P' });
    const latest = copy(original); latest.nodes[0].note!.text = '重做前最新邮件 END-REDO-INSERT-KEEP';
    await waitFor(() => expect(rows[0].doc).toEqual(latest), { timeout: 2500 });
    await user.click(screen.getByRole('button', { name: '收起，返回预览' }));
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
    await user.click(screen.getByRole('button', { name: '重做' }));
    const redone = copy(inserted); redone.nodes[0].note!.text = latest.nodes[0].note!.text;
    await picked('假流程 B');
    await waitFor(() => expect(rows[0].doc).toEqual(redone), { timeout: 2500 });
    await picked('假流程 A');
    expect(container.querySelectorAll('[data-node]')).toHaveLength(8);
    expect(rows.map(row => row.doc)).toEqual([redone, originalB]);
    expect(writes.every(write => write.id === 'fake-a')).toBe(true);
  });

  it('keeps insertion undo and color undo independent while preserving the later saved email through both redo entries', async () => {
    const original = { ...copy(branchedFlow), title: '假流程 A' }; rows[0].doc = copy(original);
    const { container } = await setup(); const user = userEvent.setup();
    await user.click(screen.getByRole('button', { name: '插入一步：通知用户裁决结果 → 等待 10 个工作日' }));
    await waitFor(() => expect(rows[0].doc.nodes).toHaveLength(8), { timeout: 2500 });
    const inserted = copy(rows[0].doc);
    fireEvent.click(within(container).getByText('通知用户裁决结果'));
    await user.click(screen.getByRole('button', { name: '填充' }));
    await user.click(within(await screen.findByRole('dialog', { name: '填充色' })).getByRole('button', { name: '#B4322F' }));
    await user.keyboard('{Escape}'); await waitFor(() => expect(screen.queryByRole('dialog', { name: '填充色' })).toBeNull());
    fireEvent.click(container.querySelector('[data-node] sup')!);
    await user.click(screen.getByRole('tab', { name: '原文编辑' }));
    const mail = '插入和颜色交叉操作\n\nEND-MIXED-KEEP\n';
    fireEvent.change(screen.getByRole('textbox', { name: '附注／邮件模板原文' }), { target: { value: mail } });
    const withMail = copy(inserted); withMail.nodes[0].note!.text = mail;
    const colored = copy(withMail); colored.nodes[0].style = { fill: '#B4322F' };
    await waitFor(() => expect(rows[0].doc).toEqual(colored), { timeout: 2500 });
    await user.click(screen.getByRole('button', { name: '收起，返回预览' }));
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
    await user.click(screen.getByRole('button', { name: '撤销' }));
    await waitFor(() => expect(rows[0].doc).toEqual(withMail), { timeout: 2500 });
    await user.click(screen.getByRole('button', { name: '撤销' }));
    const plain = copy(original); plain.nodes[0].note!.text = mail;
    await waitFor(() => expect(rows[0].doc).toEqual(plain), { timeout: 2500 });
    await user.click(screen.getByRole('button', { name: '重做' }));
    await waitFor(() => expect(rows[0].doc).toEqual(withMail), { timeout: 2500 });
    await user.click(screen.getByRole('button', { name: '重做' }));
    await waitFor(() => expect(rows[0].doc).toEqual(colored), { timeout: 2500 });
    expect(rows[1].doc).toEqual(originalB);
  });

  it.each(['loading', 'success', 'error'] as const)('pasting in a %s export notification never opens canvas generation or changes a flow, while canvas paste still works', async state => {
    const original = { ...copy(branchedFlow), title: '假流程 A' };
    rows[0].doc = copy(original);
    const gate = deferred<Blob>(); external.png.mockReturnValueOnce(gate.promise);
    const { container } = await setup(); const user = userEvent.setup();
    fireEvent.click(within(container).getByText('通知用户裁决结果'));
    const stage = container.querySelector('[style*="transform-origin: 0 0"]') as HTMLElement;
    const viewport = stage.style.transform;
    await user.click(screen.getByRole('button', { name: '导出' }));
    await user.click(screen.getByRole('button', { name: /^PNG/ }));
    await user.click(screen.getByRole('button', { name: '一起带走' }));
    await screen.findByText('正在生成 PNG…');
    if (state === 'success') await act(async () => gate.resolve(new Blob(['fake-png'])));
    if (state === 'error') await act(async () => gate.reject(new Error('本地假导出失败')));
    const region = screen.getByRole('region', { name: '导出通知 (Alt+T)' });
    const close = within(region).getByRole('button', { name: '关闭通知' }); close.focus();
    const text = 'LOCAL-TOAST-PASTE\n这不是要生成的新流程';
    const nativeAllowed = fireEvent.paste(close, { clipboardData: { getData: () => text } });
    expect(screen.queryByText('粘贴文字，生成流程图')).toBeNull();
    // Stop propagation only: do not cancel the browser's normal clipboard default.
    expect(nativeAllowed).toBe(true);
    expect(stage.style.transform).toBe(viewport);
    expect(container.querySelectorAll('[data-node]')).toHaveLength(original.nodes.length);
    expect(screen.getByRole('button', { name: '文字样式' })).toBeTruthy();
    expect(screen.getByRole('button', { name: '撤销' }).hasAttribute('disabled')).toBe(true);
    if (state === 'loading') await act(async () => gate.resolve(new Blob(['fake-png'])));
    expect(within(region).getByText(state === 'error' ? 'PNG 导出失败' : 'PNG 文件已生成')).toBeTruthy();
    await user.click(close);
    await waitFor(() => expect(close.closest('li')?.hasAttribute('inert') || !close.isConnected).toBe(true));
    await user.click(screen.getByRole('button', { name: '历史' }));
    const save = await screen.findByRole('button', { name: '存一版' }); save.focus();
    await user.keyboard('{Delete}{Backspace}');
    expect(container.querySelectorAll('[data-node]')).toHaveLength(original.nodes.length);
    await user.click(screen.getByRole('button', { name: '关闭版本历史' }));
    // The same text pasted on the canvas must still open the existing generator.
    expect(fireEvent.paste(stage, { clipboardData: { getData: () => text } })).toBe(false);
    await screen.findByText('粘贴文字，生成流程图');
    expect((screen.getByPlaceholderText(/提交报销单 @员工/) as HTMLTextAreaElement).value).toBe(text);
    await user.click(screen.getByRole('button', { name: /^取消$/ }));
    await act(async () => { await new Promise(resolve => setTimeout(resolve, 900)); });
    expect(writes).toEqual([]);
    expect(rows.map(row => row.doc)).toEqual([original, originalB]);
    expect(stage.style.transform).toBe(viewport);
  });

  it('history panel Delete/Backspace and undo keys cannot edit the selected canvas node, while its close button still activates with Space', async () => {
    const { container } = await setup(); const user = userEvent.setup();
    fireEvent.click(within(container).getByText('原步骤'));
    const stage = container.querySelector('[style*="transform-origin: 0 0"]') as HTMLElement, viewport = stage.style.transform;
    await user.click(screen.getByRole('button', { name: '历史' }));
    const save = await screen.findByRole('button', { name: '存一版' }); save.focus();
    for (const keys of ['{Delete}', '{Backspace}', '{Control>}z{/Control}', '{Escape}']) {
      await user.keyboard(keys); expect(container.querySelectorAll('[data-node]')).toHaveLength(1);
    }
    expect(screen.getByRole('button', { name: '文字样式' })).toBeTruthy();
    expect(stage.style.transform).toBe(viewport);
    expect(screen.getByRole('button', { name: '撤销' }).hasAttribute('disabled')).toBe(true);
    const close = screen.getByRole('button', { name: '关闭版本历史' }); close.focus(); await user.keyboard(' ');
    await waitFor(() => expect(screen.queryByRole('button', { name: '存一版' })).toBeNull());
    await act(async () => { await new Promise(resolve => setTimeout(resolve, 900)); });
    expect(writes).toEqual([]); expect(rows.map(row => row.doc)).toEqual([originalA, originalB]);
  });

  it('undoing and redoing fill changes preserves the newer saved email, its line breaks, all other notes and branches', async () => {
    const original = { ...copy(branchedFlow), title: '假流程 A' };
    original.nodes[0].style = { border: '#1F3A5F', bold: true };
    rows[0].doc = copy(original); const { container } = await setup(); const user = userEvent.setup();
    fireEvent.click(within(container).getByText('通知用户裁决结果'));
    await user.click(screen.getByRole('button', { name: '填充' }));
    await user.click(within(await screen.findByRole('dialog', { name: '填充色' })).getByRole('button', { name: '#B4322F' }));
    await user.keyboard('{Escape}'); await waitFor(() => expect(screen.queryByRole('dialog', { name: '填充色' })).toBeNull());
    fireEvent.click(container.querySelector('[data-node] sup')!); await screen.findByRole('dialog');
    await user.click(screen.getByRole('tab', { name: '原文编辑' }));
    const mail = 'Dear Manager,\n\nNEW MAIL\n法院说明\n\nEND-NEW-MAIL\n';
    fireEvent.change(screen.getByRole('textbox', { name: '附注／邮件模板原文' }), { target: { value: mail } });
    const expected = copy(original); expected.nodes[0].note!.text = mail;
    const colored = copy(expected); colored.nodes[0].style!.fill = '#B4322F';
    await waitFor(() => expect(rows[0].doc).toEqual(colored), { timeout: 2500 });
    await user.click(screen.getByRole('button', { name: '收起，返回预览' })); await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
    await user.click(screen.getByRole('button', { name: '撤销' }));
    await waitFor(() => expect(rows[0].doc).toEqual(expected), { timeout: 2500 });
    await user.click(screen.getByRole('button', { name: '重做' }));
    await waitFor(() => expect(rows[0].doc).toEqual(colored), { timeout: 2500 });
    await picked('假流程 B'); await picked('假流程 A');
    expect(rows[0].doc).toEqual(colored); expect(rows[1].doc).toEqual(originalB);
    expect(writes.every(write => write.id === 'fake-a')).toBe(true);
  });

  it('redoing a fill after a later rich email edit never replays an old email snapshot', async () => {
    const { container } = await setup(); const user = userEvent.setup();
    fireEvent.click(within(container).getByText('原步骤'));
    await user.click(screen.getByRole('button', { name: '填充' }));
    await user.click(within(await screen.findByRole('dialog', { name: '填充色' })).getByRole('button', { name: '#B4322F' }));
    await user.keyboard('{Escape}'); await waitFor(() => expect(screen.queryByRole('dialog', { name: '填充色' })).toBeNull());
    await user.click(screen.getByRole('button', { name: '撤销' }));
    fireEvent.click(container.querySelector('[data-node] sup')!); await screen.findByRole('dialog');
    const editor = screen.getByRole('textbox', { name: '附注／邮件模板格式编辑' });
    editor.innerHTML = '<p>重做前的新邮件 END-LATEST</p>'; fireEvent.input(editor, { inputType: 'insertText', data: 'T' });
    const latest = copy(originalA); latest.nodes[0].note!.text = '重做前的新邮件 END-LATEST';
    await waitFor(() => expect(rows[0].doc).toEqual(latest), { timeout: 2500 });
    await user.click(screen.getByRole('button', { name: '收起，返回预览' })); await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
    await user.click(screen.getByRole('button', { name: '重做' }));
    const colored = copy(latest); colored.nodes[0].style = { fill: '#B4322F' };
    await waitFor(() => expect(rows[0].doc).toEqual(colored), { timeout: 2500 });
    await user.click(screen.getByRole('button', { name: '撤销' }));
    await waitFor(() => expect(rows[0].doc).toEqual(latest), { timeout: 2500 });
    expect(rows[1].doc).toEqual(originalB);
  });

  it('keeps step completion undo independent from style undo while preserving the saved mail through both stacks', async () => {
    const original = { ...copy(branchedFlow), title: '假流程 A' }; rows[0].doc = copy(original);
    const { container } = await setup(); const user = userEvent.setup();
    fireEvent.click(within(container).getByText('通知用户裁决结果'));
    await user.click(screen.getByRole('button', { name: '填充' }));
    await user.click(within(await screen.findByRole('dialog', { name: '填充色' })).getByRole('button', { name: '#B4322F' }));
    await user.keyboard('{Escape}'); await waitFor(() => expect(screen.queryByRole('dialog', { name: '填充色' })).toBeNull());
    fireEvent.click(container.querySelector('[data-node] sup')!); await screen.findByRole('dialog');
    await user.click(screen.getByRole('tab', { name: '原文编辑' }));
    fireEvent.change(screen.getByRole('textbox', { name: '附注／邮件模板原文' }), { target: { value: '新邮件\n\nEND-CHECK-KEEP\n' } });
    await user.click(screen.getByRole('button', { name: '操作步骤' }));
    await user.click(await screen.findByRole('checkbox', { name: '操作步骤 1：核对材料' }));
    const plain = copy(original); plain.nodes[0].note!.text = '新邮件\n\nEND-CHECK-KEEP\n';
    const colored = copy(plain); colored.nodes[0].style = { fill: '#B4322F' };
    const completed = copy(colored); completed.nodes[0].note!.steps![0].done = true; completed.nodes[0].done = true;
    await waitFor(() => expect(rows[0].doc).toEqual(completed), { timeout: 2500 });
    await user.click(screen.getByRole('button', { name: '收起，返回预览' })); await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
    await user.click(screen.getByRole('button', { name: '撤销' }));
    await waitFor(() => expect(rows[0].doc).toEqual(colored), { timeout: 2500 });
    await user.click(screen.getByRole('button', { name: '撤销' }));
    await waitFor(() => expect(rows[0].doc).toEqual(plain), { timeout: 2500 });
    await user.click(screen.getByRole('button', { name: '重做' }));
    await waitFor(() => expect(rows[0].doc).toEqual(colored), { timeout: 2500 });
    await user.click(screen.getByRole('button', { name: '重做' }));
    await waitFor(() => expect(rows[0].doc).toEqual(completed), { timeout: 2500 });
    expect(rows[1].doc).toEqual(originalB);
  });

  it('sidebar scroll, navigation keys and paste never pan/zoom, delete the selected node, open paste or save any flow', async () => {
    const { container } = await setup(); const user = userEvent.setup();
    fireEvent.click(within(container).getByText('原步骤'));
    const stage = container.querySelector('[style*="transform-origin: 0 0"]') as HTMLElement;
    const viewport = stage.style.transform;
    const list = screen.getByRole('region', { name: '流程库名单' });
    list.focus();
    for (const key of ['ArrowDown', 'PageDown', 'Home', 'End', ' ']) {
      fireEvent.keyDown(list, { key, code: key === ' ' ? 'Space' : key });
      fireEvent.keyUp(list, { key, code: key === ' ' ? 'Space' : key });
    }
    await user.keyboard('{Delete}{Backspace}{Escape}');
    fireEvent.wheel(list, { deltaY: 160 }); fireEvent.wheel(list, { deltaY: -100, ctrlKey: true });
    fireEvent.paste(list, { clipboardData: { getData: () => '本地模拟粘贴' } }); fireEvent.scroll(list, { target: { scrollTop: 180 } });
    expect(stage.style.transform).toBe(viewport);
    expect(screen.getByRole('button', { name: '文字样式' })).toBeTruthy();
    expect(screen.queryByRole('dialog')).toBeNull();
    expect((screen.getByRole('button', { name: '撤销' }) as HTMLButtonElement).disabled).toBe(true);
    await user.type(screen.getByRole('searchbox', { name: '搜索流程' }), 'B');
    expect(stage.style.transform).toBe(viewport);
    await user.click(screen.getByRole('button', { name: '清空搜索' }));
    await picked('假流程 B'); await picked('假流程 A');
    await act(async () => { await new Promise(resolve => setTimeout(resolve, 900)); });
    expect(writes).toEqual([]); expect(rows.map(row => row.doc)).toEqual([originalA, originalB]);
  });

  it('fake typing/idle updates preserve cursors and documents, clear on disconnect, and never carry the roster across flows', async () => {
    const peer = { key: 'ceci', name: 'Ceci', color: '#a87515', x: 200, y: 100 };
    external.collab.mates = [peer]; const { container, rerender } = await setup();
    const cursor = () => container.querySelector('[class*="peerCursor"]')?.getAttribute('style');
    const before = cursor(); const stage = container.querySelector('[style*="transform-origin: 0 0"]') as HTMLElement;
    const viewport = stage.style.transform;
    await userEvent.click(screen.getByRole('button', { name: '在线同事，1 人' }));
    for (const status of ['typing', 'viewing', 'idle'] as const) {
      external.collab.mates = [{ ...peer, status }]; rerender(<Editor />);
      const roster = screen.getByRole('dialog', { name: '一起看这张流程' });
      expect(within(roster).getByText(status === 'typing' ? '正在输入' : status === 'idle' ? '暂时无操作' : '正在查看此流程')).toBeTruthy();
      expect(cursor()).toBe(before); expect(stage.style.transform).toBe(viewport);
    }
    external.collab.mates = []; rerender(<Editor />);
    expect(screen.queryByRole('button', { name: /在线同事/ })).toBeNull(); expect(cursor()).toBeUndefined();
    external.collab.mates = [peer]; rerender(<Editor />);
    await userEvent.click(screen.getByRole('button', { name: '在线同事，1 人' }));
    expect(screen.queryByText('正在输入')).toBeNull(); expect(screen.queryByText('暂时无操作')).toBeNull();
    await userEvent.keyboard('{Escape}'); await picked('假流程 B');
    expect(screen.queryByRole('button', { name: /在线同事/ })).toBeNull();
    await picked('假流程 A');
    await userEvent.click(screen.getByRole('button', { name: '在线同事，1 人' }));
    expect(screen.getByText('正在查看此流程')).toBeTruthy();
    await act(async () => { await new Promise(resolve => setTimeout(resolve, 900)); });
    expect(writes).toEqual([]); expect(rows.map(row => row.doc)).toEqual([originalA, originalB]);
  });

  it('online peers exposes a read-only roster without changing cursors, viewport, selection or saved flows', async () => {
    external.collab.mates = Array.from({ length: 6 }, (_, i) => ({ key: `peer-${i}`, name: ['Ceci', 'Queenie', 'Lan', 'Juyu', 'Tony', '测试同事'][i], color: '#966b14', x: 200 + i * 30, y: 100 + i * 20 }));
    const { container, rerender } = await setup(); const user = userEvent.setup();
    fireEvent.click(within(container).getByText('原步骤'));
    const stage = container.querySelector('[style*="transform-origin: 0 0"]') as HTMLElement;
    const viewport = stage.style.transform;
    const cursors = () => Array.from(container.querySelectorAll('[class*="peerCursor"]')).map(el => ({ text: el.textContent, style: el.getAttribute('style') }));
    const before = cursors(); expect(before).toHaveLength(6);
    const stack = screen.getByRole('button', { name: '在线同事，6 人' }); stack.focus();
    await user.keyboard('{ArrowRight}{Delete} ');
    const roster = await screen.findByRole('dialog', { name: '一起看这张流程' });
    expect(within(roster).getByText('Ceci')).toBeTruthy();
    expect(within(roster).getAllByText('正在查看此流程')).toHaveLength(6);
    expect(within(roster).queryByRole('button', { name: /定位|跟随/ })).toBeNull();
    expect(within(roster).queryByText(/输入中|暂离/)).toBeNull();
    await user.keyboard('{Escape}');
    await waitFor(() => expect(screen.queryByRole('dialog', { name: '一起看这张流程' })).toBeNull());
    expect(document.activeElement).toBe(stack);
    expect(screen.getByRole('button', { name: '文字样式' })).toBeTruthy();
    expect(stage.style.transform).toBe(viewport); expect(cursors()).toEqual(before);
    expect((screen.getByRole('button', { name: '撤销' }) as HTMLButtonElement).disabled).toBe(true);
    external.collab.mates = [...external.collab.mates, { key: 'new-peer', name: '新同事', color: '#a54232', x: 430, y: 150 }];
    rerender(<Editor />);
    await screen.findByRole('button', { name: '在线同事，7 人' });
    await picked('假流程 B');
    expect(screen.queryByRole('button', { name: /在线同事/ })).toBeNull(); expect(cursors()).toHaveLength(0);
    await picked('假流程 A');
    await screen.findByRole('button', { name: '在线同事，7 人' });
    await act(async () => { await new Promise(resolve => setTimeout(resolve, 900)); });
    expect(writes).toEqual([]); expect(rows.map(row => row.doc)).toEqual([originalA, originalB]);
  });

  it('note step checkbox preserves progress, autosave, complete notes and branches, undo/redo and flow B', async () => {
    const original = { ...copy(branchedFlow), title: '假流程 A' };
    original.nodes[0].note!.steps = [{ text: '核对材料', done: false }, { text: '通知机构', done: false }];
    rows[0].doc = copy(original); const { container } = await setup(); const user = userEvent.setup();
    fireEvent.click(container.querySelector('[data-node] sup')!);
    await screen.findByRole('dialog');
    await user.click(screen.getByRole('button', { name: '操作步骤' }));
    await act(async () => { await new Promise(resolve => setTimeout(resolve, 900)); });
    expect(writes).toEqual([]);
    const box = screen.getByRole('checkbox', { name: '操作步骤 1：核对材料' });
    box.focus(); await user.keyboard('{Delete} ');
    expect(box.getAttribute('aria-checked')).toBe('true'); expect(screen.getByText('1 / 2')).toBeTruthy();
    const partial = copy(original); partial.nodes[0].note!.steps![0].done = true; partial.nodes[0].done = false;
    await waitFor(() => expect(rows[0].doc).toEqual(partial), { timeout: 2500 });
    await user.click(screen.getByRole('checkbox', { name: '操作步骤 2：通知机构' }));
    const complete = copy(partial); complete.nodes[0].note!.steps![1].done = true; complete.nodes[0].done = true;
    await waitFor(() => expect(rows[0].doc).toEqual(complete), { timeout: 2500 });
    expect(screen.getByText('2 / 2')).toBeTruthy();
    await user.click(screen.getByRole('button', { name: '收起，返回预览' }));
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
    expect(screen.getByText(/1\/6 ·/)).toBeTruthy();
    await user.click(screen.getByRole('button', { name: '撤销' }));
    await waitFor(() => expect(rows[0].doc).toEqual(partial), { timeout: 2500 });
    await user.click(screen.getByRole('button', { name: '撤销' }));
    await waitFor(() => expect(rows[0].doc).toEqual(original), { timeout: 2500 });
    await user.click(screen.getByRole('button', { name: '重做' }));
    await waitFor(() => expect(rows[0].doc).toEqual(partial), { timeout: 2500 });
    await picked('假流程 B'); await picked('假流程 A');
    expect(rows[0].doc).toEqual(partial); expect(rows[1].doc).toEqual(originalB);
    expect(writes.every(w => w.id === 'fake-a')).toBe(true);
  });

  it('title inline keeps drafts local, cancels with Escape, rejects blanks and never saves unchanged text', async () => {
    await setup(); const user = userEvent.setup();
    const open = () => user.click(screen.getByRole('button', { name: '流程图标题: 假流程 A' }));
    await open();
    const title = screen.getByRole('textbox', { name: '流程图标题' });
    await user.clear(title); await user.type(title, '不要保存的草稿');
    await act(async () => { await new Promise(resolve => setTimeout(resolve, 900)); });
    expect(writes).toEqual([]); expect(rows[0].doc).toEqual(originalA);
    await user.keyboard('{Escape}');
    expect(screen.getByRole('button', { name: '流程图标题: 假流程 A' })).toBe(document.activeElement);
    await open(); await user.keyboard('{Enter}');
    await open(); await user.clear(screen.getByRole('textbox', { name: '流程图标题' }));
    await user.keyboard('{Enter}');
    expect(screen.getByRole('textbox', { name: '流程图标题' }).getAttribute('aria-invalid')).toBe('true');
    expect(screen.getByText('流程名称不能为空')).toBeTruthy();
    await user.keyboard('{Escape}');
    await act(async () => { await new Promise(resolve => setTimeout(resolve, 900)); });
    expect(writes).toEqual([]); expect(rows[0].doc).toEqual(originalA); expect(rows[1].doc).toEqual(originalB);
  });

  it('title inline confirms through the existing autosave and keeps cloud saving and failure retry truthful', async () => {
    const original = { ...copy(branchedFlow), title: '假流程 A' }; rows[0].doc = copy(original);
    await setup(); const user = userEvent.setup();
    await user.click(screen.getByRole('button', { name: '流程图标题: 假流程 A' }));
    fireEvent.change(screen.getByRole('textbox', { name: '流程图标题' }), { target: { value: '法院流程 · 新名称' } });
    const held = deferred<void>(); holdSave = held.promise;
    await user.keyboard('{Enter}');
    await waitFor(() => expect(writes).toHaveLength(1), { timeout: 2500 });
    expect(screen.getByText(/保存中…/)).toBeTruthy();
    expect(screen.queryAllByRole('status').every(el => !/已保存|\bsaved\b/i.test(el.textContent ?? ''))).toBe(true);
    expect(rows[0].doc).toEqual(original);
    held.resolve();
    const renamed = { ...original, title: '法院流程 · 新名称' };
    await waitFor(() => expect(rows[0].doc).toEqual(renamed), { timeout: 2500 });
    await user.click(screen.getByRole('button', { name: '流程图标题: 法院流程 · 新名称' }));
    fireEvent.change(screen.getByRole('textbox', { name: '流程图标题' }), { target: { value: '需要重试的名称' } });
    failSave = true; await user.keyboard('{Enter}');
    const retry = await screen.findByRole('button', { name: '保存失败 · 点此重试' }, { timeout: 2500 });
    expect(rows[0].doc).toEqual(renamed);
    expect(screen.getByRole('button', { name: '流程图标题: 需要重试的名称' })).toBeTruthy();
    await user.click(retry);
    await waitFor(() => expect(rows[0].doc).toEqual({ ...original, title: '需要重试的名称' }), { timeout: 2500 });
    const search = screen.getByRole('searchbox', { name: '搜索流程' });
    await user.type(search, '需要重试');
    expect(within(screen.getByRole('complementary')).getByDisplayValue('需要重试的名称')).toBeTruthy();
    expect(rows[1].doc).toEqual(originalB); expect(writes.every(w => w.id === 'fake-a')).toBe(true);
  });

  it('title inline blur commits to flow A before an immediate click on flow B, without carrying drafts across flows', async () => {
    await setup(); const user = userEvent.setup();
    await user.click(screen.getByRole('button', { name: '流程图标题: 假流程 A' }));
    fireEvent.change(screen.getByRole('textbox', { name: '流程图标题' }), { target: { value: 'A 的失焦确认名称' } });
    await user.click(within(screen.getByRole('complementary')).getByDisplayValue('假流程 B'));
    await screen.findByRole('button', { name: '流程图标题: 假流程 B' });
    await waitFor(() => expect(rows[0].doc).toEqual({ ...originalA, title: 'A 的失焦确认名称' }), { timeout: 2500 });
    expect(rows[1].doc).toEqual(originalB); expect(writes).toHaveLength(1); expect(writes[0].id).toBe('fake-a');
    await user.click(screen.getByRole('button', { name: '流程图标题: 假流程 B' }));
    expect((screen.getByRole('textbox', { name: '流程图标题' }) as HTMLInputElement).value).toBe('假流程 B');
    await user.keyboard('{Escape}');
  });

  it('filters only loaded titles without saving, changing canvas selection, viewport or undo history', async () => {
    const original = { ...copy(branchedFlow), title: '假流程 A' };
    rows[0].doc = copy(original);
    const { container } = await setup();
    fireEvent.click(within(container).getByText('通知用户裁决结果'));
    const selected = screen.getByRole('button', { name: '文字样式' });
    const stage = container.querySelector('[style*="transform-origin: 0 0"]') as HTMLElement;
    const view = stage.style.transform;
    const sidebar = screen.getByRole('complementary');
    const search = within(sidebar).getByRole('searchbox', { name: '搜索流程' });
    const user = userEvent.setup();
    await user.type(search, '假流程 B');
    expect(within(sidebar).queryByDisplayValue('假流程 A')).toBeNull();
    expect(within(sidebar).getAllByDisplayValue('假流程 B').some(el => el.closest('[data-flow-row]'))).toBe(true);
    expect(screen.getByRole('button', { name: '流程图标题: 假流程 A' })).toBeTruthy();
    expect(screen.getByRole('button', { name: '文字样式' })).toBe(selected);
    expect(stage.style.transform).toBe(view);
    await user.keyboard('{Escape}');
    expect(document.activeElement).toBe(search);
    expect(within(sidebar).getByDisplayValue('假流程 A')).toBeTruthy();
    await user.type(search, '不存在');
    expect(within(sidebar).getByRole('status').textContent).toContain('没有匹配的流程');
    fireEvent.paste(search, { clipboardData: { getData: () => '不要生成新流程\n下一步' } });
    await user.keyboard('{Delete}{Escape}');
    expect(screen.getByRole('button', { name: '文字样式' })).toBe(selected);
    await act(async () => { await new Promise(resolve => setTimeout(resolve, 900)); });
    expect(writes).toEqual([]); expect(rows[0].doc).toEqual(original); expect(rows[1].doc).toEqual(originalB);
    expect((screen.getByRole('button', { name: '撤销' }) as HTMLButtonElement).disabled).toBe(true);
    // An explicit result click still uses the original flow-selection path.
    await user.type(search, 'B'); await picked('假流程 B');
    expect(writes).toEqual([]); expect(rows[0].doc).toEqual(original); expect(rows[1].doc).toEqual(originalB);
  });

  it('keeps tooltip focus and Escape local, then saves the original text, lock and more actions only to flow A', async () => {
    const original = { ...copy(branchedFlow), title: '假流程 A' };
    rows[0].doc = copy(original);
    const { container } = await setup();
    fireEvent.click(within(container).getByText('通知用户裁决结果'));
    screen.getByRole('button', { name: '边框' }).focus();
    await userEvent.tab();
    expect(document.activeElement).toBe(screen.getByRole('button', { name: '文字样式' }));
    for (const label of ['文字样式', '锁定位置', '更多节点操作']) {
      screen.getByRole('button', { name: label }).focus();
      await screen.findByRole('tooltip', { name: label });
      await userEvent.keyboard('{Escape}');
      await waitFor(() => expect(screen.queryByRole('tooltip')).toBeNull());
      expect(screen.getByRole('button', { name: label })).toBe(document.activeElement);
    }
    await act(async () => { await new Promise(resolve => setTimeout(resolve, 900)); });
    expect(writes).toEqual([]);
    await userEvent.keyboard('{Escape}');
    expect(screen.queryByRole('button', { name: '文字样式' })).toBeNull();
    fireEvent.click(within(container).getByText('通知用户裁决结果'));
    await userEvent.click(screen.getByRole('button', { name: '文字样式' }));
    await userEvent.click(screen.getByRole('button', { name: 'B' }));
    const bold = copy(original); bold.nodes[0].style = { bold: true };
    await waitFor(() => expect(rows[0].doc).toEqual(bold), { timeout: 2500 });
    await userEvent.click(screen.getByRole('button', { name: '锁定位置' }));
    const locked = copy(bold); locked.nodes[0].locked = true;
    await waitFor(() => expect(rows[0].doc).toEqual(locked), { timeout: 2500 });
    expect(screen.getByRole('button', { name: '解锁位置' })).toBeTruthy();
    await userEvent.click(screen.getByRole('button', { name: '更多节点操作' }));
    await userEvent.click(screen.getByRole('button', { name: '弱化（失败/终止分支）' }));
    const muted = copy(locked); muted.nodes[0].muted = true;
    await waitFor(() => expect(rows[0].doc).toEqual(muted), { timeout: 2500 });
    await userEvent.click(screen.getByRole('button', { name: '撤销' }));
    await waitFor(() => expect(rows[0].doc).toEqual(locked), { timeout: 2500 });
    await picked('假流程 B'); await picked('假流程 A');
    expect(rows[0].doc).toEqual(locked); expect(rows[1].doc).toEqual(originalB);
    expect(writes.every(write => write.id === 'fake-a')).toBe(true);
  });

  it('saves a burst of custom fill choices as one undoable change without altering other node data', async () => {
    const original = { ...copy(branchedFlow), title: '假流程 A' };
    original.nodes[0].style = { border: '#1F3A5F', bold: true };
    rows[0].doc = copy(original);
    const { container } = await setup();
    fireEvent.click(within(container).getByText('通知用户裁决结果'));
    await userEvent.click(screen.getByRole('button', { name: '填充' }));
    const input = await screen.findByLabelText('自定义填充色');
    fireEvent.change(input, { target: { value: '#123456' } });
    fireEvent.change(input, { target: { value: '#654321' } });
    expect(writes).toEqual([]);
    const colored = copy(original); colored.nodes[0].style!.fill = '#654321';
    await waitFor(() => expect(rows[0].doc).toEqual(colored), { timeout: 3000 });
    expect(writes).toHaveLength(1);
    await userEvent.keyboard('{Escape}');
    await waitFor(() => expect(screen.queryByRole('dialog', { name: '填充色' })).toBeNull());
    await userEvent.click(screen.getByRole('button', { name: '撤销' }));
    await waitFor(() => expect(rows[0].doc).toEqual(original), { timeout: 2500 });
    expect(screen.getByRole('button', { name: '撤销' }).hasAttribute('disabled')).toBe(true);
    expect(rows[1].doc).toEqual(originalB);
    expect(writes.every(write => write.id === 'fake-a')).toBe(true);
  });

  it('keeps canvas undo available while a fill-palette button has keyboard focus', async () => {
    const { container } = await setup();
    fireEvent.click(within(container).getByText('原步骤'));
    await userEvent.click(screen.getByRole('button', { name: '填充' }));
    const panel = await screen.findByRole('dialog', { name: '填充色' });
    await userEvent.click(within(panel).getByRole('button', { name: '#B4322F' }));
    await waitFor(() => expect(rows[0].doc.nodes[0].style?.fill).toBe('#B4322F'), { timeout: 2500 });
    await userEvent.keyboard('{Control>}z{/Control}');
    await waitFor(() => expect(rows[0].doc).toEqual(originalA), { timeout: 2500 });
    await userEvent.keyboard('{Control>}{Shift>}z{/Shift}{/Control}');
    await waitFor(() => expect(rows[0].doc.nodes[0].style?.fill).toBe('#B4322F'), { timeout: 2500 });
    expect(rows[1].doc).toEqual(originalB);
  });

  it('saves only the chosen node fill and persists undo/redo without altering branches, notes or flow B', async () => {
    const original = { ...copy(branchedFlow), title: '假流程 A' };
    original.nodes[0].style = { border: '#1F3A5F', bold: true };
    rows[0].doc = copy(original);
    const { container } = await setup();
    // Click selection only; jsdom has no native pointer-capture/drag surface.
    fireEvent.click(within(container).getByText('通知用户裁决结果'));
    const fill = screen.getByRole('button', { name: '填充' });
    fill.focus(); await userEvent.keyboard(' ');
    const panel = await screen.findByRole('dialog', { name: '填充色' });
    expect(writes).toEqual([]);
    await userEvent.click(within(panel).getByRole('button', { name: '#B4322F' }));
    const colored = copy(original); colored.nodes[0].style!.fill = '#B4322F';
    await waitFor(() => expect(rows[0].doc).toEqual(colored), { timeout: 2500 });
    await userEvent.keyboard('{Escape}');
    await waitFor(() => expect(screen.queryByRole('dialog', { name: '填充色' })).toBeNull());
    expect(screen.getByRole('button', { name: '填充' })).toBe(fill);
    expect(document.activeElement).toBe(fill);
    await userEvent.click(screen.getByRole('button', { name: '撤销' }));
    await waitFor(() => expect(rows[0].doc).toEqual(original), { timeout: 2500 });
    await userEvent.click(screen.getByRole('button', { name: '重做' }));
    await waitFor(() => expect(rows[0].doc).toEqual(colored), { timeout: 2500 });
    // Existing undo/redo clears canvas selection; select the node again.
    fireEvent.click(within(container).getByText('通知用户裁决结果'));
    await userEvent.click(screen.getByRole('button', { name: '填充' }));
    await screen.findByRole('dialog', { name: '填充色' });
    await userEvent.click(screen.getByRole('button', { name: '恢复默认' }));
    await waitFor(() => expect(rows[0].doc).toEqual(original), { timeout: 2500 });
    await userEvent.keyboard('{Escape}');
    await picked('假流程 B'); await picked('假流程 A');
    expect(rows[0].doc).toEqual(original); expect(rows[1].doc).toEqual(originalB);
    expect(writes.every(write => write.id === 'fake-a')).toBe(true);
  });

  it('does not save by opening rich notes, then persists rich edits and local text undo without touching flow B', async () => {
    const user = userEvent.setup();
    const copied: string[] = [];
    const clipboard = Object.getOwnPropertyDescriptor(navigator, 'clipboard');
    Object.defineProperty(navigator, 'clipboard', { configurable: true, value: {
      writeText: async (value: string) => { copied.push(value); },
    } });
    try {
    const text = 'Dear Manager,\nFirst line.\n\n完整邮件\n\nEND-MAIL\n';
    const original = copy(originalA); original.nodes[0].note = { text, contact: '假联系人',
      steps: [{ text: '核对资料', done: false }], fields: [{ label: '编号', value: 'FAKE-123' }],
      links: [{ label: '参考', url: 'https://example.test' }] };
    rows[0].doc = copy(original);
    const { container } = await setup();
    fireEvent.click(container.querySelector('[data-node] sup')!);
    await screen.findByRole('dialog');
    for (let i = 0; i < 2; i++) {
      await user.click(screen.getByRole('tab', { name: '原文编辑' }));
      expect((screen.getByRole('textbox', { name: '附注／邮件模板原文' }) as HTMLTextAreaElement).value).toBe(text);
      await user.click(screen.getByRole('tab', { name: '格式编辑' }));
    }
    const editor = screen.getByRole('textbox', { name: '附注／邮件模板格式编辑' });
    await new Promise(resolve => setTimeout(resolve, 900));
    expect(writes).toEqual([]); expect(rows[0].doc).toEqual(original);
    await user.click(screen.getByRole('button', { name: '复制原文' }));
    await act(async () => { await new Promise(resolve => setTimeout(resolve, 900)); });
    expect(copied).toEqual([text]); expect(writes).toEqual([]);
    editor.innerHTML = editor.innerHTML.replace('First line.', 'First line edited.');
    fireEvent.input(editor, { inputType: 'insertText', data: '.' });
    await waitFor(() => expect(rows[0].doc.nodes[0].note?.text).toBe(text.replace('First line.', 'First line edited.')), { timeout: 2500 });
    expect(rows[0].doc.nodes[0].note).toEqual({ ...original.nodes[0].note, text: text.replace('First line.', 'First line edited.') });
    const savedCount = writes.length;
    await user.click(screen.getByRole('button', { name: '复制原文' }));
    await act(async () => { await new Promise(resolve => setTimeout(resolve, 900)); });
    expect(copied).toEqual([text, text.replace('First line.', 'First line edited.')]);
    expect(writes).toHaveLength(savedCount);
    editor.focus(); await userEvent.keyboard('{Control>}z{/Control}');
    await waitFor(() => expect(rows[0].doc).toEqual(original), { timeout: 2500 });
    await userEvent.keyboard('{Control>}{Shift>}z{/Shift}{/Control}');
    await waitFor(() => expect(rows[0].doc.nodes[0].note?.text).toBe(text.replace('First line.', 'First line edited.')), { timeout: 2500 });
    await userEvent.click(screen.getByRole('button', { name: '收起，返回预览' }));
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
    await picked('假流程 B'); await picked('假流程 A');
    expect(rows[1].doc).toEqual(originalB);
    expect(writes.every(w => w.id === 'fake-a')).toBe(true);
    expect(rows[0].doc.nodes).toHaveLength(1);
    } finally {
      if (clipboard) Object.defineProperty(navigator, 'clipboard', clipboard);
      else Reflect.deleteProperty(navigator, 'clipboard');
    }
  });

  it('inserts on the chosen branch, preserves notes and viewport, and persists one-step undo and redo', async () => {
    const original = { ...copy(branchedFlow), title: '假流程 A' };
    rows[0].doc = copy(original);
    const { container } = await setup();
    const stage = container.querySelector('[style*="transform-origin: 0 0"]') as HTMLElement;
    const beforeView = stage.style.transform;
    await userEvent.click(screen.getByRole('button', { name: '插入一步：是否收到法院诉讼证明？ → 告知机构暂停执行决定（是）' }));
    await waitFor(() => expect(rows[0].doc.nodes).toHaveLength(8), { timeout: 2500 });
    const inserted = copy(rows[0].doc), node = inserted.nodes.find(n => !original.nodes.some(o => o.id === n.id))!;
    expect(inserted.edges[2]).toEqual({ source: 'decision', target: node.id, label: '是', dashed: true });
    expect(inserted.edges[3]).toEqual({ source: node.id, target: 'court', dashed: true });
    expect(inserted.nodes.find(n => n.id === 'notice')!.note).toEqual(original.nodes[0].note);
    expect(inserted.nodes.find(n => n.id === 'execute')).toEqual(original.nodes.find(n => n.id === 'execute'));
    expect(stage.style.transform).toBe(beforeView);
    await userEvent.click(screen.getByRole('button', { name: '撤销' }));
    await waitFor(() => expect(rows[0].doc).toEqual(original), { timeout: 2500 });
    await userEvent.click(screen.getByRole('button', { name: '重做' }));
    await waitFor(() => expect(rows[0].doc).toEqual(inserted), { timeout: 2500 });
    await picked('假流程 B'); await picked('假流程 A');
    expect(rows[0].doc).toEqual(inserted); expect(rows[1].doc).toEqual(originalB);
    expect(writes.every(w => w.id === 'fake-a')).toBe(true);
  });

  it('accepts Space on the insertion button without starting canvas pan or triggering node deletion', async () => {
    rows[0].doc = { ...copy(branchedFlow), title: '假流程 A' };
    const { container } = await setup();
    const button = screen.getByRole('button', { name: '插入一步：通知用户裁决结果 → 等待 10 个工作日' });
    button.focus(); await userEvent.keyboard('{Delete}');
    expect(container.querySelectorAll('[data-node]')).toHaveLength(7);
    await userEvent.keyboard(' ');
    expect(container.querySelectorAll('[data-node]')).toHaveLength(8);
    expect(container.querySelector('[class*="canvasPan"]')).toBeNull();
    await userEvent.click(screen.getByRole('button', { name: '撤销' }));
    expect(container.querySelectorAll('[data-node]')).toHaveLength(7);
  });

  it('shows a safe failure without a save or undo entry when a locked descendant needs to move', async () => {
    const original = { ...copy(branchedFlow), title: '假流程 A' }; original.nodes[1].locked = true;
    rows[0].doc = copy(original); await setup();
    await userEvent.click(screen.getByRole('button', { name: '插入一步：通知用户裁决结果 → 等待 10 个工作日' }));
    expect(screen.getByText(/后续有锁定节点/)).toBeTruthy();
    expect((screen.getByRole('button', { name: '撤销' }) as HTMLButtonElement).disabled).toBe(true);
    await new Promise(resolve => setTimeout(resolve, 900));
    expect(writes).toEqual([]); expect(rows.map(r => r.doc)).toEqual([original, originalB]);
  });

  it('allows the undo shortcut immediately after clicking an insertion button', async () => {
    rows[0].doc = { ...copy(branchedFlow), title: '假流程 A' };
    const { container } = await setup();
    await userEvent.click(screen.getByRole('button', { name: '插入一步：通知用户裁决结果 → 等待 10 个工作日' }));
    expect(container.querySelectorAll('[data-node]')).toHaveLength(8);
    await userEvent.keyboard('{Control>}z{/Control}');
    expect(container.querySelectorAll('[data-node]')).toHaveLength(7);
  });

  it('reveals only the hovered or selected connection action so zoomed-out branches do not steal clicks', async () => {
    rows[0].doc = { ...copy(branchedFlow), title: '假流程 A' };
    const { container } = await setup();
    expect(container.querySelectorAll('button[data-active="true"]')).toHaveLength(0);
    const paths = container.querySelectorAll('path[stroke="transparent"]');
    fireEvent.pointerEnter(paths[2]);
    expect(container.querySelectorAll('button[data-active="true"]')).toHaveLength(1);
    expect(container.querySelector('button[data-active="true"]')?.getAttribute('aria-label')).toContain('（是）');
    fireEvent.click(paths[3]);
    expect(container.querySelectorAll('button[data-active="true"]')).toHaveLength(1);
    expect(container.querySelector('button[data-active="true"]')?.getAttribute('aria-label')).toContain('（否）');
  });

  it('does not write merely by loading or switching between unedited flows', async () => {
    await setup(); await picked('假流程 B'); await picked('假流程 A');
    await new Promise(resolve => setTimeout(resolve, 900));
    expect(writes).toEqual([]);
  });

  // The old lastLoadedRef identity shortcut silently skipped this save.
  it('persists undo back to the initially loaded document and keeps it after switching flows', async () => {
    await setup(); await addAndSave();
    await userEvent.click(screen.getByRole('button', { name: '撤销' }));
    await waitFor(() => expect(rows[0].doc.nodes).toHaveLength(1), { timeout: 2500 });
    expect(writes.map(w => w.doc.nodes.length)).toEqual([2, 1]);
    await picked('假流程 B'); await picked('假流程 A');
    expect(document.querySelectorAll('[data-node]')).toHaveLength(1);
    expect(rows[0].doc).toEqual(originalA); expect(rows[1].doc).toEqual(originalB);
  });

  it('resaves the undone content after a previously submitted save finishes later', async () => {
    const held = deferred<void>(); holdSave = held.promise;
    await setup(); await userEvent.click(screen.getByRole('button', { name: '＋ 节点' }));
    await waitFor(() => expect(writes).toHaveLength(1), { timeout: 2500 });
    await userEvent.click(screen.getByRole('button', { name: '撤销' }));
    await act(async () => held.resolve());
    await waitFor(() => expect(writes).toHaveLength(2), { timeout: 2500 });
    await waitFor(() => expect(rows[0].doc).toEqual(originalA));
    expect(rows[1].doc).toEqual(originalB);
  });

  it('retains the undo on a failed save and retries the current content rather than the abandoned edit', async () => {
    await setup(); await addAndSave(); failSave = true;
    await userEvent.click(screen.getByRole('button', { name: '撤销' }));
    await screen.findByRole('button', { name: '保存失败 · 点此重试' }, { timeout: 2500 });
    expect(document.querySelectorAll('[data-node]')).toHaveLength(1);
    await userEvent.click(screen.getByRole('button', { name: '保存失败 · 点此重试' }));
    await waitFor(() => expect(rows[0].doc).toEqual(originalA));
    expect(rows[1].doc).toEqual(originalB);
  });

  it.each(['success', 'failure'])('keeps pending export %s visible after changing views', async outcome => {
    const png = deferred<Blob>(); external.png.mockReturnValue(png.promise);
    await setup(); await startPng();
    await userEvent.click(screen.getByRole('button', { name: '清单' }));
    expect(screen.getByText('正在生成 PNG…')).toBeTruthy();
    await act(async () => outcome === 'success' ? png.resolve(new Blob(['fake-png'], { type: 'image/png' })) : png.reject(new Error('本地假生成失败')));
    await screen.findByText(outcome === 'success' ? 'PNG 文件已生成' : 'PNG 导出失败');
    await userEvent.click(screen.getByRole('button', { name: '流程图' }));
    expect(screen.getByText(outcome === 'success' ? 'PNG 文件已生成' : 'PNG 导出失败')).toBeTruthy();
    expect(external.download).toHaveBeenCalledTimes(outcome === 'success' ? 1 : 0);
    expect(rows.map(r => r.doc)).toEqual([originalA, originalB]); expect(writes).toEqual([]);
  });

  it('does not open canvas paste-generation behind the delete confirmation', async () => {
    await setup(); await userEvent.click(screen.getByRole('button', { name: '删除流程：假流程 A' }));
    const dialog = await screen.findByRole('dialog', { name: '确定删除这张流程？' });
    fireEvent.paste(within(dialog).getByRole('button', { name: '取消' }), { clipboardData: { getData: () => '假步骤一\n假步骤二' } });
    await userEvent.keyboard('{Escape}');
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
    expect(screen.queryByText('粘贴文字，生成流程图')).toBeNull();
    expect(rows.map(r => r.doc)).toEqual([originalA, originalB]); expect(writes).toEqual([]);
    // The ordinary canvas paste action must still work after the modal closes.
    fireEvent.paste(document.body, { clipboardData: { getData: () => '假步骤一\n假步骤二' } });
    expect(screen.getByText('粘贴文字，生成流程图')).toBeTruthy();
  });
});
