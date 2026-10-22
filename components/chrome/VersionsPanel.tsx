'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { fetchHistory, snapshotVersion, previewVersion, type ActivityEntry, type FlowVersion } from '@/lib/store';
import type { RestorePreview, RestoreRequest, RestoreResult } from '@/lib/version-restore';
import { RestorePreviewDialog } from './RestorePreviewDialog';
import s from './Chrome.module.css';

const when = (time: number) => new Date(time).toLocaleString('zh-CN', {
  year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit',
});
const message = (error: unknown) => error instanceof Error ? error.message : '请稍后重试';

const ACTION_TEXT: Record<string, string> = {
  create: '创建了流程', update: '更新了流程', delete: '删除了流程',
  restore: '恢复了版本', snapshot: '保存了存档',
};

interface Props {
  flowId: string;
  currentVersion: number;
  onClose: () => void;
  onPrepareRestore: (flowId: string) => Promise<void>;
  onRestore: (flowId: string, request: RestoreRequest) => Promise<RestoreResult>;
}

/** A different flow always gets independent history, preview and undo state. */
export function VersionsPanel(props: Props) {
  return <VersionsPanelBody key={props.flowId} {...props} />;
}

function VersionsPanelBody({ flowId, currentVersion, onClose, onPrepareRestore, onRestore }: Props) {
  const [versions, setVersions] = useState<FlowVersion[] | null>(null);
  const [activity, setActivity] = useState<ActivityEntry[]>([]);
  const [note, setNote] = useState('');
  const [saving, setSaving] = useState(false);
  const [historyError, setHistoryError] = useState('');
  const [selectedSnapshot, setSelectedSnapshot] = useState<string | null>(null);
  const [preview, setPreview] = useState<RestorePreview | null>(null);
  const [loadingPreview, setLoadingPreview] = useState(false);
  const [restoring, setRestoring] = useState(false);
  const [previewError, setPreviewError] = useState('');
  const [receipt, setReceipt] = useState<RestoreResult | null>(null);
  const generation = useRef(0);
  const submitting = useRef(false);

  const load = useCallback(() => fetchHistory(flowId)
    .then(history => { setVersions(history.versions); setActivity(history.activity); setHistoryError(''); })
    .catch(error => { setHistoryError(`历史记录加载失败：${message(error)}`); }), [flowId]);
  useEffect(() => { void load(); }, [load, currentVersion]);

  const snapshot = async () => {
    setSaving(true);
    try {
      await onPrepareRestore(flowId);
      await snapshotVersion(flowId, note.trim() || undefined);
      setNote(''); await load();
    } catch (error) { setHistoryError(`存档失败：${message(error)}`); }
    finally { setSaving(false); }
  };

  const showPreview = async (snapshotId: string) => {
    const token = ++generation.current;
    setSelectedSnapshot(snapshotId); setPreview(null); setPreviewError(''); setLoadingPreview(true);
    try {
      await onPrepareRestore(flowId);
      const comparison = await previewVersion(flowId, snapshotId);
      if (token === generation.current) setPreview(comparison);
    } catch (error) { if (token === generation.current) setPreviewError(message(error)); }
    finally { if (token === generation.current) setLoadingPreview(false); }
  };
  const cancelPreview = () => {
    if (submitting.current) return;
    generation.current++;
    setSelectedSnapshot(null); setPreview(null); setPreviewError('');
  };
  const confirm = async () => {
    if (!preview || !preview.diff.hasChanges || submitting.current || previewError) return;
    submitting.current = true; setRestoring(true);
    try {
      const result = await onRestore(flowId, {
        snapshotId: preview.snapshot.id,
        expectedVersion: preview.currentVersion, expectedUpdatedAt: preview.currentUpdatedAt,
      });
      setReceipt(result); setSelectedSnapshot(null); setPreview(null);
      await load();
    } catch (error) { setPreviewError(message(error)); }
    finally { submitting.current = false; setRestoring(false); }
  };

  return <>
    <div className={s.histFloat} data-pop>
      <div className={s.histHead}>
        <span className={s.histTitle}>版本历史</span>
        <button type="button" className={s.histClose} onClick={onClose} aria-label="关闭版本历史" disabled={restoring}>×</button>
      </div>

      <div className={s.histSnapRow}>
        <input className={s.histNote} value={note} placeholder="备注（可不填）" aria-label="存档备注"
               maxLength={200}
               onChange={e => setNote(e.target.value)}
               onKeyDown={e => { if (e.key === 'Enter' && !saving) void snapshot(); }} />
        <button type="button" className={s.histSnapBtn} onClick={() => void snapshot()} disabled={saving || restoring}>{saving ? '保存中…' : '存一版'}</button>
      </div>

      <div className={s.histBody}>
        {historyError && <div className={s.histNotice}><p role="alert">{historyError}</p><button type="button" onClick={() => void load()}>重新加载历史</button></div>}
        {receipt && <div className={s.histNotice}>
          <p role="status">已恢复为 V{receipt.version}，恢复前 V{receipt.backup.version} 的完整内容已自动备份。</p>
          <button type="button" onClick={() => void showPreview(receipt.backup.id)} disabled={restoring}>查看并退回恢复前</button>
        </div>}
        {!historyError && versions === null ? (
          <div className={s.histEmpty} role="status">翻档案中…</div>
        ) : !historyError && versions?.length === 0 ? (
          <div className={s.histEmpty}>还没有存档 —— 编辑一会儿会自动落第一版</div>
        ) : versions?.map(v => (
          <div key={v.id} className={s.histRow}>
            <span className={s.histVer}>V{v.version}</span>
            <span className={s.histMeta}>
              {v.savedName ?? '同事'} · {when(v.createdAt)}
              {v.note ? <span className={s.histNoteText}> · {v.note}</span> : null}
            </span>
            {v.version === currentVersion && <span className={s.histNow}>当前版本号</span>}
            <button type="button" className={s.histRestore} onClick={() => void showPreview(v.id)} disabled={restoring}>查看差异</button>
          </div>
        ))}
        {!!versions?.length && <p className={s.histEmpty}>显示最近 {versions.length} 份存档；先查看差异，确认后才会恢复。</p>}

        {activity.length > 0 && (
          <>
            <div className={s.histSection}>动态</div>
            {activity.map((a, i) => (
              <div key={i} className={s.histAct}>
                <span>{a.actorName ?? '有人'} {ACTION_TEXT[a.action] ?? a.action}</span>
                {a.detail ? <span className={s.histActDetail} title={a.detail}>{a.detail}</span> : null}
                <span className={s.histActTime}>{when(a.createdAt)}</span>
              </div>
            ))}
          </>
        )}
      </div>
    </div>
    {selectedSnapshot && <RestorePreviewDialog preview={preview} loading={loadingPreview} busy={restoring} error={previewError}
      onCancel={cancelPreview} onRefresh={() => void showPreview(selectedSnapshot)} onConfirm={() => void confirm()} />}
  </>;
}
