// @vitest-environment jsdom
import React from 'react';
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterAll, afterEach, beforeAll, expect, it, vi } from 'vitest';
import { NodeToolbar } from '@/components/flow/NodeToolbar';
import type { FlowNode } from '@/lib/types';

beforeAll(() => {
  vi.stubGlobal('ResizeObserver', class { observe() {} unobserve() {} disconnect() {} });
});
afterEach(cleanup);
afterAll(() => vi.unstubAllGlobals());
const node: FlowNode = { id: 'local-node', title: '假节点', style: { fill: '#B4322F', border: '#1F3A5F', bold: true }, note: { text: '邮件\n\nEND-KEEP' } };
function setup(onStyle = vi.fn()) {
  render(<><button>外部按钮</button><NodeToolbar node={node} x={300} y={200}
    onStyle={onStyle} onShape={() => {}} onHref={() => {}} onNote={() => {}} onLink={() => {}}
    onToggleLock={() => {}} onToggleMute={() => {}} onAddAfter={() => {}} onDelete={() => {}} /></>);
  return onStyle;
}

// Omitting the portaled accessible content, or leaking Escape to the canvas, breaks this host flow.
it('opens the named non-modal fill panel by keyboard and returns focus on Escape without canvas shortcuts', async () => {
  const change = setup();
  const trigger = screen.getByRole('button', { name: '填充' });
  trigger.focus(); await userEvent.keyboard('{Enter}');
  const panel = await screen.findByRole('dialog', { name: '填充色' });
  expect(trigger.getAttribute('aria-expanded')).toBe('true');
  expect(panel.getAttribute('aria-modal')).not.toBe('true');
  expect(panel.closest('[data-pop]')).toBe(panel);
  expect(panel.contains(document.activeElement)).toBe(true);
  const leaked: string[] = [], listener = (event: KeyboardEvent) => { leaked.push(event.key); };
  window.addEventListener('keydown', listener);
  try {
    await userEvent.keyboard('{Delete}{Escape}');
    await waitFor(() => expect(screen.queryByRole('dialog', { name: '填充色' })).toBeNull());
    expect(document.activeElement).toBe(trigger);
    expect(leaked).toEqual([]);
  } finally { window.removeEventListener('keydown', listener); }
  expect(change).not.toHaveBeenCalled();
});

it('keeps all eight preset colors and restore-default on the existing style callback only', async () => {
  const change = setup();
  await userEvent.click(screen.getByRole('button', { name: '填充' }));
  const panel = await screen.findByRole('dialog', { name: '填充色' });
  for (const hex of ['#101010', '#FFFFFF', '#F4F2ED', '#E3DFD5', '#9A6B12', '#B4322F', '#1F3A5F', '#3D5A46']) {
    await userEvent.click(within(panel).getByRole('button', { name: hex }));
    expect(change).toHaveBeenLastCalledWith({ fill: hex }, '改了填充色');
  }
  await userEvent.click(within(panel).getByRole('button', { name: '恢复默认' }));
  expect(change).toHaveBeenLastCalledWith({ fill: undefined }, '去掉了填充色');
  expect(change).toHaveBeenCalledTimes(9);
  expect(screen.getByRole('dialog', { name: '填充色' })).toBe(panel);
});

it('merges rapid custom-color changes into the existing delayed single style commit', async () => {
  const change = setup();
  await userEvent.click(screen.getByRole('button', { name: '填充' }));
  const panel = await screen.findByRole('dialog', { name: '填充色' });
  const input = within(panel).getByLabelText('自定义填充色');
  fireEvent.change(input, { target: { value: '#123456' } });
  fireEvent.change(input, { target: { value: '#654321' } });
  expect(change).not.toHaveBeenCalled();
  await waitFor(() => expect(change).toHaveBeenCalledTimes(1));
  expect(change).toHaveBeenLastCalledWith({ fill: '#654321' }, '改了填充色');
});

it('dismisses on outside interaction without stealing that outside focus', async () => {
  setup();
  await userEvent.click(screen.getByRole('button', { name: '填充' }));
  await screen.findByRole('dialog', { name: '填充色' });
  const outside = screen.getByRole('button', { name: '外部按钮' });
  await userEvent.click(outside);
  await waitFor(() => expect(screen.queryByRole('dialog', { name: '填充色' })).toBeNull());
  expect(document.activeElement).toBe(outside);
});

it('still opens the existing border controls when switching away from fill', async () => {
  const change = setup();
  await userEvent.click(screen.getByRole('button', { name: '填充' }));
  await screen.findByRole('dialog', { name: '填充色' });
  await userEvent.click(screen.getByRole('button', { name: '边框' }));
  await waitFor(() => expect(screen.queryByRole('dialog', { name: '填充色' })).toBeNull());
  await userEvent.click(screen.getByRole('button', { name: '虚线' }));
  expect(change).toHaveBeenLastCalledWith({ dashed: true }, '边框改成虚线');
});
