// @vitest-environment jsdom
import React from 'react';
import { act, cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import type { FlowDoc } from '@/lib/types';
import { toSvg } from '@/lib/export/svg';
import { toMermaid } from '@/lib/export/mermaid';

// Only browser download/rasterization is replaced. The exporters and notification UI stay real.
const browser = vi.hoisted(() => ({ download: vi.fn(), svgToPng: vi.fn() }));
vi.mock('@/lib/export/download', async importOriginal => ({
  ...await importOriginal<typeof import('@/lib/export/download')>(), ...browser,
}));
import { ExportMenu } from '@/components/chrome/ExportMenu';

const doc: FlowDoc = {
  title: '本地 假流程', nodes: [{ id: 'a', title: '假步骤', note: { text: '完整假邮件\n第二段', fields: [{ label: '单号', value: 'FAKE-123' }], links: [{ label: '假链接', url: 'https://example.com' }] } }], edges: [],
};
const noFields: FlowDoc = { ...doc, nodes: [{ ...doc.nodes[0], note: { text: '完整假邮件\n第二段' } }] };
function setup(data = noFields) {
  const onDone = vi.fn();
  render(<ExportMenu doc={data} onDone={onDone} />);
  return onDone;
}
async function choose(fmt: string) {
  await userEvent.click(screen.getByRole('button', { name: '导出' }));
  await userEvent.click(screen.getByRole('button', { name: new RegExp(`^${fmt}`) }));
}
function deferred<T>() {
  let resolve!: (value: T) => void, reject!: (reason: Error) => void;
  const promise = new Promise<T>((yes, no) => { resolve = yes; reject = no; });
  return { promise, resolve, reject };
}
async function notifications() { return screen.findByRole('region', { name: '导出通知 (Alt+T)' }); }
async function blobText(blob: Blob) {
  return new Promise<string>((resolve, reject) => { const r = new FileReader(); r.onload = () => resolve(String(r.result)); r.onerror = reject; r.readAsText(blob); });
}
beforeAll(() => {
  vi.stubGlobal('ResizeObserver', class { observe() {} unobserve() {} disconnect() {} });
});
beforeEach(() => { vi.resetAllMocks(); });
afterEach(cleanup);
afterAll(() => vi.unstubAllGlobals());

describe('导出结果的 Arc Toast stack', () => {
  // A success emitted before PNG resolves, or replacing instead of updating the loading row, must fail.
  it('keeps one loading toast until PNG finishes, then updates that same row only after handing the file to the browser', async () => {
    const png = deferred<Blob>(); browser.svgToPng.mockReturnValueOnce(png.promise);
    const onDone = setup();
    await choose('PNG');
    const region = await notifications();
    const title = within(region).getByText('正在生成 PNG…');
    const row = title.closest('li')!;
    expect(within(region).queryByText('PNG 文件已生成')).toBeNull();
    expect(browser.download).not.toHaveBeenCalled(); expect(onDone).not.toHaveBeenCalled();
    const blob = new Blob(['fake-png'], { type: 'image/png' });
    await act(async () => png.resolve(blob));
    await within(row).findByText('PNG 文件已生成');
    expect(within(region).getAllByRole('listitem')).toHaveLength(1);
    expect(within(row).getByText(/已交给浏览器下载/)).toBeTruthy();
    expect(browser.download).toHaveBeenCalledWith(blob, '本地-假流程.png');
    expect(onDone).toHaveBeenCalledTimes(1);
  });

  it('changes the same pending toast into a complete failure, without download or a success callback', async () => {
    const png = deferred<Blob>(); browser.svgToPng.mockReturnValueOnce(png.promise);
    const onDone = setup(); await choose('PNG');
    const row = within(await notifications()).getByText('正在生成 PNG…').closest('li')!;
    await act(async () => png.reject(new Error('本地转换失败，完整原因不能丢')));
    await within(row).findByText('PNG 导出失败');
    expect(within(row).getByText('本地转换失败，完整原因不能丢')).toBeTruthy();
    expect(within(row).queryByText('PNG 文件已生成')).toBeNull();
    expect(browser.download).not.toHaveBeenCalled(); expect(onDone).not.toHaveBeenCalled();
  });

  it('closes the filled-data confirmation after choosing so a loading toast cannot cover the next export choice', async () => {
    const png = deferred<Blob>(); browser.svgToPng.mockReturnValueOnce(png.promise);
    setup(doc); await choose('PNG');
    await userEvent.click(screen.getByRole('button', { name: '一起带走' }));
    expect(screen.getByText('正在生成 PNG…')).toBeTruthy();
    expect(screen.queryByRole('button', { name: '一起带走' })).toBeNull();
    expect(screen.queryByRole('button', { name: '清空后导出' })).toBeNull();
    expect(screen.getByRole('button', { name: '导出' })).toBeTruthy();
  });

  it('preserves the filled-data warning, JSON redaction choice and source document without notifying before confirmation', async () => {
    const original = JSON.stringify(doc); setup(doc); await choose('JSON');
    expect(screen.getByText(/这份文件的附注里有/)).toBeTruthy();
    expect(browser.download).not.toHaveBeenCalled();
    expect(within(await notifications()).queryByRole('listitem')).toBeNull();
    await userEvent.click(screen.getByRole('button', { name: '清空后导出' }));
    const [blob, name] = browser.download.mock.calls[0];
    expect(name).toBe('本地-假流程.json'); expect(blob.type).toBe('application/json');
    expect(JSON.parse(await blobText(blob))).toEqual({ ...doc, nodes: [{ ...doc.nodes[0], note: { ...doc.nodes[0].note, fields: [{ label: '单号', value: '' }] } }] });
    expect(JSON.stringify(doc)).toBe(original);
    expect(screen.getByText(/已交给浏览器下载.*已清空填写内容/)).toBeTruthy();
  });

  it.each(['SVG', 'MMD', 'JSON'])('retains %s file bytes and original data when choosing to take filled values along', async fmt => {
    setup(doc); await choose(fmt);
    await userEvent.click(screen.getByRole('button', { name: '一起带走' }));
    const [blob, name] = browser.download.mock.calls[0];
    const ext = fmt.toLowerCase(); expect(name).toBe(`本地-假流程.${ext}`);
    const text = await blobText(blob);
    if (fmt === 'JSON') expect(text).toBe(JSON.stringify(doc, null, 2));
    if (fmt === 'SVG') expect(text).toBe(toSvg(doc, { redactFields: false }));
    if (fmt === 'MMD') expect(text).toBe(toMermaid(doc, { redactFields: false }));
    expect(screen.getByText(`${fmt === 'MMD' ? 'Mermaid' : fmt} 文件已生成`)).toBeTruthy();
  });

  it('keeps concurrent PNG results separate even when they finish in reverse order', async () => {
    const first = deferred<Blob>(), second = deferred<Blob>();
    browser.svgToPng.mockReturnValueOnce(first.promise).mockReturnValueOnce(second.promise);
    setup(); await choose('PNG');
    await choose('PNG');
    const region = await notifications();
    const rows = within(region).getAllByRole('listitem'); expect(rows).toHaveLength(2);
    await act(async () => second.resolve(new Blob(['second'])));
    expect(within(rows[0]).getByText('PNG 文件已生成')).toBeTruthy();
    expect(within(rows[1]).getByText('正在生成 PNG…')).toBeTruthy();
    await act(async () => first.reject(new Error('第一份假导出失败')));
    expect(within(rows[1]).getByText('PNG 导出失败')).toBeTruthy();
    expect(within(rows[0]).getByText('PNG 文件已生成')).toBeTruthy();
    expect(browser.download).toHaveBeenCalledTimes(1);
  });

  it('supports Alt+T and Escape without allowing toast keys to reach canvas shortcuts', async () => {
    const png = deferred<Blob>(); browser.svgToPng.mockReturnValueOnce(png.promise);
    setup(); await choose('PNG'); const region = await notifications();
    const close = within(region).getByRole('button', { name: '关闭通知' });
    const canvasKeys: string[] = [];
    const canvasKey = (e: KeyboardEvent) => canvasKeys.push(e.key);
    window.addEventListener('keydown', canvasKey);
    try {
      fireEvent.keyDown(document, { key: 't', code: 'KeyT', altKey: true });
      expect(document.activeElement).toBe(close);
      canvasKeys.length = 0;
      // Space is not handled by Arc's Escape handler; the portal boundary must stop canvas panning.
      fireEvent.keyDown(close, { key: ' ', code: 'Space' });
      await userEvent.keyboard('{Escape}');
      await waitFor(() => expect(close.closest('li')?.hasAttribute('inert') || !close.isConnected).toBe(true));
      expect(canvasKeys).toEqual([]);
    } finally { window.removeEventListener('keydown', canvasKey); }
  });
});
