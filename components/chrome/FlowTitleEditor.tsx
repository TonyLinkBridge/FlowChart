'use client';

import { InlineEdit } from '@/components/arc/inline-edit/inline-edit';
import s from './FlowTitleEditor.module.css';

/** Confirmation applies a local title; the editor's existing status remains the cloud-save authority. */
export function FlowTitleEditor({ flowId, value, onConfirm, className }: {
  flowId: string;
  value: string;
  onConfirm: (flowId: string, title: string) => void;
  className?: string;
}) {
  return <div className={[s.root, className].filter(Boolean).join(' ')} data-flow-title data-pop
    onKeyDown={event => event.stopPropagation()} onKeyUp={event => event.stopPropagation()}
    onPaste={event => event.stopPropagation()}>
    <InlineEdit key={flowId} value={value} label="流程图标题" placeholder="给这张图起个名字"
      validate={next => next.trim() ? null : '流程名称不能为空'}
      onSave={next => onConfirm(flowId, next)} />
  </div>;
}
