'use client';

import { useElementSize } from '@/hooks/useElementSize';
import { depths } from '@/lib/graph';
import { nodeProgress, type FlowDoc, type FlowNode } from '@/lib/types';
import s from './Lanes.module.css';

const GUTTER = 68, COL_GAP = 20, LANE_H = 74, CHIP_H = 34;
/** 列距下限是量出来的：最长的步骤名「开通账号 · 领设备」连圆点带天数要 148px（含边框，实测出来的，不是推出来的）。
 *  低于这个字就变省略号 —— 一张读不出步骤名的泳道图没有意义，
 *  所以宁可横向滚动，也不压字。 */
const PITCH_MAX = 176, PITCH_MIN = 168;

const NO_OWNER = '—';
const laneY = (l: number) => l * LANE_H + (LANE_H - CHIP_H) / 2;


function chipClass(n: FlowNode) {
  if (n.shape === 'terminator') return `${s.chip} ${s.chipTerm}`;
  if (n.muted) return `${s.chip} ${s.chipMuted}`;
  const p = nodeProgress(n);
  return [s.chip, p === 1 && s.chipDone, p > 0 && p < 1 && s.chipCurrent]
    .filter(Boolean).join(' ');
}

/** 泳道 —— 按 owner 分道，横向按流程深度排列。
 *  跟时间条的区别：这里横轴是「第几步」，不是「第几天」，看的是交接给谁。 */
export function LanesView({ doc, onSelect }: { doc: FlowDoc; onSelect?: (id: string) => void }) {
  const [wrapRef, { w: avail }] = useElementSize<HTMLDivElement>(80); // 减掉左右 padding
  const col = depths(doc);

  // 泳道顺序：没负责人的（起止、判断）排最上面，其余按首次出现的先后
  const owners: string[] = [];
  for (const n of doc.nodes) {
    const o = n.owner ?? NO_OWNER;
    if (!owners.includes(o)) owners.push(o);
  }
  owners.sort((a, b) => (a === NO_OWNER ? -1 : b === NO_OWNER ? 1 : 0));
  const laneOf = (n: FlowNode) => owners.indexOf(n.owner ?? NO_OWNER);

  const ncols = Math.max(...[...col.values()]) + 1;
  // 有多少地方就摊多开，摊不开就退到最小列距（此时才需要横向滚动）
  const pitch = avail > 0
    ? Math.max(PITCH_MIN, Math.min(PITCH_MAX, (avail - GUTTER) / ncols))
    : PITCH_MAX;
  const CHIP_W = pitch - COL_GAP;
  const colX = (c: number) => GUTTER + c * pitch;
  const width = colX(ncols) - COL_GAP;
  const overflows = avail > 0 && width > avail;
  const height = owners.length * LANE_H;
  const byId = new Map(doc.nodes.map(n => [n.id, n]));

  const handoffs = doc.edges.filter(e => {
    const a = byId.get(e.source), b = byId.get(e.target);
    return a && b && (a.owner ?? NO_OWNER) !== (b.owner ?? NO_OWNER);
  }).length;

  return (
    <div className={s.wrap} ref={wrapRef}>
      <div className={s.head}>
        <div style={{ display: 'flex', alignItems: 'baseline', gap: 5 }}>
          <span className={s.bigNum}>{owners.filter(o => o !== NO_OWNER).length}</span>
          <span className={s.unit}>个部门</span>
        </div>
        <div className={s.headMeta}>
          <div>跨部门交接 {handoffs} 次 · 每次交接都是一个可能掉球的地方</div>
          <div>
            {overflows
              ? `共 ${ncols} 列，装不下 —— 可横向滚动`
              : '横轴是第几步，不是第几天 —— 想看工期去时间条'}
          </div>
        </div>
      </div>

      <div className={s.board} style={{ width, height }}>
        {owners.map((o, i) => (
          <div key={o} className={`${s.lane} ${i === 0 ? s.laneFirst : ''} ${i === owners.length - 1 ? s.laneLast : ''}`}
               style={{ top: i * LANE_H, height: LANE_H }}>
            <span className={s.laneName}>
              {o}{' '}
              <span className={s.laneCount}>
                {doc.nodes.filter(n => (n.owner ?? NO_OWNER) === o && n.shape !== 'terminator' && n.shape !== 'decision').length}
              </span>
            </span>
          </div>
        ))}

        <svg style={{ position: 'absolute', inset: 0, width, height, overflow: 'visible' }} fill="none">
          {doc.edges.map((e, i) => {
            const a = byId.get(e.source), b = byId.get(e.target);
            if (!a || !b) return null;
            const ax = colX(col.get(a.id)!) + CHIP_W, ay = laneY(laneOf(a)) + CHIP_H / 2;
            const bx = colX(col.get(b.id)!),          by = laneY(laneOf(b)) + CHIP_H / 2;
            const mid = ax + COL_GAP / 2;
            return (
              <path key={i} d={`M${ax} ${ay} H${mid} V${by} H${bx}`} strokeWidth="1"
                    stroke={e.dashed ? 'var(--rf-ink-4)' : 'var(--rf-ink)'}
                    strokeDasharray={e.dashed ? '4 4' : undefined} />
            );
          })}
        </svg>

        {doc.edges.filter(e => e.label).map((e, i) => {
          const a = byId.get(e.source), b = byId.get(e.target);
          if (!a || !b) return null;
          const ax = colX(col.get(a.id)!) + CHIP_W;
          const ay = laneY(laneOf(a)) + CHIP_H / 2, by = laneY(laneOf(b)) + CHIP_H / 2;
          return (
            <span key={i} className={s.edgeLabel}
                  style={{ left: ax + COL_GAP / 2, top: (ay + by) / 2, color: e.dashed ? 'var(--rf-ink-4)' : 'var(--rf-ink)' }}>
              {e.label}
            </span>
          );
        })}

        {doc.nodes.map(n => {
          const p = nodeProgress(n);
          const plain = n.shape !== 'terminator' && n.shape !== 'decision' && !n.muted;
          return (
            <div key={n.id} className={chipClass(n)} onClick={() => onSelect?.(n.id)}
                 style={{ left: colX(col.get(n.id)!), top: laneY(laneOf(n)), width: CHIP_W, height: CHIP_H }}>
              {plain && <span className={`${s.dot} ${p === 1 ? s.dotDone : p > 0 ? s.dotCurrent : s.dotTodo}`} />}
              <span className={s.label}>{n.title}</span>
              {n.days ? <span className={s.days}>{n.days}D</span> : null}
            </div>
          );
        })}
      </div>

      <div className={s.foot}>
        一行 = 一个部门。线跨行的地方就是交接，交接次数越多，流程越容易卡。<br />
        点任意一块，右下角的「已选中」会跟着变 —— 跟其他三个视图共用同一份数据。
      </div>
    </div>
  );
}
