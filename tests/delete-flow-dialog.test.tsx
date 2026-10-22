// @vitest-environment jsdom
import React, { useState } from 'react';
import { cleanup, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it } from 'vitest';
import { Sidebar } from '@/components/chrome/Sidebar';
import type { Workspace } from '@/lib/store';

afterEach(cleanup);

const workspace: Workspace = {
  currentId: 'flow-a', folders: [],
  docs: [
    { id: 'flow-a', folderId: null, version: 1, updatedAt: 1, doc: { title: '正在查看的流程', nodes: [], edges: [] } },
    { id: 'flow-b', folderId: null, version: 2, updatedAt: 2, doc: { title: '准备删除的测试流程', nodes: [{ id: 'b', title: '假步骤' }], edges: [] } },
  ],
};

function setup() {
  const deleted: string[] = [];
  const picked: string[] = [];
  function Harness() {
    const [ws, setWs] = useState(workspace);
    return <Sidebar ws={ws} spaces={[]} onClose={() => {}} onNew={() => {}} onRename={() => {}}
      onMove={() => {}} onNewFolder={() => {}} onRenameFolder={() => {}} onDropFolder={() => {}} onMoveSpace={() => {}}
      onPick={id => { picked.push(id); setWs(current => ({ ...current, currentId: id })); }}
      onDelete={id => {
        deleted.push(id);
        setWs(current => ({ ...current, docs: current.docs.filter(doc => doc.id !== id) }));
      }} />;
  }
  render(<Harness />);
  return { deleted, picked };
}

describe('删除流程前的 Arc Dialog 确认', () => {
  it('opens confirmation without deleting or selecting the other flow', async () => {
    const { deleted, picked } = setup();
    await userEvent.click(screen.getAllByTitle('删除')[1]);
    expect(deleted).toEqual([]);
    expect(picked).toEqual([]);
    const dialog = await screen.findByRole('dialog');
    expect(dialog.getAttribute('aria-modal')).toBe('true');
    expect(within(dialog).getByText('准备删除的测试流程')).toBeTruthy();
    expect(dialog.getAttribute('aria-labelledby')).toBeTruthy();
    expect(dialog.getAttribute('aria-describedby')).toBeTruthy();
    expect(document.activeElement).toBe(within(dialog).getByRole('button', { name: '取消' }));
  });

  it('cancels without changing any flow and restores focus to the delete trigger', async () => {
    const { deleted } = setup();
    const trigger = screen.getAllByTitle('删除')[1];
    await userEvent.click(trigger);
    await userEvent.click(within(await screen.findByRole('dialog')).getByRole('button', { name: '取消' }));
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
    expect(deleted).toEqual([]);
    expect(screen.getByDisplayValue('准备删除的测试流程')).toBeTruthy();
    await waitFor(() => expect(document.activeElement).toBe(trigger));
  });

  it('Escape closes without deleting and returns focus to the trigger', async () => {
    const { deleted } = setup();
    const trigger = screen.getAllByTitle('删除')[1];
    await userEvent.click(trigger);
    await screen.findByRole('dialog');
    await userEvent.keyboard('{Escape}');
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
    expect(deleted).toEqual([]);
    await waitFor(() => expect(document.activeElement).toBe(trigger));
  });

  it('keeps Tab and Shift+Tab inside the confirmation', async () => {
    setup();
    await userEvent.click(screen.getAllByTitle('删除')[1]);
    const dialog = await screen.findByRole('dialog');
    for (let index = 0; index < 5; index++) {
      await userEvent.tab();
      expect(dialog.contains(document.activeElement)).toBe(true);
    }
    for (let index = 0; index < 5; index++) {
      await userEvent.tab({ shift: true });
      expect(dialog.contains(document.activeElement)).toBe(true);
    }
  });

  it('confirms only the named flow through the existing delete callback', async () => {
    const { deleted, picked } = setup();
    await userEvent.click(screen.getAllByTitle('删除')[1]);
    await userEvent.click(within(await screen.findByRole('dialog')).getByRole('button', { name: '确认删除' }));
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
    expect(deleted).toEqual(['flow-b']);
    expect(picked).toEqual([]);
    expect(screen.queryByDisplayValue('准备删除的测试流程')).toBeNull();
    expect(screen.getByDisplayValue('正在查看的流程')).toBeTruthy();
  });
});
