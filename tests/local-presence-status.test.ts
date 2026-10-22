import { afterEach, describe, expect, it, vi } from 'vitest';
import { createLocalPresenceStatus } from './fixtures/local-presence-status';

const ceci = { key: 'ceci', name: 'Ceci', color: '#a87515', x: 100, y: 200 };
const queenie = { key: 'queenie', name: 'Queenie', color: '#477e94', x: 300, y: 400 };
afterEach(() => { vi.clearAllTimers(); vi.useRealTimers(); });
function setup() {
  vi.useFakeTimers();
  const demo = createLocalPresenceStatus({ typingMs: 3000, idleMs: 15000 });
  demo.connect('fake-a', [ceci, queenie]); return demo;
}
describe('仅本地的成员状态模拟器', () => {
  it('expires typing after the last keystroke, rather than the first one', () => {
    const demo = setup(); demo.type('ceci');
    vi.advanceTimersByTime(2500); demo.type('ceci');
    vi.advanceTimersByTime(500); expect(demo.snapshot()[0].status).toBe('typing');
    vi.advanceTimersByTime(2499); expect(demo.snapshot()[0].status).toBe('typing');
    vi.advanceTimersByTime(1); expect(demo.snapshot()[0].status).toBe('viewing');
    expect(demo.snapshot()[1].status).toBe('viewing'); demo.disconnect();
  });
  it('becomes idle only after inactivity and activity cancels typing/idle without changing cursor coordinates', () => {
    const demo = setup(); vi.advanceTimersByTime(14999);
    expect(demo.snapshot()[0].status).toBe('viewing'); vi.advanceTimersByTime(1);
    expect(demo.snapshot().map(peer => peer.status)).toEqual(['idle', 'idle']);
    demo.activity('ceci'); expect(demo.snapshot()[0]).toEqual({ ...ceci, status: 'viewing' });
    demo.type('ceci'); demo.activity('ceci'); vi.advanceTimersByTime(3000);
    expect(demo.snapshot()[0]).toEqual({ ...ceci, status: 'viewing' });
    expect(demo.snapshot()[1]).toEqual({ ...queenie, status: 'idle' }); demo.disconnect();
  });
  it('clears old timers on flow switch, even when the next flow contains the same user id', () => {
    const demo = setup(); demo.type('ceci'); vi.advanceTimersByTime(2500);
    demo.connect('fake-b', [{ ...ceci, name: 'B 的 Ceci' }]); demo.type('ceci');
    vi.advanceTimersByTime(500); expect(demo.snapshot()[0]).toEqual({ ...ceci, name: 'B 的 Ceci', status: 'typing' });
    vi.advanceTimersByTime(2500); expect(demo.snapshot()[0].status).toBe('viewing');
    demo.connect('fake-a', [ceci, queenie]); expect(demo.snapshot().map(peer => peer.status)).toEqual(['viewing', 'viewing']);
    demo.disconnect(); expect(vi.getTimerCount()).toBe(0);
  });
  it('disconnects immediately, ignores input while disconnected and never resurrects stale members', () => {
    const demo = setup(); demo.type('ceci'); const before = demo.snapshot();
    demo.disconnect(); expect(demo.snapshot()).toEqual([]); expect(vi.getTimerCount()).toBe(0);
    demo.type('ceci'); demo.activity('ceci'); vi.advanceTimersByTime(60000);
    expect(demo.snapshot()).toEqual([]); expect(vi.getTimerCount()).toBe(0);
    expect(before[0].status).toBe('typing');
    demo.connect('fake-a', [ceci]); expect(demo.snapshot()).toEqual([{ ...ceci, status: 'viewing' }]); demo.disconnect();
  });
  it('removes a departed peer and its timers while keeping other members and coordinates intact', () => {
    const demo = setup(); demo.type('ceci'); demo.remove('ceci');
    vi.advanceTimersByTime(3000); expect(demo.snapshot()).toEqual([{ ...queenie, status: 'viewing' }]);
    expect(ceci).toEqual({ key: 'ceci', name: 'Ceci', color: '#a87515', x: 100, y: 200 }); demo.disconnect();
  });
});
