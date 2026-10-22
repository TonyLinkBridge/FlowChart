import { describe, expect, it } from 'vitest';
import { SaveBarrier } from '@/lib/save-barrier';

function pending() {
  let resolve!: () => void;
  let reject!: (error: Error) => void;
  const promise = new Promise<void>((yes, no) => { resolve = yes; reject = no; });
  return { promise, resolve, reject };
}

describe('恢复前等待正在进行的保存', () => {
  it('waits for all saves belonging to the chosen flow', async () => {
    const barrier = new SaveBarrier();
    const a = pending(), b = pending();
    barrier.track('flow-a', a.promise); barrier.track('flow-a', b.promise);
    let done = false;
    const waiting = barrier.waitFor('flow-a').then(() => { done = true; });
    a.resolve(); await Promise.resolve();
    expect(done).toBe(false);
    b.resolve(); await waiting;
    expect(done).toBe(true);
  });

  it('does not wait for or change another flow save', async () => {
    const barrier = new SaveBarrier(), other = pending();
    barrier.track('flow-b', other.promise);
    await expect(barrier.waitFor('flow-a')).resolves.toBeUndefined();
    other.resolve();
  });

  it('stops preparation if an in-flight save fails', async () => {
    const barrier = new SaveBarrier(), task = pending();
    barrier.track('flow-a', task.promise);
    const waiting = barrier.waitFor('flow-a');
    task.reject(new Error('保存失败'));
    await expect(waiting).rejects.toThrow('保存失败');
  });

  it('also waits for a new save started while the first save is settling', async () => {
    const barrier = new SaveBarrier(), first = pending(), next = pending();
    barrier.track('flow-a', first.promise);
    let done = false;
    const waiting = barrier.waitFor('flow-a').then(() => { done = true; });
    barrier.track('flow-a', next.promise);
    first.resolve(); await Promise.resolve(); await Promise.resolve();
    expect(done).toBe(false);
    next.resolve(); await waiting;
    expect(done).toBe(true);
  });
});
