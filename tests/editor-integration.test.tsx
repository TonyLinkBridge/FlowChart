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
  collab: { mates: [], ghosts: {}, sendCursor: () => {}, sendDrag: () => {}, sendDragEnd: () => {}, sendSel: () => {}, announceSaved: () => {} },
  png: vi.fn(), download: vi.fn(),
}));
vi.mock('@clerk/nextjs', () => ({
  useUser: () => ({ user: external.user }), useClerk: () => ({ signOut: () => {} }),
  useOrganization: () => ({ organization: null }), useOrganizationList: () => ({ userMemberships: external.memberships }),
  OrganizationSwitcher: () => null, UserButton: () => null,
}));
vi.mock('@/hooks/useCollab', () => ({ useCollab: () => external.collab }));
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
  writes = []; holdSave = null; failSave = false;
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
  await waitFor(() => expect((screen.getByRole('textbox', { name: '流程图标题' }) as HTMLInputElement).value).toBe('假流程 A'));
  return result;
}
async function picked(name: string) {
  await userEvent.click(within(screen.getByRole('complementary')).getByDisplayValue(name));
  await waitFor(() => expect((screen.getByRole('textbox', { name: '流程图标题' }) as HTMLInputElement).value).toBe(name));
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

describe('实际编辑页的本地联动回归', () => {
  it('does not save by opening rich notes, then persists rich edits and local text undo without touching flow B', async () => {
    const text = 'Dear Manager,\nFirst line.\n\n完整邮件\n\nEND-MAIL\n';
    const original = copy(originalA); original.nodes[0].note = { text, contact: '假联系人',
      steps: [{ text: '核对资料', done: false }], fields: [{ label: '编号', value: 'FAKE-123' }],
      links: [{ label: '参考', url: 'https://example.test' }] };
    rows[0].doc = copy(original);
    const { container } = await setup();
    fireEvent.click(container.querySelector('[data-node] sup')!);
    await screen.findByRole('dialog');
    const editor = screen.getByRole('textbox', { name: '附注／邮件模板格式编辑' });
    await new Promise(resolve => setTimeout(resolve, 900));
    expect(writes).toEqual([]); expect(rows[0].doc).toEqual(original);
    editor.innerHTML = editor.innerHTML.replace('First line.', 'First line edited.');
    fireEvent.input(editor, { inputType: 'insertText', data: '.' });
    await waitFor(() => expect(rows[0].doc.nodes[0].note?.text).toBe(text.replace('First line.', 'First line edited.')), { timeout: 2500 });
    expect(rows[0].doc.nodes[0].note).toEqual({ ...original.nodes[0].note, text: text.replace('First line.', 'First line edited.') });
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
