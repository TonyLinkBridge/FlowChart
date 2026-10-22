// @vitest-environment jsdom
import React, { createRef } from 'react';
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { ScrollArea } from '@/components/arc/scroll-area/scroll-area';

afterEach(() => { cleanup(); vi.restoreAllMocks(); vi.unstubAllGlobals(); vi.useRealTimers(); });
function metrics(node: Element, values: Record<string, number>) {
  for (const [key, value] of Object.entries(values)) Object.defineProperty(node, key, { configurable: true, value, writable: true });
}
describe('Arc 原生滚动容器', () => {
  it('tracks overflow, fades, scrollbar visibility and edge callbacks without rerendering children', () => {
    vi.useFakeTimers(); const edges = vi.fn(), scroll = vi.fn(), child = vi.fn();
    function Content() { child(); return <p>本地假列表</p>; }
    const root = createRef<HTMLDivElement>(), viewport = createRef<HTMLDivElement>();
    render(<ScrollArea ref={root} viewportRef={viewport} label="假名单" fade={12} hideDelay={900} onEdgeChange={edges} onScroll={scroll}><Content /></ScrollArea>);
    const node = screen.getByRole('region', { name: '假名单' });
    expect(viewport.current).toBe(node); expect(node.tabIndex).toBe(0);
    const track = root.current!.querySelector('[data-axis="y"]')!;
    expect(track.getAttribute('aria-hidden')).toBe('true'); expect(track.hasAttribute('data-hidden')).toBe(true);
    metrics(node, { clientHeight: 100, scrollHeight: 500, clientWidth: 100, scrollWidth: 100, scrollTop: 50 });
    metrics(track, { clientHeight: 94 }); fireEvent.scroll(node);
    expect(track.hasAttribute('data-hidden')).toBe(false);
    expect(node.style.getPropertyValue('--fade-top')).toBe('12px'); expect(node.style.getPropertyValue('--fade-bottom')).toBe('12px');
    expect(edges.mock.lastCall![0]).toEqual({ top: true, bottom: true, left: false, right: false });
    expect(root.current!.hasAttribute('data-scrolling')).toBe(true); expect(scroll).toHaveBeenCalledTimes(1); expect(child).toHaveBeenCalledTimes(1);
    const calls = edges.mock.calls.length; fireEvent.scroll(node); expect(edges).toHaveBeenCalledTimes(calls);
    metrics(node, { scrollTop: 400 }); fireEvent.scroll(node);
    expect(node.style.getPropertyValue('--fade-bottom')).toBe('0px');
    expect(edges.mock.lastCall![0]).toEqual({ top: true, bottom: false, left: false, right: false });
    act(() => vi.advanceTimersByTime(900)); expect(root.current!.hasAttribute('data-scrolling')).toBe(false);
    metrics(node, { scrollHeight: 100, scrollTop: 0 }); fireEvent.scroll(node);
    expect(track.hasAttribute('data-hidden')).toBe(true); expect(root.current!.hasAttribute('data-overflow')).toBe(false);
  });
  it('keeps native vertical wheel and keys available, disables fades when asked and clears observers/timers on unmount', () => {
    vi.useFakeTimers(); const disconnect = vi.fn();
    vi.stubGlobal('ResizeObserver', class { observe() {} disconnect = disconnect; });
    const { unmount } = render(<ScrollArea label="原生名单" fade={0} maxHeight={200}>内容</ScrollArea>);
    const node = screen.getByRole('region', { name: '原生名单' });
    expect(node.getAttribute('data-fade')).toBeNull(); expect(node.style.maxHeight).toBe('200px');
    expect(fireEvent.wheel(node, { deltaY: 40 })).toBe(true); expect(fireEvent.keyDown(node, { key: 'PageDown' })).toBe(true);
    fireEvent.scroll(node); expect(vi.getTimerCount()).toBe(1); unmount();
    expect(vi.getTimerCount()).toBe(0); expect(disconnect).toHaveBeenCalled();
  });
  it('preserves optional horizontal wheel conversion only within bounds and never intercepts pinch zoom', () => {
    const { container } = render(<ScrollArea label="横向假列表" orientation="horizontal">假内容</ScrollArea>);
    const node = screen.getByRole('region', { name: '横向假列表' });
    metrics(node, { clientWidth: 100, scrollWidth: 500, scrollLeft: 0 });
    expect(fireEvent.wheel(node, { deltaY: 30, ctrlKey: true })).toBe(true); expect(node.scrollLeft).toBe(0);
    expect(fireEvent.wheel(node, { deltaY: 30 })).toBe(false); expect(node.scrollLeft).toBe(30);
    metrics(node, { scrollLeft: 400 }); expect(fireEvent.wheel(node, { deltaY: 30 })).toBe(true);
    expect(container.querySelector('[data-axis="x"]')).toBeTruthy(); expect(container.querySelector('[data-axis="y"]')).toBeNull();
  });
  it('maps thumb dragging to native scroll distance and pages the track instantly with reduced motion', () => {
    vi.stubGlobal('PointerEvent', MouseEvent);
    const { container } = render(<ScrollArea label="拖动假名单">本地内容</ScrollArea>);
    const node = screen.getByRole('region', { name: '拖动假名单' });
    const track = container.querySelector('[data-axis="y"]') as HTMLElement, thumb = track.firstElementChild as HTMLElement;
    metrics(node, { clientHeight: 100, scrollHeight: 500, scrollTop: 100 });
    metrics(track, { clientHeight: 94 }); metrics(thumb, { offsetHeight: 28 });
    thumb.setPointerCapture = vi.fn(); thumb.hasPointerCapture = () => false;
    fireEvent.pointerDown(thumb, { button: 0, clientY: 10 }); fireEvent.pointerMove(thumb, { clientY: 43 });
    expect(node.scrollTop).toBeCloseTo(300); expect(node.style.scrollSnapType).toBe('none');
    fireEvent.pointerCancel(thumb); expect(node.style.scrollSnapType).toBe('');
    expect(container.firstElementChild!.hasAttribute('data-dragging')).toBe(false);
    const scrollBy = vi.fn(); node.scrollBy = scrollBy;
    vi.stubGlobal('matchMedia', () => ({ matches: true }));
    fireEvent.pointerDown(track, { button: 0, clientY: 90 }); expect(scrollBy).toHaveBeenLastCalledWith({ top: 90, behavior: 'auto' });
  });
});
