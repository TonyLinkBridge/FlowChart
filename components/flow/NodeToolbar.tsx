'use client';

import { useEffect, useRef, useState, type KeyboardEvent } from 'react';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/arc/popover/popover';
import { Tooltip } from '@/components/arc/tooltip/tooltip';
import type { FlowNode, NodeStyle, Shape } from '@/lib/types';
import s from './NodeToolbar.module.css';

/** 选中节点头顶的快捷工具条（boardmix 的交互，Runflow 的皮）。
 *  只管「快速调外观」：形状、填充、边框、文字、附注、连线、锁定。
 *  负责人 / 工期 / 子步骤这类资料继续走右侧检查器，两边不混。 */

const PRESETS = ['#101010', '#FFFFFF', '#F4F2ED', '#E3DFD5', '#9A6B12', '#B4322F', '#1F3A5F', '#3D5A46'];

type Panel = 'shape' | 'fill' | 'border' | 'text' | 'more' | null;

/** 色票一排 + 任意取色 + 恢复默认。
 *  取色器拖动时事件是连发的，停 500ms 才提交 —— 不然一次挑色能塞满整个撤销栈。 */
function ColorField({ value, onPick, onClear, customLabel }: {
  value?: string; onPick: (c: string) => void; onClear: () => void; customLabel?: string;
}) {
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => () => { if (timer.current) clearTimeout(timer.current); }, []);
  return (
    <div className={s.colorField}>
      <div className={s.swatches}>
        {PRESETS.map(c => (
          <button key={c} className={`${s.swatch} ${value === c ? s.swatchOn : ''}`}
                  style={{ background: c }} onClick={() => onPick(c)} aria-label={c} title={c} />
        ))}
        <label className={s.customSwatch} title="任意颜色">
          <input
            type="color"
            aria-label={customLabel}
            value={value ?? '#101010'}
            onChange={e => {
              const c = e.currentTarget.value;
              if (timer.current) clearTimeout(timer.current);
              timer.current = setTimeout(() => onPick(c), 500);
            }}
          />
          <span>＋</span>
        </label>
      </div>
      <button className={s.clearBtn} onClick={onClear}>恢复默认</button>
    </div>
  );
}

function Lock({ on }: { on: boolean }) {
  return (
    <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2">
      <rect x="4" y="10.5" width="16" height="10.5" />
      {on ? <path d="M8 10.5V7a4 4 0 0 1 8 0v3.5" /> : <path d="M8 10.5V7a4 4 0 0 1 8 0" />}
    </svg>
  );
}

