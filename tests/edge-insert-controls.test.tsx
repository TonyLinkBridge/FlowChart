// @vitest-environment jsdom
import React from 'react';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, expect, it, vi } from 'vitest';
import { EdgeInsertControls } from '@/components/flow/EdgeInsertControls';
import type { FlowDoc } from '@/lib/types';

afterEach(cleanup);
const doc: FlowDoc = { title: '假流程', nodes: [
  { id: 'a', title: '上一步', x: 100, y: 100 }, { id: 'b', title: '下一步', x: 100, y: 300 },
], edges: [{ source: 'missing', target: 'b' }, { source: 'a', target: 'b', label: '是' }] };

it('keeps the insert action on the exact edge and follows pan/zoom without scaling the button', async () => {
  const insert = vi.fn();
  const { rerender } = render(<EdgeInsertControls doc={doc} viewport={{ x: 10, y: 20, z: 0.5 }} onInsert={insert} />);
  const button = screen.getByRole('button', { name: '插入一步：上一步 → 下一步（是）' });
  expect(button.style.left).toBe('125px'); expect(button.style.top).toBe('131.5px');
  await userEvent.click(button); expect(insert).toHaveBeenCalledWith(1);
  rerender(<EdgeInsertControls doc={doc} viewport={{ x: -30, y: 40, z: 2 }} onInsert={insert} />);
  expect(button.style.left).toBe('430px'); expect(button.style.top).toBe('486px');
});

it('isolates pointer and keyboard actions from canvas handlers while retaining native button activation', async () => {
  const pan = vi.fn(), key = vi.fn(), insert = vi.fn();
  render(<div onPointerDown={pan} onKeyDown={key} onKeyUp={key}>
    <EdgeInsertControls doc={doc} viewport={{ x: 0, y: 0, z: 1 }} onInsert={insert} />
  </div>);
  const button = screen.getByRole('button');
  await userEvent.click(button); expect(pan).not.toHaveBeenCalled();
  await userEvent.keyboard('{Enter}'); await userEvent.keyboard(' ');
  expect(insert).toHaveBeenCalledTimes(3); expect(key).not.toHaveBeenCalled();
  fireEvent.keyDown(button, { key: 'Delete' }); expect(key).not.toHaveBeenCalled();
});

it('keeps merging-branch buttons on their own horizontal legs instead of overlapping on the shared trunk', () => {
  const joined: FlowDoc = { title: '汇合假流程', nodes: [
    { id: 'left', title: '左分支', x: 100, y: 400 },
    { id: 'right', title: '右分支', x: 600, y: 400 },
    { id: 'join', title: '汇合', x: 300, y: 650 },
  ], edges: [{ source: 'left', target: 'join' }, { source: 'right', target: 'join' }] };
  render(<EdgeInsertControls doc={joined} viewport={{ x: 0, y: 0, z: 1 }} onInsert={() => {}} />);
  const left = screen.getByRole('button', { name: '插入一步：左分支 → 汇合' });
  const right = screen.getByRole('button', { name: '插入一步：右分支 → 汇合' });
  expect(left.style.left).toBe('395px'); expect(right.style.left).toBe('515px');
  expect(left.style.top).toBe('423px'); expect(right.style.top).toBe('423px');
});
