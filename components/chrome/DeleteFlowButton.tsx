'use client';

import { useRef, useState } from 'react';
import { Dialog, DialogClose, DialogContent, DialogTrigger } from '@/components/arc/dialog/dialog';
import s from './Sidebar.module.css';

/** Confirmation only. The existing caller still owns deletion, persistence and errors. */
export function DeleteFlowButton({ flowId, title, onDelete }: {
  flowId: string;
  title: string;
  onDelete: (id: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const cancel = useRef<HTMLButtonElement>(null);
  const trigger = useRef<HTMLButtonElement>(null);
  const submitted = useRef(false);

  return <Dialog open={open} onOpenChange={next => {
    if (next) submitted.current = false;
    setOpen(next);
  }}>
    <DialogTrigger asChild>
      <button ref={trigger} type="button" className={s.tool} title="删除" aria-label={`删除流程：${title || '未命名流程'}`}
        onClick={event => event.stopPropagation()}>×</button>
    </DialogTrigger>
    <DialogContent title="确定删除这张流程？" aria-modal="true"
      description="删除后，这张流程及其附注、版本历史会一并移除，不能从版本历史找回。其他流程不受影响。"
      onOpenAutoFocus={event => { event.preventDefault(); cancel.current?.focus(); }}
      onCloseAutoFocus={event => {
        if (!trigger.current?.isConnected) return;
        event.preventDefault();
        // Row tools are hover-only. Focus its always-visible title first so
        // :focus-within reveals the original trigger before returning focus.
        trigger.current.closest('[data-flow-row]')?.querySelector('input')?.focus({ preventScroll: true });
        trigger.current.focus({ preventScroll: true });
      }}
      onKeyDown={event => event.stopPropagation()}
      onPaste={event => event.stopPropagation()}>
      <p className={s.deleteName}>{title || '未命名流程'}</p>
      <p className={s.deleteHint}>请确认流程名称；不确定就先取消。</p>
      <div className={s.deleteActions}>
        <DialogClose asChild><button ref={cancel} type="button" className={s.deleteCancel}>取消</button></DialogClose>
        <DialogClose asChild>
          <button type="button" className={s.deleteConfirm} onClick={() => {
            if (submitted.current) return;
            submitted.current = true;
            onDelete(flowId);
          }}>确认删除</button>
        </DialogClose>
      </div>
    </DialogContent>
  </Dialog>;
}
