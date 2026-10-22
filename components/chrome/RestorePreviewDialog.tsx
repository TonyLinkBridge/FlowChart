'use client';

import { useEffect, useId, useRef } from 'react';
import type { FlowEdge, FlowNode, Note } from '@/lib/types';
import type { RestorePreview } from '@/lib/version-restore';
import s from './RestorePreview.module.css';

const FIELD_LABELS: Record<string, string> = {
  id: '步骤标识', title: '名称', subtitle: '说明', direction: '排列方向', note: '附注 / 邮件模板',
  shape: '形状', owner: '负责人', days: '工期', done: '完成状态', muted: '弱化状态',
  style: '颜色与文字样式', href: '链接', locked: '位置锁定', x: '横向位置', y: '纵向位置',
  nodeOrder: '步骤排列顺序（也会影响附注编号）', edgeOrder: '连线列表与顺序',
};

function NoteContent({ note }: { note?: Note }) {
  if (!note) return <p className={s.empty}>无附注</p>;
  return <>
    {note.text && <><h5>说明 / 邮件模板</h5><pre>{note.text}</pre></>}
    {!!note.steps?.length && <><h5>操作步骤</h5><ul>{note.steps.map((step, i) => <li key={i}>{step.done ? '已完成' : '未完成'} · {step.text}</li>)}</ul></>}
    {!!note.fields?.length && <><h5>填写项</h5><ul>{note.fields.map((field, i) => <li key={i}>{field.label}：{field.value || '未填写'}</li>)}</ul></>}
    {!!note.links?.length && <><h5>相关链接</h5><ul>{note.links.map((link, i) => <li key={i}>{link.label}：{link.url}</li>)}</ul></>}
    {note.contact && <><h5>联系人</h5><pre>{note.contact}</pre></>}
  </>;
}

function Value({ field, value }: { field: string; value: unknown }) {
  if (field === 'note') return <NoteContent note={value as Note | undefined} />;
  if ((field === 'nodeOrder' || field === 'edgeOrder') && Array.isArray(value))
    return value.length ? <ol aria-label={FIELD_LABELS[field]}>{value.map((item, i) => <li key={i}>{String(item)}</li>)}</ol> : <p className={s.empty}>无</p>;
  const text = value == null ? '未设置'
    : typeof value === 'boolean' ? (value ? '是' : '否')
      : typeof value === 'object' ? JSON.stringify(value, null, 2) : String(value);
  return <pre>{text}</pre>;
}

function NodeList({ nodes, label }: { nodes: FlowNode[]; label: string }) {
  if (!nodes.length) return null;
  return <section className={s.section}>
    <h3>{label}（{nodes.length}）</h3>
    {nodes.map(node => <details key={node.id} className={s.detail}>
      <summary>{node.title || '未命名步骤'}{node.note ? ' · 含附注 / 模板' : ''}</summary>
      {Object.entries(node).filter(([, value]) => value !== undefined).map(([field, value]) => <div key={field} className={s.value}>
        <h4>{FIELD_LABELS[field] || field}</h4><Value field={field} value={value} />
      </div>)}
    </details>)}
  </section>;
}

