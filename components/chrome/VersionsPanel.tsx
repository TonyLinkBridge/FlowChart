'use client';

import { useCallback, useEffect, useState } from 'react';
import { fetchHistory, snapshotVersion, type ActivityEntry, type FlowVersion } from '@/lib/store';
import s from './Chrome.module.css';

/** 版本历史 + 动态。恢复只增不减 —— 恢复错了再恢复回去就是。 */

const when = (t: number) => {
  const d = new Date(t);
  const mm = String(d.getMonth() + 1).padStart(2, '0'), dd = String(d.getDate()).padStart(2, '0');
  const hh = String(d.getHours()).padStart(2, '0'), mi = String(d.getMinutes()).padStart(2, '0');
  return `${mm}-${dd} ${hh}:${mi}`;
};

const ACTION_TEXT: Record<string, string> = {
  create: '创建了流程', update: '更新了流程', delete: '删除了流程',
  restore: '恢复了版本', snapshot: '手动存档',
};

export function VersionsPanel({ flowId, currentVersion, onClose, onRestore }: {
  flowId: string;
  currentVersion: number;
  onClose: () => void;
  onRestore: (version: number) => void;
}) {
  const [versions, setVersions] = useState<FlowVersion[] | null>(null);
  const [activity, setActivity] = useState<ActivityEntry[]>([]);
  const [note, setNote] = useState('');
  const [busy, setBusy] = useState(false);

  const load = useCallback(() => {
    fetchHistory(flowId)
      .then(h => { setVersions(h.versions); setActivity(h.activity); })
      .catch(() => { setVersions([]); setActivity([]); });
  }, [flowId]);
  useEffect(load, [load, currentVersion]);

  const snapshot = () => {
    setBusy(true);
    snapshotVersion(flowId, note.trim() || undefined)
      .then(() => { setNote(''); load(); })
      .finally(() => setBusy(false));
  };

  return (
    <div className={s.histFloat} data-pop>
      <div className={s.histHead}>
        <span className={s.histTitle}>版本历史</span>
        <button className={s.histClose} onClick={onClose} aria-label="关闭">×</button>
      </div>

      <div className={s.histSnapRow}>
        <input className={s.histNote} value={note} placeholder="备注（可不填）"
               maxLength={200}
               onChange={e => setNote(e.target.value)}
               onKeyDown={e => { if (e.key === 'Enter' && !busy) snapshot(); }} />
        <button className={s.histSnapBtn} onClick={snapshot} disabled={busy}>存一版</button>
      </div>

      <div className={s.histBody}>
        {versions === null ? (
          <div className={s.histEmpty}>翻档案中…</div>
        ) : versions.length === 0 ? (
          <div className={s.histEmpty}>还没有存档 —— 编辑一会儿会自动落第一版</div>
        ) : versions.map(v => (
          <div key={`${v.version}-${v.createdAt}`} className={s.histRow}>
            <span className={s.histVer}>V{v.version}</span>
            <span className={s.histMeta}>
              {v.savedName ?? '同事'} · {when(v.createdAt)}
              {v.note ? <span className={s.histNoteText}> · {v.note}</span> : null}
            </span>
            {v.version === currentVersion
              ? <span className={s.histNow}>当前</span>
              : <button className={s.histRestore} onClick={() => onRestore(v.version)}>恢复</button>}
          </div>
        ))}

        {activity.length > 0 && (
          <>
            <div className={s.histSection}>动态</div>
            {activity.map((a, i) => (
              <div key={i} className={s.histAct}>
                <span>{a.actorName ?? '有人'} {ACTION_TEXT[a.action] ?? a.action}</span>
                {a.detail ? <span className={s.histActDetail}>{a.detail}</span> : null}
                <span className={s.histActTime}>{when(a.createdAt)}</span>
              </div>
            ))}
          </>
        )}
      </div>
    </div>
  );
}
