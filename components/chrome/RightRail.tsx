'use client';

import { NotePanel } from '@/components/views/NotePanel';
import { EdgePanel } from '@/components/views/EdgePanel';
import type { FlowDoc, FlowEdge, FlowNode } from '@/lib/types';
import s from './Chrome.module.css';

/** 右栏 = 检查器。选中节点就改节点，选中连线就改连线。
 *  附注不在这里读也不在这里改 —— 鼠标移到节点上直接看，那条路更短。
 *  这里只留一个「写附注」的入口，因为没附注的节点不会弹气泡。 */
export function RightRail({
  doc, noteId, onClearSelection, onPatch, onDelete, onAddAfter, onCreateNote,
  edgeIndex, onPatchEdge, onDeleteEdge, onCloseEdge,
}: {
  doc: FlowDoc;
  noteId: string | null;
  onClearSelection: () => void;
  onPatch: (nodeId: string, patch: Partial<FlowNode>) => void;
  onDelete: (nodeId: string) => void;
  onAddAfter: (nodeId: string) => void;
  onCreateNote: (nodeId: string) => void;
  edgeIndex: number | null;
  onPatchEdge: (i: number, p: Partial<FlowEdge>) => void;
  onDeleteEdge: (i: number) => void;
  onCloseEdge: () => void;
}) {
  return (
    <aside className={s.rail}>
      {edgeIndex !== null ? (
        <EdgePanel doc={doc} index={edgeIndex} onPatch={onPatchEdge}
                   onDelete={onDeleteEdge} onClose={onCloseEdge} />
      ) : (
        <NotePanel
          doc={doc}
          nodeId={noteId}
          onClose={onClearSelection}
          onPatch={onPatch}
          onDelete={onDelete}
          onAddAfter={onAddAfter}
          onCreateNote={onCreateNote}
        />
      )}
    </aside>
  );
}
