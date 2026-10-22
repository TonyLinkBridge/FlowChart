'use client';

import { useState } from 'react';
import { Pagination } from '@/components/arc/pagination/pagination';
import type { FlowVersion } from '@/lib/store';
import s from './Chrome.module.css';
import paging from './VersionSnapshotList.module.css';

const PAGE_SIZE = 10;
const when = (time: number) => new Date(time).toLocaleString('zh-CN', {
  year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit',
});

/** Pages only the snapshots already fetched by VersionsPanel; it does not fetch or restore anything. */
export function VersionSnapshotList({ versions, currentVersion, restoring, onPreview }: {
  versions: FlowVersion[];
  currentVersion: number;
  restoring: boolean;
  onPreview: (snapshotId: string) => void;
}) {
  const [requestedPage, setRequestedPage] = useState(1);
  const pageCount = Math.ceil(versions.length / PAGE_SIZE);
  const page = Math.min(requestedPage, Math.max(1, pageCount));
  const start = (page - 1) * PAGE_SIZE;
  const end = Math.min(start + PAGE_SIZE, versions.length);
  if (!versions.length) return null;

  return <>
    {versions.slice(start, end).map(v => (
      <div key={v.id} className={s.histRow}>
        <span className={s.histVer}>V{v.version}</span>
        <span className={s.histMeta}>
          {v.savedName ?? '同事'} · {when(v.createdAt)}
          {v.note ? <span className={s.histNoteText}> · {v.note}</span> : null}
        </span>
        {v.version === currentVersion && <span className={s.histNow}>当前版本号</span>}
        <button type="button" className={s.histRestore} onClick={() => onPreview(v.id)} disabled={restoring}>查看差异</button>
      </div>
    ))}
    <div className={paging.paging} data-pop onKeyDown={event => event.stopPropagation()}>
      <p className={paging.range} role="status">显示第 {start + 1}–{end} 份 · 已读取最近 {versions.length} 份存档</p>
      {pageCount > 1 && <Pagination page={page} pageCount={pageCount} onPageChange={setRequestedPage} label="存档分页" />}
    </div>
    <p className={s.histEmpty}>先查看差异，确认后才会恢复。更早的存档不在本次读取范围。</p>
  </>;
}
