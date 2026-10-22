// @vitest-environment jsdom
import React from 'react';
import { cleanup, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { diffDocuments } from '@/lib/version-diff';

const api = vi.hoisted(() => ({ fetchHistory: vi.fn(), snapshotVersion: vi.fn(), previewVersion: vi.fn() }));
vi.mock('@/lib/store', () => api);
import { VersionsPanel } from '@/components/chrome/VersionsPanel';

const snapshot = { id: 'fake-old', version: 3, savedBy: 'fake-user', savedName: '测试同事', note: '本地假存档', createdAt: Date.parse('2026-10-22T01:00:00Z') };
const currentDoc = { title: '本地当前流程', nodes: [{ id: 'a', title: '本地步骤', note: { text: '假邮件，不可丢失' } }], edges: [] };
const targetDoc = { ...currentDoc, title: '本地旧流程' };
const preview = {
  flowId: 'fake-flow', currentVersion: 12, currentUpdatedAt: '2026-10-22T02:00:00Z', snapshot,
  diff: diffDocuments(currentDoc, targetDoc),
};
const result = {
  doc: targetDoc, version: 13, backup: { id: 'fake-backup', version: 12, createdAt: '2026-10-22T02:01:00Z' },
  restoredFrom: { id: snapshot.id, version: 3 }, restoredSnapshotId: 'fake-restored',
};
beforeAll(() => {
  vi.stubGlobal('ResizeObserver', class { observe() {} unobserve() {} disconnect() {} });
});
beforeEach(() => {
  vi.resetAllMocks();
  api.fetchHistory.mockResolvedValue({ versions: [snapshot], activity: [] });
  api.previewVersion.mockResolvedValue(preview);
  api.snapshotVersion.mockResolvedValue(undefined);
  // jsdom lacks the native browser dialog lifecycle; real UI is checked separately.
  HTMLDialogElement.prototype.showModal = function () { this.setAttribute('open', ''); };
  HTMLDialogElement.prototype.close = function () { this.removeAttribute('open'); };
});
afterEach(cleanup);
afterAll(() => vi.unstubAllGlobals());
function setup() {
  const prepare = vi.fn().mockResolvedValue(undefined);
  const restore = vi.fn().mockResolvedValue(result);
  render(<VersionsPanel flowId="fake-flow" currentVersion={12} onClose={() => {}} onPrepareRestore={prepare} onRestore={restore} />);
  return { prepare, restore };
}
async function restoreFake() {
  await userEvent.click(await screen.findByRole('button', { name: '查看差异' }));
  await userEvent.click(await screen.findByRole('button', { name: '确认备份并恢复' }));
  await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
}

describe('版本历史的 Arc Alert 提示', () => {
  // Removing the error title, truncating the details, or losing the retry handler breaks this contract.
  it('announces the complete failure and keeps keyboard retry without invoking a write', async () => {
    const detail = `本地网络错误：${'完整错误说明'.repeat(30)}`;
    api.fetchHistory.mockRejectedValueOnce(new Error(detail));
    const { prepare, restore } = setup();
    const alert = await screen.findByRole('alert');
    expect(within(alert).getByText('历史记录操作失败')).toBeTruthy();
    expect(within(alert).getByText(`历史记录加载失败：${detail}`)).toBeTruthy();
    expect(within(alert).queryByRole('button')).toBeNull();
    const retry = screen.getByRole('button', { name: '重新加载历史' });
    retry.focus(); await userEvent.keyboard('{Enter}');
    await screen.findByText(/本地假存档/);
    await waitFor(() => expect(screen.queryByRole('alert')).toBeNull());
    expect(api.fetchHistory).toHaveBeenCalledTimes(2);
    expect(prepare).not.toHaveBeenCalled(); expect(restore).not.toHaveBeenCalled();
    expect(api.snapshotVersion).not.toHaveBeenCalled(); expect(api.previewVersion).not.toHaveBeenCalled();
  });

  it('updates a persistent error in place and does not hide or misreport a failed snapshot as success', async () => {
    api.fetchHistory.mockRejectedValueOnce(new Error('第一次网络错误')).mockRejectedValueOnce(new Error('第二次网络错误'));
    api.snapshotVersion.mockRejectedValueOnce(new Error('假存档失败'));
    const { restore } = setup();
    const alert = await screen.findByRole('alert');
    expect(within(alert).getByText('历史记录操作失败')).toBeTruthy();
    await userEvent.click(screen.getByRole('button', { name: '重新加载历史' }));
    await within(alert).findByText('历史记录加载失败：第二次网络错误');
    expect(screen.getByRole('alert')).toBe(alert);
    await userEvent.click(screen.getByRole('button', { name: '存一版' }));
    await within(alert).findByText('存档失败：假存档失败');
    expect(screen.queryByText('恢复完成，已自动备份')).toBeNull();
    expect(restore).not.toHaveBeenCalled();
  });

  it('politely reports exact restored and backup versions while the existing return button only previews the backup', async () => {
    const { restore } = setup();
    await restoreFake();
    const status = (await screen.findByText('恢复完成，已自动备份')).closest<HTMLElement>('[role="status"]')!;
    expect(within(status).getByText('恢复完成，已自动备份')).toBeTruthy();
    expect(within(status).getByText('已恢复为 V13，恢复前 V12 的完整内容已自动备份。')).toBeTruthy();
    expect(within(status).queryByRole('button')).toBeNull();
    expect(screen.queryByRole('alert')).toBeNull();
    expect(restore).toHaveBeenCalledTimes(1);
    const back = screen.getByRole('button', { name: '查看并退回恢复前' });
    back.focus(); await userEvent.keyboard(' ');
    await waitFor(() => expect(api.previewVersion).toHaveBeenLastCalledWith('fake-flow', 'fake-backup'));
    expect(restore).toHaveBeenCalledTimes(1);
    expect(api.snapshotVersion).not.toHaveBeenCalled();
  });

  it('keeps the backup receipt visible alongside a later history reload error', async () => {
    setup();
    await screen.findByText(/本地假存档/);
    api.fetchHistory.mockRejectedValueOnce(new Error('恢复成功后的列表读取失败'));
    await restoreFake();
    const alert = screen.getByRole('alert');
    expect(within(alert).getByText('历史记录操作失败')).toBeTruthy();
    expect(within(alert).getByText('历史记录加载失败：恢复成功后的列表读取失败')).toBeTruthy();
    expect(screen.getByText('恢复完成，已自动备份')).toBeTruthy();
    expect(screen.getByText('已恢复为 V13，恢复前 V12 的完整内容已自动备份。')).toBeTruthy();
    expect(screen.getByRole('button', { name: '重新加载历史' })).toBeTruthy();
    expect(screen.getByRole('button', { name: '查看并退回恢复前' })).toBeTruthy();
  });
});