export function NodeToolbar({
  node, x, y, onShape, onStyle, onHref, onNote, onLink, onToggleLock, onToggleMute, onAddAfter, onDelete,
}: {
  node: FlowNode;
  /** 屏幕坐标：节点顶边中心（缩放平移都换算好了再传进来） */
  x: number; y: number;
  onShape: (shape: Shape | undefined) => void;
  onStyle: (patch: Partial<NodeStyle>, label: string) => void;
  onHref: (url: string | undefined) => void;
  onNote: () => void;
  onLink: () => void;
  onToggleLock: () => void;
  onToggleMute: () => void;
  onAddAfter: () => void;
  onDelete: () => void;
}) {
  const [open, setOpen] = useState<Panel>(null);
  const [hrefDraft, setHrefDraft] = useState(node.href ?? '');
  useEffect(() => { setHrefDraft(node.href ?? ''); }, [node.id, node.href]);
  const st = node.style;
  const shape = node.shape ?? 'process';
  const toggle = (p: Panel) => setOpen(cur => (cur === p ? null : p));
  const fillKeys = (event: KeyboardEvent<HTMLElement>) => {
    // Keep the existing canvas undo/redo route, but not Space-pan/Delete/paste shortcuts.
    const history = (event.metaKey || event.ctrlKey) && ['z', 'y'].includes(event.key.toLowerCase());
    if (!history) event.stopPropagation();
  };
  const hintKeys = (event: KeyboardEvent<HTMLButtonElement>) => {
    // Dismiss a hint or activate its button, not the canvas underneath it.
    // Radix handles Escape in native capture and may remove the ARIA link before React's handler.
    const dismissHint = event.key === 'Escape' && (event.defaultPrevented || event.currentTarget.hasAttribute('aria-describedby'));
    if (dismissHint || [' ', 'Delete', 'Backspace'].includes(event.key)) event.stopPropagation();
  };
  const hintKeyUp = (event: KeyboardEvent<HTMLButtonElement>) => {
    if (event.key === ' ') event.stopPropagation();
  };

  const applyHref = () => {
    const v = hrefDraft.trim();
    if (!v) { onHref(undefined); return; }
    onHref(/^https?:\/\//i.test(v) ? v : `https://${v}`);
  };

  return (
    <div className={s.bar} data-pop style={{ left: x, top: y }}>
      <div className={s.row}>
        <button className={`${s.btn} ${open === 'shape' ? s.btnOn : ''}`} onClick={() => toggle('shape')}>
          形状 <span className={s.caret}>▾</span>
        </button>
        <Popover open={open === 'fill'} onOpenChange={next => {
          if (next) setOpen('fill');
          else setOpen(current => current === 'fill' ? null : current);
        }}>
        <PopoverTrigger asChild>
        <button className={`${s.btn} ${open === 'fill' ? s.btnOn : ''}`} title="填充色"
          onKeyDown={fillKeys} onKeyUp={event => event.stopPropagation()}>
          <span className={s.fillDot} style={{ background: st?.fill ?? 'transparent' }}>
            {!st?.fill && <span className={s.none} />}
          </span>
          填充
        </button>
        </PopoverTrigger>
        <PopoverContent data-pop className={s.fillPanel} aria-label="填充色" side="bottom" align="start"
          inert={open !== 'fill'} aria-hidden={open !== 'fill' || undefined}
          onEscapeKeyDown={event => event.stopPropagation()}
          onKeyDown={fillKeys} onKeyUp={event => event.stopPropagation()}
          onPaste={event => event.stopPropagation()}>
          <ColorField value={st?.fill} customLabel="自定义填充色"
            onPick={c => onStyle({ fill: c }, '改了填充色')}
            onClear={() => onStyle({ fill: undefined }, '去掉了填充色')} />
        </PopoverContent>
        </Popover>
        <button className={`${s.btn} ${open === 'border' ? s.btnOn : ''}`} onClick={() => toggle('border')} title="边框">
          <span className={`${s.borderDot} ${st?.dashed ? s.borderDashed : ''}`}
                style={{ borderColor: st?.border ?? 'var(--rf-ink)' }} />
          边框
        </button>
        <Tooltip content="文字样式">
        <button type="button" className={`${s.btn} ${s.hintBtn} ${open === 'text' ? s.btnOn : ''}`}
          aria-label="文字样式" aria-expanded={open === 'text'} onClick={() => toggle('text')}
          onKeyDown={hintKeys} onKeyUp={hintKeyUp}>
          Aa <span className={s.caret}>▾</span>
        </button>
        </Tooltip>
        <span className={s.sep} />
        <button className={s.btn} onClick={onNote}>附注</button>
        <button className={s.btn} onClick={onLink}>连线</button>
        <Tooltip content={node.locked ? '解锁位置' : '锁定位置'}>
        <button type="button" className={`${s.btn} ${s.hintBtn} ${node.locked ? s.btnLive : ''}`} onClick={onToggleLock}
          aria-label={node.locked ? '解锁位置' : '锁定位置'} onKeyDown={hintKeys} onKeyUp={hintKeyUp}>
          <Lock on={!!node.locked} />
        </button>
        </Tooltip>
        <Tooltip content="更多节点操作">
        <button type="button" className={`${s.btn} ${s.hintBtn} ${open === 'more' ? s.btnOn : ''}`}
          aria-label="更多节点操作" aria-expanded={open === 'more'} onClick={() => toggle('more')}
          onKeyDown={hintKeys} onKeyUp={hintKeyUp}>⋯</button>
        </Tooltip>
      </div>

      {open === 'shape' && (
        <div className={s.panel}>
          {([['process', '步骤'], ['decision', '判断'], ['terminator', '起止']] as const).map(([v, label]) => (
            <button key={v} className={`${s.seg} ${shape === v ? s.segOn : ''}`}
                    onClick={() => { onShape(v === 'process' ? undefined : v); setOpen(null); }}>
              {label}
            </button>
          ))}
        </div>
      )}

      {open === 'border' && (
        <div className={s.panel}>
          <div className={s.segRow}>
            <button className={`${s.seg} ${!st?.dashed ? s.segOn : ''}`}
                    onClick={() => onStyle({ dashed: undefined }, '边框改成实线')}>实线</button>
            <button className={`${s.seg} ${st?.dashed ? s.segOn : ''}`}
                    onClick={() => onStyle({ dashed: true }, '边框改成虚线')}>虚线</button>
          </div>
          <ColorField value={st?.border}
                      onPick={c => onStyle({ border: c }, '改了边框色')}
                      onClear={() => onStyle({ border: undefined }, '去掉了边框色')} />
        </div>
      )}

      {open === 'text' && (
        <div className={s.panel}>
          <div className={s.segRow}>
            <button className={`${s.seg} ${st?.size === 's' ? s.segOn : ''}`}
                    onClick={() => onStyle({ size: st?.size === 's' ? undefined : 's' }, '字号调小')}>小</button>
            <button className={`${s.seg} ${!st?.size ? s.segOn : ''}`}
                    onClick={() => onStyle({ size: undefined }, '字号还原')}>中</button>
            <button className={`${s.seg} ${st?.size === 'l' ? s.segOn : ''}`}
                    onClick={() => onStyle({ size: st?.size === 'l' ? undefined : 'l' }, '字号调大')}>大</button>
            <span className={s.gap} />
            <button className={`${s.seg} ${s.b} ${st?.bold ? s.segOn : ''}`}
                    onClick={() => onStyle({ bold: st?.bold ? undefined : true }, st?.bold ? '取消加粗' : '加粗')}>B</button>
            <button className={`${s.seg} ${s.i} ${st?.italic ? s.segOn : ''}`}
                    onClick={() => onStyle({ italic: st?.italic ? undefined : true }, st?.italic ? '取消斜体' : '斜体')}>I</button>
            <button className={`${s.seg} ${s.u} ${st?.underline ? s.segOn : ''}`}
                    onClick={() => onStyle({ underline: st?.underline ? undefined : true }, st?.underline ? '取消下划线' : '下划线')}>U</button>
          </div>
          <ColorField value={st?.color}
                      onPick={c => onStyle({ color: c }, '改了文字颜色')}
                      onClear={() => onStyle({ color: undefined }, '文字颜色还原')} />
          <div className={s.hrefRow}>
            <input className={s.hrefInput} value={hrefDraft} placeholder="https://…"
                   onChange={e => setHrefDraft(e.target.value)}
                   onKeyDown={e => { if (e.key === 'Enter') applyHref(); }} />
            <button className={s.seg} onClick={applyHref}>挂链接</button>
            {node.href && <button className={s.seg} onClick={() => { setHrefDraft(''); onHref(undefined); }}>清除</button>}
          </div>
        </div>
      )}

      {open === 'more' && (
        <div className={s.panel}>
          <button className={s.menuBtn} onClick={() => { onToggleMute(); setOpen(null); }}>
            {node.muted ? '取消弱化' : '弱化（失败/终止分支）'}
          </button>
          <button className={s.menuBtn} onClick={() => { onAddAfter(); setOpen(null); }}>在后面接一步</button>
          <button className={`${s.menuBtn} ${s.danger}`} onClick={onDelete}>删除节点</button>
        </div>
      )}
    </div>
  );
}
