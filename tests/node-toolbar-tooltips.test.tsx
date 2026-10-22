// @vitest-environment jsdom
import React, { useState } from 'react';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterAll, afterEach, beforeAll, expect, it, vi } from 'vitest';
import { NodeToolbar } from '@/components/flow/NodeToolbar';

beforeAll(() => {
  // Text measurement is a browser boundary; the real Arc and Radix components remain mounted.
  vi.stubGlobal('ResizeObserver', class { observe() {} unobserve() {} disconnect() {} });
});
afterEach(cleanup);
afterAll(() => vi.unstubAllGlobals());
function setup() {
  const style = vi.fn(), add = vi.fn(), mute = vi.fn(), remove = vi.fn(), href = vi.fn();
  function Harness() {
    const [locked, setLocked] = useState(false);
    return <NodeToolbar node={{ id: 'local', title: '假节点', locked, note: { text: '邮件\n\nEND-KEEP' } }} x={300} y={200}
      onStyle={style} onShape={() => {}} onHref={href} onNote={() => {}} onLink={() => {}}
      onToggleLock={() => setLocked(v => !v)} onToggleMute={mute} onAddAfter={add} onDelete={remove} />;
  }
  render(<Harness />);
  return { style, add, mute, remove, href };
}

it('makes the three icon hints keyboard discoverable without leaking Escape or triggering actions', async () => {
  const actions = setup();
  const leaked: string[] = [], listener = (event: KeyboardEvent) => leaked.push(event.key);
  window.addEventListener('keydown', listener);
  try {
    for (const label of ['文字样式', '锁定位置', '更多节点操作']) {
      const button = screen.getByRole('button', { name: label });
      button.focus();
      const tip = await screen.findByRole('tooltip');
      expect(tip.textContent).toContain(label);
      expect(button.getAttribute('aria-describedby')).toBe(tip.id);
      await userEvent.keyboard('{Escape}');
      await waitFor(() => expect(screen.queryByRole('tooltip')).toBeNull());
      expect(document.activeElement).toBe(button);
    }
    expect(leaked).not.toContain('Escape');
  } finally { window.removeEventListener('keydown', listener); }
  for (const callback of Object.values(actions)) expect(callback).not.toHaveBeenCalled();
});

it('shows a hover hint while retaining the original text-style controls and href action', async () => {
  const actions = setup();
  const button = screen.getByRole('button', { name: '文字样式' });
  await userEvent.hover(button);
  expect((await screen.findByRole('tooltip')).textContent).toContain('文字样式');
  await userEvent.click(button);
  await userEvent.click(screen.getByRole('button', { name: 'B' }));
  expect(actions.style).toHaveBeenLastCalledWith({ bold: true }, '加粗');
  await userEvent.type(screen.getByPlaceholderText('https://…'), 'example.test');
  await userEvent.click(screen.getByRole('button', { name: '挂链接' }));
  expect(actions.href).toHaveBeenLastCalledWith('https://example.test');
});

it('returns Escape to the original canvas behavior after the hint is already closed', async () => {
  setup();
  const button = screen.getByRole('button', { name: '更多节点操作' });
  button.focus(); await screen.findByRole('tooltip');
  await userEvent.keyboard('{Escape}');
  await waitFor(() => expect(screen.queryByRole('tooltip')).toBeNull());
  const escaped: string[] = [], listener = (event: KeyboardEvent) => escaped.push(event.key);
  window.addEventListener('keydown', listener);
  try {
    await userEvent.keyboard('{Escape}');
    expect(escaped).toEqual(['Escape']);
  } finally { window.removeEventListener('keydown', listener); }
});

it('does not forward a Radix-consumed Escape after its tooltip ARIA link has been removed', () => {
  setup();
  const button = screen.getByRole('button', { name: '更多节点操作' });
  const escaped: string[] = [], listener = (event: KeyboardEvent) => escaped.push(event.key);
  window.addEventListener('keydown', listener);
  try {
    // Native Radix capture can remove aria-describedby before React receives the event.
    const event = new KeyboardEvent('keydown', { key: 'Escape', bubbles: true, cancelable: true });
    event.preventDefault();
    fireEvent(button, event);
    expect(escaped).toEqual([]);
  } finally { window.removeEventListener('keydown', listener); }
});

it('keeps locking functional and announces the correct action for its new state', async () => {
  setup();
  const button = screen.getByRole('button', { name: '锁定位置' });
  await userEvent.click(button);
  expect(screen.getByRole('button', { name: '解锁位置' })).toBe(button);
  button.blur(); button.focus();
  expect((await screen.findByRole('tooltip')).textContent).toContain('解锁位置');
  await userEvent.click(button);
  expect(screen.getByRole('button', { name: '锁定位置' })).toBe(button);
});

it('keeps Space activation and all more actions without canvas pan or accidental Delete', async () => {
  const actions = setup();
  const more = screen.getByRole('button', { name: '更多节点操作' });
  const leaked: string[] = [], listener = (event: KeyboardEvent) => leaked.push(event.key);
  window.addEventListener('keydown', listener);
  try {
    more.focus(); await userEvent.keyboard(' {Delete}');
    expect(leaked).not.toContain(' '); expect(leaked).not.toContain('Delete');
    expect(actions.remove).not.toHaveBeenCalled();
    await userEvent.click(screen.getByRole('button', { name: '在后面接一步' }));
    expect(actions.add).toHaveBeenCalledTimes(1);
    await userEvent.click(more);
    await userEvent.click(screen.getByRole('button', { name: '弱化（失败/终止分支）' }));
    expect(actions.mute).toHaveBeenCalledTimes(1);
    await userEvent.click(more);
    await userEvent.click(screen.getByRole('button', { name: '删除节点' }));
    expect(actions.remove).toHaveBeenCalledTimes(1);
  } finally { window.removeEventListener('keydown', listener); }
});
