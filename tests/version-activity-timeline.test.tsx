// @vitest-environment jsdom
import React from 'react';
import { cleanup, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import type { ActivityEntry } from '@/lib/store';

const api = vi.hoisted(() => ({ fetchHistory: vi.fn(), snapshotVersion: vi.fn(), previewVersion: vi.fn() }));
vi.mock('@/lib/store', () => api);
import { VersionsPanel } from '@/components/chrome/VersionsPanel';

const now = Date.parse('2026-10-22T03:30:00Z');
const longDetail = '假邮件详情，不能截掉。\n'.repeat(80) + 'END-DETAIL-KEEP';
const activity: ActivityEntry[] = [
  { action: 'create', actorName: 'Ceci', detail: '创建假流程', createdAt: Date.parse('2026-10-20T16:30:00Z') },
  { action: 'restore', actorName: 'Tony', detail: '本地假恢复记录', createdAt: Date.parse('2026-10-22T03:25:00Z') },
  { action: 'update', actorName: null, detail: null, createdAt: Date.parse('2026-10-20T15:55:00Z') },
  { action: 'snapshot', actorName: 'Tony', detail: longDetail, createdAt: Date.parse('2026-10-22T02:00:00Z') },
];

beforeAll(() => {
  // Browser observation/scroll geometry is exercised separately in the local fake-data page.
  vi.stubGlobal('IntersectionObserver', class {
    observe() {} unobserve() {} disconnect() {} takeRecords() { return []; }
  });
});
beforeEach(() => {
  vi.spyOn(Date, 'now').mockReturnValue(now);
  vi.spyOn(window, 'scrollTo').mockImplementation(() => {});
  api.fetchHistory.mockResolvedValue({ versions: [{ id: 'fake-snapshot', version: 3, savedBy: 'fake-user', savedName: 'Tony', note: '假存档', createdAt: now }], activity });
});
afterEach(() => { cleanup(); vi.restoreAllMocks(); });
afterAll(() => vi.unstubAllGlobals());

function setup() {
  const prepare = vi.fn();
  const restore = vi.fn();
  const props = { flowId: 'fake-flow-only', currentVersion: 12, onClose: () => {}, onPrepareRestore: prepare, onRestore: restore };
  const result = render(<VersionsPanel {...props} />);
  return { ...result, props, prepare, restore };
}

describe('版本历史动态的 Arc Timeline 展示', () => {
  it('sorts newest first and groups by the existing UTC+8 day rather than UTC midnight', async () => {
    setup();
    const feed = await screen.findByRole('region', { name: '流程操作动态' });
    const rows = within(feed).getAllByRole('listitem');
    expect(rows).toHaveLength(4);
    expect(rows.map(row => row.textContent)).toEqual([
      expect.stringContaining('Tony 恢复了版本'), expect.stringContaining('Tony 保存了存档'),
      expect.stringContaining('Ceci 创建了流程'), expect.stringContaining('有人 更新了流程'),
    ]);
    expect(within(feed).getByRole('heading', { name: /今天.*2.*条/ })).toBeTruthy();
    expect(within(feed).getByRole('heading', { name: /昨天.*1.*条/ })).toBeTruthy();
    expect(feed.querySelector('time')?.getAttribute('datetime')).toBe('2026-10-22T03:25:00.000Z');
    expect(feed.querySelector('time')?.getAttribute('title')).toContain('2026');
  });

  it('reveals the complete detail without triggering any snapshot, preview or restore writes', async () => {
    const { prepare, restore } = setup();
    const feed = await screen.findByRole('region', { name: '流程操作动态' });
    const row = within(feed).getByRole('button', { name: /Tony 保存了存档/ });
    expect(row.getAttribute('aria-expanded')).toBe('false');
    await userEvent.click(row);
    const detail = document.getElementById(row.getAttribute('aria-controls')!)!;
    expect(detail.textContent).toBe(longDetail);
    await userEvent.click(row);
    expect(row.getAttribute('aria-expanded')).toBe('false');
    expect(prepare).not.toHaveBeenCalled(); expect(restore).not.toHaveBeenCalled();
    expect(api.snapshotVersion).not.toHaveBeenCalled(); expect(api.previewVersion).not.toHaveBeenCalled();
    expect(api.fetchHistory).toHaveBeenCalledTimes(1);
    expect(screen.getByRole('button', { name: '查看差异' })).toBeTruthy();
    expect(screen.getByRole('button', { name: '存一版' })).toBeTruthy();
  });

  it('supports row keyboard navigation and leaves rows with no detail non-interactive', async () => {
    setup();
    const feed = await screen.findByRole('region', { name: '流程操作动态' });
    const first = within(feed).getByRole('button', { name: /Tony 恢复了版本/ });
    const middle = within(feed).getByRole('button', { name: /Tony 保存了存档/ });
    const last = within(feed).getByRole('button', { name: /Ceci 创建了流程/ });
    expect(within(feed).queryByRole('button', { name: /更新了流程/ })).toBeNull();
    first.focus(); await userEvent.keyboard('{ArrowDown}');
    expect(document.activeElement).toBe(middle);
    await userEvent.keyboard('{End}'); expect(document.activeElement).toBe(last);
    await userEvent.keyboard('{Home}'); expect(document.activeElement).toBe(first);
    await userEvent.keyboard('{Enter}'); expect(first.getAttribute('aria-expanded')).toBe('true');
    await userEvent.keyboard(' '); expect(first.getAttribute('aria-expanded')).toBe('false');
  });

  it('keeps duplicate records and open details stable when a newer record arrives', async () => {
    const { rerender, props } = setup();
    const feed = await screen.findByRole('region', { name: '流程操作动态' });
    await userEvent.click(within(feed).getByRole('button', { name: /Tony 恢复了版本/ }));
    api.fetchHistory.mockResolvedValue({ versions: [], activity: [
      { action: 'update', actorName: '新同事', detail: '新增假记录', createdAt: now }, ...activity, activity[0],
    ] });
    rerender(<VersionsPanel {...props} currentVersion={13} />);
    await within(feed).findByRole('button', { name: /新同事 更新了流程/ });
    await waitFor(() => expect(within(feed).getAllByRole('listitem')).toHaveLength(6));
    expect(within(feed).getByRole('button', { name: /Tony 恢复了版本/ }).getAttribute('aria-expanded')).toBe('true');
    expect(within(feed).getAllByRole('button', { name: /Ceci 创建了流程/ })).toHaveLength(2);
    expect(within(feed).getByRole('status').textContent).toContain('新动态');
  });

  it('does not invent activity when the existing history response is empty', async () => {
    api.fetchHistory.mockResolvedValue({ versions: [], activity: [] });
    setup();
    await screen.findByText(/还没有存档/);
    expect(screen.queryByRole('region', { name: '流程操作动态' })).toBeNull();
    expect(api.snapshotVersion).not.toHaveBeenCalled(); expect(api.previewVersion).not.toHaveBeenCalled();
  });
});
