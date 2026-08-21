import { useLayoutEffect, useRef, useState } from 'react';

/** 量一个元素当前多宽多高。侧栏开关、窗口缩放都会变，所以要一直盯着。
 *  泳道用宽度摊列距，画布用宽高把图居中 —— 共用这一份。 */
export function useElementSize<T extends HTMLElement>(insetX = 0, insetY = 0) {
  const ref = useRef<T>(null);
  const [size, setSize] = useState({ w: 0, h: 0 });

  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    const measure = () => setSize({ w: el.clientWidth - insetX, h: el.clientHeight - insetY });
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    return () => ro.disconnect();
  }, [insetX, insetY]);

  return [ref, size] as const;
}
