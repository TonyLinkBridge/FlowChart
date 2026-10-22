// @vitest-environment jsdom
import React from 'react';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { diffDocuments } from '@/lib/version-diff';

const api = vi.hoisted(() => ({ fetchHistory: vi.fn(), snapshotVersion: vi.fn(), previewVersion: vi.fn() }));
vi.mock('@/lib/store', () => api);
import { VersionsPanel } from '@/components/chrome/VersionsPanel';

const flowId = 'flow-a';
const snapshot = { id: 'snapshot-a', version: 3, savedBy: 'user_tony', savedName: 'Tony', note: '旧存档', createdAt: Date.parse('2026-10-22T01:00:00Z') };
const currentDoc = { title: '当前流程', nodes: [{ id: 'a', title: '核实', note: { text: '不能丢的完整邮件模板' } }], edges: [] };
const targetDoc = { title: '旧流程', nodes: [{ id: 'a', title: '核实' }], edges: [] };
const preview = {
  flowId, currentVersion: 12, currentUpdatedAt: '2026-10-22T02:00:00Z', snapshot,
  diff: diffDocuments(currentDoc, targetDoc),
};

beforeEach(() => {
  api.fetchHistory.mockResolvedValue({ versions: [snapshot], activity: [] });
  api.previewVersion.mockResolvedValue(preview);
  api.snapshotVersion.mockResolvedValue(undefined);
  // jsdom does not implement the browser's native dialog lifecycle.
  HTMLDialogElement.prototype.showModal = function () { this.setAttribute('open', ''); };
  HTMLDialogElement.prototype.close = function () { this.removeAttribute('open'); };
});
afterEach(cleanup);

function setup() {
  const prepare = vi.fn().mockResolvedValue(undefined);
  const restore = vi.fn().mockResolvedValue({
    doc: targetDoc, version: 13, backup: { id: 'backup-a', version: 12, createdAt: '2026-10-22T02:01:00Z' },
    restoredFrom: { id: snapshot.id, version: 3 }, restoredSnapshotId: 'restored-a',
  });
  render(<VersionsPanel flowId={flowId} currentVersion={12} onClose={() => {}} onPrepareRestore={prepare} onRestore={restore} />);
  return { prepare, restore };
}

