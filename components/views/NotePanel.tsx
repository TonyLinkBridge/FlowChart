'use client';

import { SHAPES } from '@/lib/doc';
import { footnoteIndex, type FlowDoc, type FlowNode } from '@/lib/types';
import s from './Note.module.css';

/** 节点检查器。改名字、形状、负责人、工期，删节点，往后接一步。
 *  附注不在这里读也不在这里改 —— 鼠标移到节点上就看到了，那条路更短。
 *  这里只留一个「写附注」的入口，因为没附注的节点不会弹气泡，
 *  不留入口就永远建不出第一条。 */
export function NotePanel({
  doc, nodeId, onClose, onPatch, onDelete, onAddAfter, onCreateNote,
}: {
  doc: FlowDoc;
  nodeId: string | null;
  onClose: () => void;
  onPatch: (nodeId: string, patch: Partial<FlowNode>) => void;
  onDelete: (nodeId: string) => void;
  onAddAfter: (nodeId: string) => void;
  onCreateNote: (nodeId: string) => void;
}) {
  const notes = footnoteIndex(doc);
  const node = nodeId ? doc.nodes.find(n => n.id === nodeId) : null;

  if (!node) {
    return (
      <div className={s.panel}>
        <div className={s.head}><span className={s.idx}>未选中</span></div>
        <div className={s.empty}>
          点画布上任意节点，就能在这里改它的名字、形状、负责人和工期。<br />
          节点上有金色编号的，鼠标移上去就能看到附注。
        </div>
      </div>
    );
  }

  const note = node.note;
  const bits = note
    ? [
        note.steps?.length ? `${note.steps.length} 步` : null,
        note.fields?.length ? `${note.fields.length} 个填空` : null,
        note.links?.length ? `${note.links.length} 个链接` : null,
      ].filter(Boolean).join(' · ')
    : '';

  return (
    <div className={s.panel}>
      <div className={s.head}>
        <span className={s.idx}>节点</span>
        <span className={s.who}>{node.title}</span>
        <span className={s.headBtns}>
          <button onClick={onClose} aria-label="取消选中">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor"
                 strokeWidth="1.8" strokeLinecap="round"><path d="M6 6l12 12M18 6L6 18" /></svg>
          </button>
        </span>
      </div>

      <div className={s.body}>
        <div className={s.props}>
          <div className={s.propRow}>
            <span className={s.propLabel}>名字</span>
            <input className={`${s.propInput} ${s.propTitle}`} value={node.title}
                   onChange={e => onPatch(node.id, { title: e.target.value })} />
          </div>
          <div className={s.propRow}>
            <span className={s.propLabel}>形状</span>
            <span className={s.seg}>
              {SHAPES.map(sh => (
                <button key={sh.value}
                        className={`${s.segBtn} ${(node.shape ?? 'process') === sh.value ? s.segOn : ''}`}
                        onClick={() => onPatch(node.id, { shape: sh.value })}>{sh.label}</button>
              ))}
            </span>
          </div>
          <div className={s.propRow}>
            <span className={s.propLabel}>负责人</span>
            <input className={s.propInput} value={node.owner ?? ''} placeholder="谁做"
                   onChange={e => onPatch(node.id, { owner: e.target.value || undefined })} />
            <input className={`${s.propInput} ${s.propNum}`} value={node.days ?? ''} placeholder="天数"
                   onChange={e => {
                     const v = e.target.value.replace(/[^0-9]/g, '');
                     onPatch(node.id, { days: v ? Number(v) : undefined });
                   }} />
          </div>
          <div className={s.propRow}>
            <span className={s.propLabel}>弱化</span>
            <span className={s.createNote} style={{ flexGrow: 1 }}>失败/终止这类分支，画成灰虚线，也不计入进度</span>
            <button className={`${s.toggle} ${node.muted ? s.toggleOn : s.toggleOff}`}
                    role="switch" aria-checked={!!node.muted}
                    onClick={() => onPatch(node.id, { muted: !node.muted })}><i /></button>
          </div>
        </div>

        <div className={s.createRow}>
          {note ? (
            <>
              <span className={s.idx}>附注 {String(notes.get(node.id)).padStart(2, '0')}</span>
              <span className={s.createNote}>{bits || '还没写内容'} —— 鼠标移到节点上查看和编辑</span>
            </>
          ) : (
            <>
              <button className={s.createBtn} onClick={() => onCreateNote(node.id)}>写附注</button>
              <span className={s.createNote}>操作步骤、要填的单号、相关链接、找谁</span>
            </>
          )}
        </div>
      </div>

      <div className={s.foot}>
        <button className={s.chip} onClick={() => onAddAfter(node.id)}>在后面接一步</button>
        <button className={s.danger} style={{ marginLeft: 'auto' }} onClick={() => onDelete(node.id)}>删除这个节点</button>
      </div>
    </div>
  );
}
