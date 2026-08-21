'use client';

import { docProgress, footnoteIndex, nodeProgress, remainingDays, workNodes, type FlowDoc } from '@/lib/types';
import s from './Checklist.module.css';

function Check({ small }: { small?: boolean }) {
  const d = small ? 7 : 9;
  return (
    <svg width={d} height={d} viewBox="0 0 24 24" fill="none" stroke="var(--rf-on-gold)"
         strokeWidth="3.6" strokeLinecap="round" strokeLinejoin="round">
      <path d="M5 12.5l4.5 4.5L19 7" />
    </svg>
  );
}

function Box({ state, small, onClick }: {
  state: 'done' | 'current' | 'todo'; small?: boolean; onClick: () => void;
}) {
  const size = small ? s.boxSm : s.boxLg;
  const look = state === 'done' ? s.boxDone : state === 'current' ? s.boxCurrent : s.boxTodo;
  return (
    <span className={`${s.box} ${size} ${look}`} role="checkbox" aria-checked={state === 'done'}
          onClick={e => { e.stopPropagation(); onClick(); }}>
      {state === 'done' ? <Check small={small} /> : state === 'current' ? <i /> : null}
    </span>
  );
}

/** 清单视图 —— 跟流程图同一份数据，换个读法。
 *  比流程图多干一件事：把附注里的「怎么做」铺出来，能逐条打勾。 */
export function ChecklistView({ doc, onToggleNode, onToggleStep }: {
  doc: FlowDoc;
  onToggleNode: (id: string) => void;
  onToggleStep: (nodeId: string, stepIndex: number) => void;
}) {
  const prog = docProgress(doc);
  const notes = footnoteIndex(doc);
  const rows = workNodes(doc);
  const left = remainingDays(doc);

  return (
    <div className={s.wrap}>
      <div className={s.summary}>
        <div style={{ display: 'flex', alignItems: 'baseline', gap: 4, flexShrink: 0 }}>
          <span className={s.bigNum}>{prog.done}</span>
          <span className={s.ofNum}>/{prog.total}</span>
        </div>
        <div style={{ flexGrow: 1, paddingBottom: 2 }}>
          <div className={s.track}>
            <div className={s.fill} style={{ width: `${Math.round(prog.ratio * 100)}%` }} />
          </div>
          <div className={s.caption}>
            <span>COMPLETED {Math.round(prog.ratio * 100)}%</span>
            <span>{left > 0 ? `还需 ${left} 天` : '全部完成'}</span>
          </div>
        </div>
      </div>

      {rows.length === 0 && <div className={s.empty}>这张图里还没有要干的活。</div>}

      {rows.map(n => {
        const p = nodeProgress(n);
        const state = p === 1 ? 'done' : p > 0 ? 'current' : 'todo';
        const steps = n.note?.steps;
        const doneCount = steps?.filter(st => st.done).length ?? 0;

        return (
          <div key={n.id}>
            <div className={`${s.row} ${state === 'current' ? s.rowCurrent : ''} ${state === 'done' ? s.rowDone : ''}`}>
              <Box state={state} onClick={() => onToggleNode(n.id)} />
              <span className={s.fn}>{notes.has(n.id) ? String(notes.get(n.id)).padStart(2, '0') : ''}</span>
              <span className={s.title}>{n.title}</span>
              {steps && <span className={s.stepCount}>{doneCount}/{steps.length}</span>}
              <span className={s.meta}>
                {n.owner}{n.days ? <> <span className={s.pipe}>|</span> {n.days}D</> : null}
              </span>
            </div>

            {steps && (
              <div className={s.steps}>
                {steps.map((st, i) => (
                  <div key={i} className={`${s.step} ${st.done ? s.stepDone : ''}`}>
                    <Box small state={st.done ? 'done' : 'todo'} onClick={() => onToggleStep(n.id, i)} />
                    <span className={s.stepIdx}>{i + 1}</span>
                    <span className={s.stepText}>{st.text}</span>
                  </div>
                ))}
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}