describe('版本预览与恢复', () => {
  it('shows exact lost mail content without restoring when only viewing differences', async () => {
    const { restore } = setup();
    await userEvent.click(await screen.findByRole('button', { name: '查看差异' }));
    expect(await screen.findByRole('dialog')).toBeTruthy();
    expect(await screen.findByText('不能丢的完整邮件模板')).toBeTruthy();
    expect(restore).not.toHaveBeenCalled();
    expect(screen.getByRole('button', { name: '确认备份并恢复' })).toBeTruthy();
  });

  it('allows cancel without changing the flow', async () => {
    const { restore } = setup();
    await userEvent.click(await screen.findByRole('button', { name: '查看差异' }));
    await userEvent.click(await screen.findByRole('button', { name: '取消，保留当前内容' }));
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
    expect(restore).not.toHaveBeenCalled();
  });

  it('confirms once and offers to preview the automatic backup before returning', async () => {
    const { restore } = setup();
    await userEvent.click(await screen.findByRole('button', { name: '查看差异' }));
    await userEvent.click(await screen.findByRole('button', { name: '确认备份并恢复' }));
    await waitFor(() => expect(restore).toHaveBeenCalledTimes(1));
    expect(restore.mock.calls[0][0]).toBe(flowId);
    expect(restore.mock.calls[0][1]).toMatchObject({ snapshotId: snapshot.id, expectedVersion: 12, expectedUpdatedAt: preview.currentUpdatedAt });
    await userEvent.click(await screen.findByRole('button', { name: '查看并退回恢复前' }));
    await waitFor(() => expect(api.previewVersion).toHaveBeenLastCalledWith(flowId, 'backup-a'));
    expect(restore).toHaveBeenCalledTimes(1);
  });

  it('keeps the confirmation disabled while restoring to prevent double submissions', async () => {
    const { restore } = setup();
    let finish!: (value: unknown) => void;
    restore.mockImplementationOnce(() => new Promise(resolve => { finish = resolve; }));
    await userEvent.click(await screen.findByRole('button', { name: '查看差异' }));
    const confirm = await screen.findByRole('button', { name: '确认备份并恢复' });
    await userEvent.click(confirm);
    fireEvent.click(confirm);
    expect(restore).toHaveBeenCalledTimes(1);
    expect(screen.getByRole('button', { name: '正在备份并恢复…' }).hasAttribute('disabled')).toBe(true);
    finish({ doc: targetDoc, version: 13, backup: { id: 'backup-a', version: 12 }, restoredFrom: { id: snapshot.id, version: 3 } });
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
  });

  it('keeps errors visible and lets the user refresh an out-of-date comparison', async () => {
    const { restore } = setup();
    restore.mockRejectedValueOnce(new Error('内容已变化，请重新查看差异'));
    await userEvent.click(await screen.findByRole('button', { name: '查看差异' }));
    await userEvent.click(await screen.findByRole('button', { name: '确认备份并恢复' }));
    expect(await screen.findByRole('alert')).toHaveProperty('textContent', '内容已变化，请重新查看差异');
    await userEvent.click(screen.getByRole('button', { name: '重新查看差异' }));
    await waitFor(() => expect(api.previewVersion).toHaveBeenCalledTimes(2));
  });

  it('does not present a failed history request as an empty history', async () => {
    api.fetchHistory.mockRejectedValueOnce(new Error('网络不通'));
    setup();
    expect(await screen.findByRole('alert')).toHaveProperty('textContent', '历史记录加载失败：网络不通');
    expect(screen.queryByText(/还没有存档/)).toBeNull();
  });

  it('does not enable confirmation after a comparison failed to load', async () => {
    api.previewVersion.mockRejectedValueOnce(new Error('读取失败'));
    const { restore } = setup();
    await userEvent.click(await screen.findByRole('button', { name: '查看差异' }));
    expect(await screen.findByRole('alert')).toHaveProperty('textContent', '读取失败');
    expect(screen.getByRole('button', { name: '确认备份并恢复' }).hasAttribute('disabled')).toBe(true);
    expect(restore).not.toHaveBeenCalled();
  });

  it('blocks a no-op restore when the contents already match', async () => {
    api.previewVersion.mockResolvedValueOnce({ ...preview, diff: diffDocuments(currentDoc, currentDoc) });
    const { restore } = setup();
    await userEvent.click(await screen.findByRole('button', { name: '查看差异' }));
    await screen.findByText('所选存档与当前内容完全相同，无需恢复。');
    expect(screen.getByRole('button', { name: '确认备份并恢复' }).hasAttribute('disabled')).toBe(true);
    expect(restore).not.toHaveBeenCalled();
  });

  it('shows all fields of a node that would be removed', async () => {
    const removed = { ...currentDoc.nodes[0], owner: '负责人 Tony', days: 7, done: true, href: 'https://example.com/mail', shape: 'decision' as const, x: 22, style: { fill: '#abcdef' } };
    api.previewVersion.mockResolvedValueOnce({ ...preview, diff: diffDocuments({ ...currentDoc, nodes: [removed] }, { ...targetDoc, nodes: [] }) });
    setup();
    await userEvent.click(await screen.findByRole('button', { name: '查看差异' }));
    await screen.findByRole('dialog');
    expect(await screen.findByText('负责人 Tony')).toBeTruthy();
    expect(screen.getByText('https://example.com/mail')).toBeTruthy();
    expect(screen.getByText(/#abcdef/)).toBeTruthy();
    expect(screen.getByText('工期')).toBeTruthy();
    expect(screen.getByText('完成状态')).toBeTruthy();
    expect(screen.getByText('横向位置')).toBeTruthy();
    expect(screen.getAllByRole('list', { name: '步骤排列顺序（也会影响附注编号）' })).toHaveLength(1);
  });
});