export function RestorePreviewDialog({ preview, loading, busy, error, onCancel, onRefresh, onConfirm }: {
  preview: RestorePreview | null;
  loading: boolean;
  busy: boolean;
  error: string;
  onCancel: () => void;
  onRefresh: () => void;
  onConfirm: () => void;
}) {
  const ref = useRef<HTMLDialogElement>(null);
  const titleId = useId();
  const descriptionId = useId();
  useEffect(() => {
    const dialog = ref.current;
    const previous = document.activeElement;
    if (dialog && !dialog.open) dialog.showModal();
    return () => {
      if (dialog?.open) dialog.close();
      if (previous instanceof HTMLElement && previous.isConnected) previous.focus();
    };
  }, []);

  const diff = preview?.diff;
  const edgeName = (edge: FlowEdge, before = false) => {
    const titles = before ? diff?.currentNodeTitles : diff?.targetNodeTitles;
    return `${titles?.[edge.source] || edge.source} → ${titles?.[edge.target] || edge.target}${edge.label ? ` · ${edge.label}` : ''}${edge.dashed ? ' · 虚线' : ''}`;
  };
  return <dialog
    ref={ref} data-pop data-restore-dialog className={s.dialog}
    aria-labelledby={titleId} aria-describedby={descriptionId} aria-busy={loading || busy}
    onKeyDown={event => event.stopPropagation()}
    onCancel={event => { event.preventDefault(); if (!busy) onCancel(); }}
  >
    <header className={s.header}>
      <div>
        <h2 id={titleId}>恢复前，先看有什么不同</h2>
        <p id={descriptionId}>现在只是查看。确认后会先完整备份，再替换这一张流程；其他流程不变。</p>
      </div>
      <button type="button" onClick={onCancel} disabled={busy} aria-label="关闭差异预览">×</button>
    </header>
    <div className={s.body}>
      {loading && <p role="status">正在确认当前内容并读取差异…</p>}
      {error && <div className={s.error}><p role="alert">{error}</p><button type="button" onClick={onRefresh} disabled={busy || loading}>重新查看差异</button></div>}
      {preview && diff && <>
        <p className={s.version}>当前 V{preview.currentVersion} → 所选存档 V{preview.snapshot.version}</p>
        <p className={s.meta}>{preview.snapshot.savedName || '同事'} · {new Date(preview.snapshot.createdAt).toLocaleString('zh-CN')}{preview.snapshot.note ? ` · ${preview.snapshot.note}` : ''}</p>
        <div className={s.summary}>
          <span>步骤：{diff.currentCounts.nodes} → {diff.targetCounts.nodes}</span>
          <span>附注：{diff.currentCounts.notes} → {diff.targetCounts.notes}</span>
          <span>连线：{diff.currentCounts.edges} → {diff.targetCounts.edges}</span>
        </div>
        {!diff.hasChanges && <p className={s.notice}>所选存档与当前内容完全相同，无需恢复。</p>}
        {(diff.summary.notesRemoved > 0 || diff.summary.notesChanged > 0 || diff.summary.nodesRemoved > 0) && <p className={s.warning}>
          恢复后会移除 {diff.summary.nodesRemoved} 个步骤、移除 {diff.summary.notesRemoved} 条附注，替换 {diff.summary.notesChanged} 条附注 / 模板。请展开下面的内容核对。
        </p>}
        {!!diff.documentChanges.length && <section className={s.section}>
          <h3>流程名称与设置</h3>
          {diff.documentChanges.map(change => <div key={change.field} className={s.change}>
            <h4>{FIELD_LABELS[change.field] || change.field}</h4>
            <div className={s.columns}><div className={s.value}><strong>现在</strong><Value field={change.field} value={change.before} /></div><div className={s.value}><strong>恢复后</strong><Value field={change.field} value={change.after} /></div></div>
          </div>)}
        </section>}
        <NodeList nodes={diff.nodesRemoved} label="恢复后会移除的步骤" />
        <NodeList nodes={diff.nodesAdded} label="恢复后会出现的步骤" />
        {!!diff.nodesChanged.length && <section className={s.section}>
          <h3>内容或位置会改变的步骤（{diff.nodesChanged.length}）</h3>
          {diff.nodesChanged.map(node => <details key={node.id} className={s.detail} open={node.fields.includes('note')}>
            <summary>{node.title || '未命名步骤'} · {node.fields.map(field => FIELD_LABELS[field] || field).join('、')}</summary>
            {node.fields.map(field => <div key={field} className={s.change}>
              <h4>{FIELD_LABELS[field] || field}</h4>
              <div className={s.columns}>
                <div className={s.value}><strong>现在</strong><Value field={field} value={node.before[field as keyof FlowNode]} /></div>
                <div className={s.value}><strong>恢复后</strong><Value field={field} value={node.after[field as keyof FlowNode]} /></div>
              </div>
            </div>)}
          </details>)}
        </section>}
        {(diff.edgesAdded.length > 0 || diff.edgesRemoved.length > 0 || diff.edgesChanged.length > 0) && <section className={s.section}>
          <h3>连线变化</h3>
          <ul className={s.edges}>
            {diff.edgesRemoved.map((edge, i) => <li key={`removed-${i}`}>移除：{edgeName(edge, true)}</li>)}
            {diff.edgesAdded.map((edge, i) => <li key={`added-${i}`}>新增：{edgeName(edge)}</li>)}
            {diff.edgesChanged.map((edge, i) => <li key={`changed-${i}`}>修改：{edgeName(edge.before, true)} → {edgeName(edge.after)}</li>)}
          </ul>
        </section>}
      </>}
    </div>
    <footer className={s.footer}>
      <span>备份失败就停止；确认后可查看备份并退回。</span>
      <div className={s.actions}>
        <button type="button" className={s.cancel} onClick={onCancel} disabled={busy}>取消，保留当前内容</button>
        <button type="button" className={s.confirm} onClick={onConfirm} disabled={busy || loading || !!error || !diff?.hasChanges}>
          {busy ? '正在备份并恢复…' : '确认备份并恢复'}
        </button>
      </div>
    </footer>
  </dialog>;
}
