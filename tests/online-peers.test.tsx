// @vitest-environment jsdom
import React from 'react';
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import { OnlinePeers } from '@/components/chrome/OnlinePeers';

const people = ['Ceci', 'Queenie', 'Lan', 'Juyu', 'Tony', '测试同事'].map((name, i) => ({ key: `p${i}`, name, color: '#986d18' }));
beforeAll(() => {
  vi.stubGlobal('ResizeObserver', class { observe() {} unobserve() {} disconnect() {} });
  vi.spyOn(window, 'scrollTo').mockImplementation(() => {});
});
afterEach(cleanup);
afterAll(() => { vi.restoreAllMocks(); vi.unstubAllGlobals(); });
const trigger = () => screen.getByRole('button', { name: /在线同事，\d+ 人/ });

describe('自写在线头像及成员名单', () => {
  it('renders only explicitly supplied typing and idle states with readable text, without inventing status for ordinary peers', async () => {
    const demo = people.map((peer, i) => ({ ...peer, status: i === 0 ? 'typing' as const : i === 1 ? 'idle' as const : undefined }));
    const { container } = render(<OnlinePeers peers={demo} />);
    await userEvent.click(trigger()); const list = await screen.findByRole('dialog');
    expect(within(list).getByText('正在输入')).toBeTruthy(); expect(within(list).getByText('暂时无操作')).toBeTruthy();
    expect(within(list).getAllByText('正在查看此流程')).toHaveLength(4);
    expect(container.querySelector('[data-peer-key="p0"]')?.getAttribute('data-peer-status')).toBe('typing');
    expect(container.querySelector('[data-peer-key="p1"]')?.getAttribute('data-peer-status')).toBe('idle');
    expect(within(list).getByText(/不等于离线/)).toBeTruthy();
    expect(screen.getByRole('status').textContent).toBe('');
  });

  it('does not memoize away status-only changes, restores the plain state and never announces typing as a join', async () => {
    const { rerender } = render(<OnlinePeers peers={people} />);
    await userEvent.click(trigger()); const list = await screen.findByRole('dialog');
    rerender(<OnlinePeers peers={people.map((peer, i) => i ? peer : { ...peer, status: 'typing' as const })} />);
    expect(within(list).getByText('正在输入')).toBeTruthy();
    rerender(<OnlinePeers peers={people.map((peer, i) => i ? peer : { ...peer, status: 'idle' as const })} />);
    expect(within(list).queryByText('正在输入')).toBeNull(); expect(within(list).getByText('暂时无操作')).toBeTruthy();
    rerender(<OnlinePeers peers={people} />);
    expect(within(list).queryByText('暂时无操作')).toBeNull();
    expect(within(list).getAllByText('正在查看此流程')).toHaveLength(6);
    expect(screen.getByRole('status').textContent).toBe('');
  });

  it('hides when alone, shows accurate overflow and lists all names as read-only content', async () => {
    const { rerender } = render(<OnlinePeers peers={[]} />);
    expect(screen.queryByRole('button')).toBeNull();
    rerender(<OnlinePeers peers={people} />);
    expect(trigger().getAttribute('aria-label')).toBe('在线同事，6 人');
    expect(screen.getByText('+2')).toBeTruthy();
    await userEvent.click(trigger());
    const list = await screen.findByRole('dialog', { name: '一起看这张流程' });
    for (const person of people) expect(within(list).getByText(person.name)).toBeTruthy();
    expect(within(list).getAllByText('正在查看此流程')).toHaveLength(6);
    expect(within(list).getAllByRole('button')).toHaveLength(1); // Close, never follow/select actions.
    expect(within(list).queryByText(/输入中|暂离/)).toBeNull();
  });

  it('supports one Tab entry, arrow-name navigation, Space open and Escape focus return without leaking canvas keys', async () => {
    const user = userEvent.setup(), keys: string[] = [], listener = (event: KeyboardEvent) => keys.push(`${event.type}:${event.key}`);
    render(<><OnlinePeers peers={people} /><button>外部按钮</button></>);
    await user.tab(); expect(document.activeElement).toBe(trigger());
    window.addEventListener('keydown', listener); window.addEventListener('keyup', listener);
    try {
      await user.keyboard('{ArrowRight}'); expect(screen.getByText('Queenie')).toBeTruthy();
      await user.keyboard('{ArrowLeft}'); expect(screen.getByText('Ceci')).toBeTruthy();
      await user.keyboard('{Delete} ');
      await screen.findByRole('dialog', { name: '一起看这张流程' });
      await user.keyboard('{Escape}');
      await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
      expect(document.activeElement).toBe(trigger());
      // Radix may unmount the focused close button before Escape's keyup; the canvas only handles Space on keyup.
      expect(keys.filter(key => key !== 'keyup:Escape')).toEqual([]);
    } finally { window.removeEventListener('keydown', listener); window.removeEventListener('keyup', listener); }
    await user.tab(); expect(document.activeElement).toBe(screen.getByRole('button', { name: '外部按钮' }));
  });

  it('reports joins and leaves, preserves stable face nodes on reorder and does not misreport cursor-only updates', async () => {
    const { container, rerender } = render(<OnlinePeers peers={people.slice(0, 2)} />);
    expect(screen.getByRole('status').textContent).toBe('');
    const ceci = container.querySelector('[data-peer-key="p0"]');
    rerender(<OnlinePeers peers={[...people.slice(0, 3)]} />);
    await waitFor(() => expect(screen.getByRole('status').textContent).toContain('Lan 加入'));
    const announcement = screen.getByRole('status').textContent;
    rerender(<OnlinePeers peers={[people[1], { ...people[0] }, people[2]]} />);
    expect(container.querySelector('[data-peer-key="p0"]')).toBe(ceci);
    expect(screen.getByRole('status').textContent).toBe(announcement);
    rerender(<OnlinePeers peers={[people[1], people[2]]} />);
    await waitFor(() => expect(screen.getByRole('status').textContent).toContain('Ceci 离开'));
  });

  it('updates an open roster and closes it when everyone leaves without leaving an interactive exit copy', async () => {
    const user = userEvent.setup();
    const { rerender } = render(<OnlinePeers peers={people} />);
    await user.click(trigger()); const list = await screen.findByRole('dialog');
    rerender(<OnlinePeers peers={people.slice(0, 1)} />);
    expect(within(list).getAllByRole('listitem')).toHaveLength(1);
    const leaving = within(list).queryByText('Queenie');
    if (leaving) expect(leaving.closest('[inert][aria-hidden="true"]')).toBeTruthy();
    expect(trigger().getAttribute('aria-label')).toBe('在线同事，1 人');
    const close = within(list).getByRole('button', { name: '关闭成员名单' });
    await user.click(close);
    if (close.isConnected) expect(close.closest('[inert]')).toBeTruthy();
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
    await user.click(trigger()); await screen.findByRole('dialog');
    rerender(<OnlinePeers peers={[]} />);
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull()); expect(screen.queryByRole('button')).toBeNull();
    expect(screen.getByRole('status').textContent).toContain('Ceci 离开');
  });

  it('outside click closes without stealing external focus and paste never reaches the canvas', async () => {
    const user = userEvent.setup(), pastes: string[] = [], listener = () => pastes.push('canvas paste');
    render(<><OnlinePeers peers={people} /><input aria-label="外部输入" /></>);
    await user.click(trigger()); const list = await screen.findByRole('dialog');
    window.addEventListener('paste', listener);
    try { fireEvent.paste(list); expect(pastes).toEqual([]); } finally { window.removeEventListener('paste', listener); }
    await user.click(screen.getByRole('textbox', { name: '外部输入' }));
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
    expect(document.activeElement).toBe(screen.getByRole('textbox', { name: '外部输入' }));
  });

  it('keeps missing names readable and treats name strings as text rather than markup', async () => {
    render(<OnlinePeers peers={[{ key: 'empty', name: ' ', color: '#000' }, { key: 'html', name: '<b>Ceci</b>', color: '#000' }]} />);
    await userEvent.click(trigger()); const list = await screen.findByRole('dialog');
    expect(within(list).getByText('未命名同事')).toBeTruthy();
    expect(within(list).getByText('<b>Ceci</b>')).toBeTruthy(); expect(list.querySelector('b')).toBeNull();
  });
});
