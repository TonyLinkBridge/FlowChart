// @vitest-environment jsdom
import React, { useState } from 'react';
import { cleanup, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import { clampZ, type View } from '@/lib/viewport';
import { ZoomControls } from '@/components/chrome/ZoomControls';

beforeAll(() => {
  vi.stubGlobal('ResizeObserver', class { observe() {} unobserve() {} disconnect() {} });
});
afterEach(cleanup);
afterAll(() => vi.unstubAllGlobals());

describe('右下角缩放的 Arc Floating button group', () => {
  // Swapping callbacks, dropping the percentage or removing names from icon buttons breaks the contract.
  it('keeps the percentage and forwards each of the three actions exactly once', async () => {
    const out = vi.fn(), fit = vi.fn(), zoomIn = vi.fn();
    render(<ZoomControls zoom={1} onZoomOut={out} onFit={fit} onZoomIn={zoomIn} />);
    const toolbar = screen.getByRole('toolbar', { name: '画布缩放' });
    expect(toolbar.getAttribute('aria-orientation')).toBe('horizontal');
    expect(within(toolbar).getAllByRole('button')).toHaveLength(3);
    await userEvent.click(within(toolbar).getByRole('button', { name: '缩小画布' }));
    expect(out).toHaveBeenCalledTimes(1); expect(fit).not.toHaveBeenCalled(); expect(zoomIn).not.toHaveBeenCalled();
    await userEvent.click(within(toolbar).getByRole('button', { name: '适应画布 · 100%' }));
    await userEvent.click(within(toolbar).getByRole('button', { name: '放大画布' }));
    expect(out).toHaveBeenCalledTimes(1); expect(fit).toHaveBeenCalledTimes(1); expect(zoomIn).toHaveBeenCalledTimes(1);
  });

  it('uses one tab stop, wraps arrow focus, supports Home/End, and keeps zoom keys away from canvas shortcuts', async () => {
    const out = vi.fn(), fit = vi.fn(), zoomIn = vi.fn();
    render(<><button>前一个按钮</button><ZoomControls zoom={1} onZoomOut={out} onFit={fit} onZoomIn={zoomIn}/><button>后一个按钮</button></>);
    const toolbar = screen.getByRole('toolbar', { name: '画布缩放' });
    const [outButton, fitButton, inButton] = within(toolbar).getAllByRole('button');
    expect([outButton, fitButton, inButton].filter(b => b.tabIndex === 0)).toHaveLength(1);
    await userEvent.tab(); await userEvent.tab(); expect(document.activeElement).toBe(outButton);
    const leaked: string[] = [], onKey = (event: KeyboardEvent) => { leaked.push(event.key); };
    window.addEventListener('keydown', onKey);
    try {
      await userEvent.keyboard('{ArrowLeft}'); expect(document.activeElement).toBe(inButton);
      await userEvent.keyboard('{Home}'); expect(document.activeElement).toBe(outButton);
      await userEvent.keyboard('{ArrowRight}'); expect(document.activeElement).toBe(fitButton);
      await userEvent.keyboard('{Enter}'); expect(fit).toHaveBeenCalledTimes(1);
      await userEvent.keyboard('{End}'); expect(document.activeElement).toBe(inButton);
      await userEvent.keyboard(' '); expect(zoomIn).toHaveBeenCalledTimes(1);
      expect(out).not.toHaveBeenCalled(); expect(leaked).toEqual([]);
    } finally { window.removeEventListener('keydown', onKey); }
    await userEvent.tab(); expect(document.activeElement).toBe(screen.getByRole('button', { name: '后一个按钮' }));
    await userEvent.tab({ shift: true }); expect(document.activeElement).toBe(inButton);
  });

  it('updates the percentage and accessible name without replacing the focused fit button', async () => {
    const props = { onZoomOut: () => {}, onFit: () => {}, onZoomIn: () => {} };
    const { rerender } = render(<ZoomControls zoom={1} {...props} />);
    const fit = screen.getByRole('button', { name: '适应画布 · 100%' });
    fit.focus();
    rerender(<ZoomControls zoom={0.375} {...props} />);
    expect(screen.getByRole('button', { name: '适应画布 · 38%' })).toBe(fit);
    expect(document.activeElement).toBe(fit);
    expect(fit.textContent).toContain('38%');
    expect(screen.queryByRole('button', { name: '适应画布 · 100%' })).toBeNull();
  });

  it('dismisses a keyboard tooltip with Escape without passing the key to canvas', async () => {
    render(<ZoomControls zoom={1} onZoomOut={() => {}} onFit={() => {}} onZoomIn={() => {}} />);
    await userEvent.tab();
    await userEvent.keyboard('{ArrowRight}');
    expect(await screen.findByRole('tooltip', { name: '适应画布 · 100%' })).toBeTruthy();
    const leaked = vi.fn();
    window.addEventListener('keydown', leaked);
    try {
      await userEvent.keyboard('{Escape}');
      await waitFor(() => expect(screen.queryByRole('tooltip')).toBeNull());
      expect(leaked).not.toHaveBeenCalled();
    } finally { window.removeEventListener('keydown', leaked); }
  });

  it('works with the existing 1.2 scale callbacks and clamp without introducing panning or new zoom bounds', async () => {
    function LocalView() {
      const [view, setView] = useState<View>({ x: 12, y: 34, z: 1 });
      return <><output aria-label="假视口">{view.x},{view.y},{view.z}</output><ZoomControls zoom={view.z}
        onZoomOut={() => setView(v => ({ ...v, z: clampZ(v.z / 1.2) }))}
        onFit={() => setView({ x: 50, y: 60, z: 1 })}
        onZoomIn={() => setView(v => ({ ...v, z: clampZ(v.z * 1.2) }))}/></>;
    }
    render(<LocalView/>);
    const out = screen.getByRole('button', { name: '缩小画布' }), zoomIn = screen.getByRole('button', { name: '放大画布' });
    await userEvent.click(out); expect(screen.getByLabelText('假视口').textContent).toBe('12,34,0.8333333333333334');
    expect(screen.getByRole('button', { name: '适应画布 · 83%' })).toBeTruthy();
    for (let i = 0; i < 20; i++) await userEvent.click(out);
    expect(screen.getByLabelText('假视口').textContent).toBe('12,34,0.2');
    for (let i = 0; i < 35; i++) await userEvent.click(zoomIn);
    expect(screen.getByLabelText('假视口').textContent).toBe('12,34,2.5');
    await userEvent.click(screen.getByRole('button', { name: '适应画布 · 250%' }));
    expect(screen.getByLabelText('假视口').textContent).toBe('50,60,1');
  });
});
