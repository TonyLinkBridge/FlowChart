'use client';

import { schedule, isLate } from '@/lib/schedule';
import { nodeProgress, remainingDays, workNodes, type FlowDoc } from '@/lib/types';
import s from './Timeline.module.css';

const LABEL_W = 150;

export function TimelineView({ doc, onSelect }: { doc: FlowDoc; onSelect?: (id: string) => void }) {
  const { slots, total, today } = schedule(doc);
  const rows = workNodes(doc);
  const left = remainingDays(doc);

  const pct = (d: number) => `${(d / total) * 100}%`;
  // 刻度：天数少就一天一格，多了就两天一格，别把标尺挤爆
  const step = total <= 10 ? 1 : Math.ceil(total / 8);
  // 刻度标的是每天的开头：第 0 天 = D1，所以最后一格是 total-1，不是 total
  const ticks = Array.from({ length: Math.floor((total - 1) / step) + 1 }, (_, i) => i * step);

  return (
    <div className={s.wrap} style={{ ['--label-w' as string]: `${LABEL_W}px` }}>
      <div className={s.head}>
        <div style={{ display: 'flex', alignItems: 'baseline', gap: 5 }}>
          <span className={s.bigNum}>{total}</span>
          <span className={s.unit}>天</span>
        </div>
        <div className={s.headMeta}>
          <div>今天在 D{Math.max(1, Math.ceil(today))} · 还需 {left} 天</div>
          <div>排期沿流程正向计算，分支合并处取最晚的一条</div>
        </div>
      </div>

      <div className={s.grid}>
        <div className={s.ruler}>
          {ticks.map((d, i) => (
            <span key={d} className={s.tick}
                  style={{ width: i === ticks.length - 1 ? 'auto' : pct(step) }}>D{d + 1}</span>
          ))}
        </div>

        {today > 0 && (
          <>
            <div className={s.todayLine} style={{ left: `calc(${LABEL_W}px + (100% - ${LABEL_W}px) * ${today / total})` }} />
            <div className={s.todayTag} style={{ left: `calc(${LABEL_W}px + (100% - ${LABEL_W}px) * ${today / total})` }}>
              TODAY · D{Math.max(1, Math.ceil(today))}
            </div>
          </>
        )}

        {rows.map(n => {
          const slot = slots.get(n.id)!;
          const p = nodeProgress(n);
          const late = isLate(doc, n.id, slot, today);
          const state = p === 1 ? 'done' : p > 0 ? 'part' : 'todo';

          const barCls = [
            s.bar,
            late ? s.barLate : state === 'done' ? s.barDone : state === 'part' ? s.barPart : s.barTodo,
          ].join(' ');

          return (
            <div key={n.id} className={s.row} onClick={() => onSelect?.(n.id)}>
              <span className={`${s.label} ${state === 'done' ? s.labelDone : ''} ${state === 'part' ? s.labelCurrent : ''}`}>
                {n.title}
              </span>
              <div className={s.lane}>
                <div className={barCls} style={{ left: pct(slot.start), width: pct(slot.days) }}>
                  {(state === 'part' || late) && <div className={s.barFill} style={{ width: `${p * 100}%` }} />}
                </div>
                <span className={s.range} style={{ left: `calc(${pct(slot.start + slot.days)} + 10px)`, display: 'flex', alignItems: 'center', gap: 8 }}>
                  {late && <span className={s.lateTag}>卡住</span>}
                  D{slot.start + 1}–D{slot.end} · {n.owner}
                </span>
              </div>
            </div>
          );
        })}
      </div>

      <div className={s.foot}>
        条上的进度跟清单、流程图是同一份数据 —— 在任何一个视图里打勾，这里都会跟着走。<br />
        计划完工日已经过了、活还没干完的，会标成「卡住」。
      </div>
    </div>
  );
}
