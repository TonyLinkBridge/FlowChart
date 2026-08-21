'use client';

import { useState } from 'react';
import type { Folder, StoredDoc, Workspace } from '@/lib/store';
import s from './Sidebar.module.css';

/** 左侧栏：你存过的所有流程图，按你自己建的分堆归类。
 *  「新建」从此是往列表里加一张，不再是把当前这张覆盖掉。 */
export function Sidebar({
  ws, open, onPick, onNew, onRename, onDelete, onMove, onNewFolder, onRenameFolder, onDropFolder,
}: {
  ws: Workspace;
  open: boolean;
  onPick: (id: string) => void;
  onNew: (folderId: string | null) => void;
  onRename: (id: string, title: string) => void;
  onDelete: (id: string) => void;
  onMove: (id: string, folderId: string | null) => void;
  onNewFolder: () => void;
  onRenameFolder: (id: string, name: string) => void;
  onDropFolder: (id: string) => void;
}) {
  const [editing, setEditing] = useState<string | null>(null);
  if (!open) return <aside className={`${s.rail} ${s.railHidden}`} />;

  const inFolder = (fid: string | null) => ws.docs.filter(d => d.folderId === fid);

  const Row = (d: StoredDoc) => (
    <div key={d.id} className={`${s.row} ${d.id === ws.currentId ? s.rowOn : ''}`} onClick={() => onPick(d.id)}>
      <span className={s.dot} />
      <input
        className={s.name}
        value={d.doc.title}
        readOnly={editing !== d.id}
        onDoubleClick={e => { e.stopPropagation(); setEditing(d.id); (e.target as HTMLInputElement).select(); }}
        onChange={e => onRename(d.id, e.target.value)}
        onBlur={() => setEditing(null)}
        onKeyDown={e => { if (e.key === 'Enter') (e.target as HTMLInputElement).blur(); }}
        onClick={e => { if (editing === d.id) e.stopPropagation(); }}
      />
      <span className={s.meta}>{d.doc.nodes.length}</span>
      <span className={s.tools} onClick={e => e.stopPropagation()}>
        <select className={s.move} value={d.folderId ?? ''} title="移到分组"
                onChange={e => onMove(d.id, e.target.value || null)}>
          <option value="">未分组</option>
          {ws.folders.map(f => <option key={f.id} value={f.id}>{f.name}</option>)}
        </select>
        <button className={s.tool} title="删除" onClick={() => onDelete(d.id)}>×</button>
      </span>
    </div>
  );

  const Group = (f: Folder | null) => {
    const docs = inFolder(f?.id ?? null);
    if (!f && !docs.length) return null;
    return (
      <div key={f?.id ?? 'none'}>
        <div className={s.group}>
          {f ? (
            <>
              <input className={s.groupName} value={f.name}
                     onChange={e => onRenameFolder(f.id, e.target.value)} />
              <button className={s.groupDrop} title="新建到这个分组" onClick={() => onNew(f.id)}>＋</button>
              <button className={s.groupDrop} title="删掉分组（图不会删）" onClick={() => onDropFolder(f.id)}>×</button>
            </>
          ) : (
            <span className={s.groupName}>未分组</span>
          )}
        </div>
        {docs.length ? docs.map(Row) : <div className={s.empty}>这个分组还是空的</div>}
      </div>
    );
  };

  return (
    <aside className={s.rail}>
      <div className={s.head}>
        <span className={s.brand}>Runflow</span>
        <button className={s.headBtn} title="新建流程图" onClick={() => onNew(null)}>＋</button>
        <button className={s.headBtn} title="新建分组" onClick={onNewFolder} style={{ fontSize: 11 }}>分组＋</button>
      </div>
      <div className={s.list}>
        {ws.folders.map(f => Group(f))}
        {Group(null)}
      </div>
    </aside>
  );
}
