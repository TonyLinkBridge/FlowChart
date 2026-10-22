'use client';

import { useEffect, useMemo, useState } from 'react';
import { History } from 'lucide-react';
import { Timeline, type TimelineEvent } from '@/components/arc/timeline/timeline';
import type { ActivityEntry } from '@/lib/store';
import s from './ActivityTimeline.module.css';

const ACTION_TEXT: Record<string, string> = {
  create: '创建了流程', update: '更新了流程', delete: '删除了流程',
  restore: '恢复了版本', snapshot: '保存了存档', move: '移动了流程',
};

/** Display adapter only: no requests, history writes, or restore callbacks. */
export function ActivityTimeline({ activity }: { activity: ActivityEntry[] }) {
  const [now, setNow] = useState(Date.now);
  useEffect(() => {
    const timer = window.setInterval(() => setNow(Date.now()), 60_000);
    return () => window.clearInterval(timer);
  }, []);

  const events = useMemo<TimelineEvent[]>(() => {
    const occurrences = new Map<string, number>();
    return activity.map(entry => {
      // The existing API has no activity ID. Full identity + occurrence keeps duplicate records
      // and avoids shifting open details when an unrelated record is inserted at the top.
      const identity = JSON.stringify([entry.createdAt, entry.action, entry.actorName, entry.detail]);
      const occurrence = occurrences.get(identity) ?? 0;
      occurrences.set(identity, occurrence + 1);
      return {
        id: `${identity}:${occurrence}`, at: entry.createdAt, actor: entry.actorName ?? '有人',
        title: ACTION_TEXT[entry.action] ?? entry.action,
        meta: entry.detail ? entry.detail.length > 80 ? `${entry.detail.slice(0, 80)}…` : entry.detail : undefined,
        detail: entry.detail ? <div className={s.detail}>{entry.detail}</div> : undefined,
        icon: <History aria-hidden="true" />,
      };
    });
  }, [activity]);

  return <div className={s.wrap} data-pop onKeyDown={event => event.stopPropagation()}>
    <Timeline events={events} now={now} label="流程操作动态" locale="zh-CN" timeZone="Asia/Kuala_Lumpur"
      headingLevel={3} scrollToNew={false} />
  </div>;
}
