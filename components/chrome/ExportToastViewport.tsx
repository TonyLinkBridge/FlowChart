'use client';

import { useSyncExternalStore } from 'react';
import { createPortal } from 'react-dom';
import { ToastStack } from '@/components/arc/toast-stack/toast-stack';
import s from './ExportToastViewport.module.css';

const subscribe = () => () => {};
const getClientSnapshot = () => true;
const getServerSnapshot = () => false;

/** Escape the transformed bottom toolbar; keep notification input away from canvas shortcuts. */
export function ExportToastViewport() {
  const mounted = useSyncExternalStore(subscribe, getClientSnapshot, getServerSnapshot);
  return mounted && createPortal(
    <div className={s.portal} data-pop onKeyDown={event => event.stopPropagation()} onKeyUp={event => event.stopPropagation()}>
      <ToastStack label="导出通知" position="bottom-right" className={s.viewport} />
    </div>, document.body,
  );
}
