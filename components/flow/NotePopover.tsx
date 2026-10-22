'use client';

import { Fragment } from 'react';
import { NoteSections } from '@/components/views/NoteSections';
import { Drawer, DrawerClose, DrawerContent, DrawerTrigger } from '@/components/arc/drawer/drawer';
import type { FlowNode, Note } from '@/lib/types';
import s from './NotePopover.module.css';

const POP_W = 320, GAP = 14;

function inline(text: string) {
  return text.split(/(\*\*[^*]+\*\*|`[^`]+`)/g).map((part, i) => {
    if (part.startsWith('**') && part.endsWith('**'))
      return <b key={i} style={{ fontWeight: 600, color: 'var(--rf-ink)' }}>{part.slice(2, -2)}</b>;
    if (part.startsWith('`') && part.endsWith('`')) return <code key={i}>{part.slice(1, -1)}</code>;
    return <Fragment key={i}>{part}</Fragment>;
  });
}

/** 折起来那几样压成一行灰字：「4 步 · 2/5 · 2 个填空 · 1 个链接」 */
function summarize(note: Note) {
  const out: React.ReactNode[] = [];
  const steps = note.steps ?? [];
  if (steps.length) {
    const done = steps.filter(x => x.done).length;
    out.push(<span key="s">{steps.length} 步 · <b>{done}/{steps.length}</b></span>);
  }
  if (note.fields?.length) out.push(<span key="f">{note.fields.length} 个填空</span>);
  if (note.links?.length) out.push(<span key="l">{note.links.length} 个链接</span>);
  if (note.contact?.trim()) out.push(<span key="c">有联系人</span>);
  if (note.text?.trim()) out.push(<span key="t">有说明</span>);
  return out;
}

export function NotePopover({
  node, index, x, y, nodeWpx = 260, canvasW, pinned, expanded,
  onPin, onEnter, onLeave, onClose, onToggleExpand, onChange, onToggleStep,
}: {
  node: FlowNode;
  index: number;
  x: number; y: number;          // 节点左上角的屏幕坐标（缩放已换算）
  nodeWpx?: number;              // 节点在屏幕上的宽度（随缩放变）
  canvasW: number;
  pinned: boolean;
  expanded: boolean;
  onPin: () => void;
  onEnter: () => void;
  onLeave: () => void;
  onClose: () => void;
  onToggleExpand: () => void;
  onChange: (n: Note | undefined) => void;
  onToggleStep?: (index: number) => void;
}) {
  const note = node.note;
  if (!note) return null;

  // 默认贴右边；右边放不下就翻到左边
  const right = x + nodeWpx + GAP;
  const flip = canvasW > 0 && right + POP_W > canvasW - 8;
  const left = flip ? Math.max(8, x - POP_W - GAP) : right;

  const bits = summarize(note);
  const hasText = !!note.text?.trim();
  const firstTodo = note.steps?.find(st => !st.done)?.text;

  return (
    <Drawer key={node.id} open={expanded} onOpenChange={next => {
      if (next === expanded) return;
      if (next && !pinned) onPin();
      else onToggleExpand();
    }}>
    <div data-pop className={`${s.pop} ${pinned ? s.pinned : ''}`}
         style={{ left, top: y, cursor: pinned ? undefined : 'pointer' }}
         onMouseEnter={onEnter} onMouseLeave={onLeave}
         onClick={() => { if (!pinned) onPin(); }}>
      <div className={s.head}>
        <span className={s.idx}>{String(index).padStart(2, '0')}</span>
        <span className={s.who}>{node.title}</span>
        {pinned ? (
          <button className={s.close} onClick={onClose} aria-label="关闭">
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor"
                 strokeWidth="1.8" strokeLinecap="round"><path d="M6 6l12 12M18 6L6 18" /></svg>
          </button>
        ) : (
          <span className={s.pinHint}>点一下 · 钉住并编辑</span>
        )}
      </div>

        <div className={s.body}>
          {hasText ? inline(note.text!)
            : firstTodo ? (
              <span className={s.fallback}>
                <span className={s.fallbackLabel}>下一步要做</span>{firstTodo}
              </span>
            ) : <span className={s.fallback}>这条附注还没写说明。</span>}
        </div>

        <div className={s.summary}>
          {bits.map((b, i) => <Fragment key={i}>{i > 0 && <span>·</span>}{b}</Fragment>)}
          {!bits.length && <span>还没写内容</span>}
          <DrawerTrigger asChild>
            <button type="button" className={s.more} onClick={event => event.stopPropagation()}>展开</button>
          </DrawerTrigger>
        </div>
    </div>
    <DrawerContent data-pop overlayProps={{ 'data-pop': true }} aria-modal="true" side="right" className={s.noteDrawer}
      title={`附注 ${String(index).padStart(2, '0')} · ${node.title}`}
      description="附注／邮件模板 · 编辑沿用原有自动保存，关闭不会撤销已输入内容。"
      onKeyDown={event => event.stopPropagation()}
      onPaste={event => event.stopPropagation()}>
      <NoteSections note={note} onChange={onChange} onRemoveNote={() => onChange(undefined)} onToggleStep={onToggleStep} collapsible />
      <div className={s.drawerFoot}>
        <DrawerClose asChild><button type="button" className={s.drawerClose}>收起，返回预览</button></DrawerClose>
      </div>
    </DrawerContent>
    </Drawer>
  );
}
