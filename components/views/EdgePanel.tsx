'use client';

import type { FlowDoc, FlowEdge } from '@/lib/types';
import s from './Note.module.css';

/** 选中一条连线时的检查器：线上写什么、要不要虚线、删掉。 */
export function EdgePanel({ doc, index, onPatch, onDelete, onClose }: {
  doc: FlowDoc;
  index: number;
  onPatch: (i: number, p: Partial<FlowEdge>) => void;
  onDelete: (i: number) => void;
  onClose: () => void;
}) {
  const e = doc.edges[index];
  if (!e) return null;
  const name = (id: string) => doc.nodes.find(n => n.id === id)?.title ?? id;

  return (
    <div className={s.panel}>
      <div className={s.head}>
        <span className={s.idx}>连线 {String(index + 1).padStart(2, '0')} / 共 {String(doc.edges.length).padStart(2, '0')}</span>
        <span className={s.headBtns}>
          <button onClick={onClose} aria-label="关闭">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor"
                 strokeWidth="1.8" strokeLinecap="round"><path d="M6 6l12 12M18 6L6 18" /></svg>
          </button>
        </span>
      </div>

      <div className={s.body}>
        <div className={s.titleRow}>
          <div className={s.edgeWho}>
            从 <b>{name(e.source)}</b><br />到 <b>{name(e.target)}</b>
          </div>
        </div>

        <div className={s.sec}>
          <div className={s.secLabel} style={{ marginBottom: 12 }}>线上写什么</div>
          <input className={s.propInput} style={{ width: '100%' }} value={e.label ?? ''}
                 placeholder="比如 是 / 否 / 金额 > 5000"
                 onChange={ev => onPatch(index, { label: ev.target.value || undefined })} />
          <div className={s.hint}>判断节点引出的分支，习惯上写「是」和「否」</div>
        </div>

        <div className={s.sec} style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
          <span className={s.secLabel}>虚线</span>
          <span className={s.createNote} style={{ flexGrow: 1 }}>失败、驳回、终止这类弱分支，画成虚线</span>
          <button className={`${s.toggle} ${e.dashed ? s.toggleOn : s.toggleOff}`}
                  role="switch" aria-checked={!!e.dashed}
                  onClick={() => onPatch(index, { dashed: !e.dashed })}><i /></button>
        </div>

        <div className={s.sec} style={{ display: 'flex', justifyContent: 'flex-end' }}>
          <button className={s.danger} onClick={() => onDelete(index)}>删掉这条线</button>
        </div>
      </div>
    </div>
  );
}
