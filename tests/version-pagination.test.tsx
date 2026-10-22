// @vitest-environment jsdom
import React from 'react';
import { cleanup, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';

const api = vi.hoisted(() => ({ fetchHistory: vi.fn(), snapshotVersion: vi.fn(), previewVersion: vi.fn() }));
vi.mock('@/lib/store', () => api);
import { VersionsPanel } from '@/components/chrome/VersionsPanel';

const versions = Array.from({ length: 50 }, (_, index) => ({
  id: `fake-snapshot-${index + 1}`, version: index === 11 ? 490 : 500 - index,
  savedBy: 'fake-user', savedName: '测试同事', note: `假存档 ${index + 1}`,
  createdAt: Date.parse('2026-10-22T03:00:00Z') - index * 60_000,
}));
const activity = [{ action: 'create', actorName: '测试同事', detail: '独立的动态内容', createdAt: versions[0].createdAt }];
beforeAll(() => {
  // Browser-only geometry is verified in the local UI, not simulated by jsdom.
  vi.stubGlobal('ResizeObserver', class { observe() {} unobserve() {} disconnect() {} });
  vi.stubGlobal('IntersectionObserver', class { observe() {} unobserve() {} disconnect() {} takeRecords() { return []; } });
});
beforeEach(() => {
  vi.spyOn(window, 'scrollTo').mockImplementation(() => {});
  api.fetchHistory.mockResolvedValue({ versions, activity });
  api.previewVersion.mockRejectedValue(new Error('假数据只验证目标，不读取真实差异'));
  // Same native dialog lifecycle shim as the existing version-history UI tests.
  HTMLDialogElement.prototype.showModal = function () { this.setAttribute('open', ''); };
  HTMLDialogElement.prototype.close = function () { this.removeAttribute('open'); };
});
afterEach(() => { cleanup(); vi.restoreAllMocks(); });
afterAll(() => vi.unstubAllGlobals());

function setup() {
  const prepare = vi.fn().mockResolvedValue(undefined), restore = vi.fn();
  const props = { flowId: 'fake-flow-a', currentVersion: 500, onClose: () => {}, onPrepareRestore: prepare, onRestore: restore };
  const result = render(<VersionsPanel {...props} />);
  return { ...result, props, prepare, restore };
}
async function nav() { return screen.findByRole('navigation', { name: '存档分页' }); }
const pageButton = (feed: HTMLElement, n: number) => within(feed).getByRole('button', { name: `第 ${n} 页` });

describe('版本存档列表的 Arc Pagination', () => {
  it('shows ten of the fifty loaded snapshots and describes the bounds honestly', async () => {
    setup();
    const pager = await nav();
    expect(screen.getAllByRole('button', { name: '查看差异' })).toHaveLength(10);
    expect(screen.getByText(/假存档 1$/)).toBeTruthy();
    expect(screen.getByText(/假存档 10$/)).toBeTruthy();
    expect(screen.queryByText(/假存档 11$/)).toBeNull();
    expect(pageButton(pager, 1).getAttribute('aria-current')).toBe('page');
    expect(within(pager).getByRole('button', { name: '上一页' }).hasAttribute('disabled')).toBe(true);
    expect(screen.getByText(/已读取最近 50 份存档/)).toBeTruthy();
  });

  it('can reach every loaded snapshot without refetching, writing, previewing or touching the activity feed', async () => {
    const { prepare, restore } = setup();
    const pager = await nav();
    const feed = screen.getByRole('region', { name: '流程操作动态' });
    const event = within(feed).getByRole('button', { name: /创建了流程/ });
    await userEvent.click(event);
    const seen = new Set<string>();
    for (let page = 1; page <= 5; page++) {
      await userEvent.click(pageButton(pager, page));
      const notes = screen.getAllByText(/假存档 \d+$/);
      expect(notes).toHaveLength(10);
      notes.forEach(note => seen.add(note.textContent!));
      expect(pageButton(pager, page).getAttribute('aria-current')).toBe('page');
    }
    expect(seen.size).toBe(50);
    expect(screen.getByText(/假存档 50$/)).toBeTruthy();
    expect(within(pager).getByRole('button', { name: '下一页' }).hasAttribute('disabled')).toBe(true);
    expect(screen.getByRole('region', { name: '流程操作动态' })).toBe(feed);
    expect(event.getAttribute('aria-expanded')).toBe('true');
    expect(prepare).not.toHaveBeenCalled(); expect(restore).not.toHaveBeenCalled();
    expect(api.snapshotVersion).not.toHaveBeenCalled(); expect(api.previewVersion).not.toHaveBeenCalled();
    expect(api.fetchHistory).toHaveBeenCalledTimes(1);
  });

  it('preserves the exact snapshot ID for viewing differences on later pages, even when version numbers repeat', async () => {
    const { prepare, restore } = setup();
    const pager = await nav();
    await userEvent.click(pageButton(pager, 2));
    // Both these entries say V490, but they are separate stored snapshots.
    expect(screen.getAllByText('V490')).toHaveLength(2);
    const row = screen.getByText(/假存档 12$/).closest('div')!;
    await userEvent.click(within(row).getByRole('button', { name: '查看差异' }));
    await waitFor(() => expect(api.previewVersion).toHaveBeenCalledWith('fake-flow-a', 'fake-snapshot-12'));
    expect(prepare).toHaveBeenCalledWith('fake-flow-a');
    expect(restore).not.toHaveBeenCalled(); expect(api.snapshotVersion).not.toHaveBeenCalled();
  });

  it('supports Tab, Enter and Space and keeps pagination key events away from canvas shortcuts', async () => {
    setup();
    const pager = await nav();
    const leaked: string[] = [];
    const onKey = (event: KeyboardEvent) => { leaked.push(event.key); };
    window.addEventListener('keydown', onKey);
    try {
      pageButton(pager, 1).focus();
      await userEvent.tab(); expect(document.activeElement).toBe(pageButton(pager, 2));
      await userEvent.keyboard('{Enter}'); expect(pageButton(pager, 2).getAttribute('aria-current')).toBe('page');
      within(pager).getByRole('button', { name: '上一页' }).focus();
      await userEvent.keyboard(' '); expect(pageButton(pager, 1).getAttribute('aria-current')).toBe('page');
    } finally { window.removeEventListener('keydown', onKey); }
    expect(leaked).toEqual([]);
  });

  it('resets to the first page for another flow and does not add pagination to short or empty histories', async () => {
    const { rerender, props } = setup();
    await userEvent.click(pageButton(await nav(), 5));
    api.fetchHistory.mockResolvedValue({ versions: versions.slice(0, 3), activity: [] });
    rerender(<VersionsPanel {...props} flowId="fake-flow-b" />);
    await screen.findByText(/假存档 1$/);
    expect(screen.getAllByRole('button', { name: '查看差异' })).toHaveLength(3);
    expect(screen.queryByRole('navigation', { name: '存档分页' })).toBeNull();
    api.fetchHistory.mockResolvedValue({ versions: [], activity: [] });
    rerender(<VersionsPanel {...props} flowId="fake-flow-empty" />);
    await screen.findByText(/还没有存档/);
    expect(screen.queryByRole('button', { name: '查看差异' })).toBeNull();
    expect(screen.queryByRole('navigation', { name: '存档分页' })).toBeNull();
  });

  it('returns to new latest snapshots after refresh and clamps the page when the loaded list shrinks', async () => {
    const { rerender, props } = setup();
    await userEvent.click(pageButton(await nav(), 5));
    const added = { ...versions[0], id: 'fake-new', version: 501, note: '刚保存的假存档' };
    api.fetchHistory.mockResolvedValue({ versions: [added, ...versions.slice(0, 49)], activity });
    rerender(<VersionsPanel {...props} currentVersion={501} />);
    await screen.findByText(/刚保存的假存档/);
    expect(pageButton(await nav(), 1).getAttribute('aria-current')).toBe('page');
    await userEvent.click(pageButton(await nav(), 5));
    api.fetchHistory.mockResolvedValue({ versions: [added, versions[0]], activity });
    rerender(<VersionsPanel {...props} currentVersion={502} />);
    await waitFor(() => expect(screen.getAllByRole('button', { name: '查看差异' })).toHaveLength(2));
    expect(screen.queryByRole('navigation', { name: '存档分页' })).toBeNull();
    expect(screen.getByText(/刚保存的假存档/)).toBeTruthy();
  });
});
