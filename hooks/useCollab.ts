'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import type { RealtimeChannel } from '@supabase/supabase-js';
import { peerColor, realtimeClient } from '@/lib/realtime';

/** 同一张图的一个在线同事。x/y 是画布世界坐标 —— 各自按自己的缩放换算屏幕位置。 */
export interface Mate {
  key: string;
  name: string;
  color: string;
  x?: number;
  y?: number;
  ts?: number;
}

/** 一张流程图一个频道：presence 记谁在线，broadcast 传光标和「我存了第 N 版」。
 *  频道不碰数据库 —— 数据可靠性靠版本号防覆盖，这里只负责「感觉到对方」。 */
export function useCollab(
  flowId: string | null,
  me: { id: string; name: string },
  onPeerSaved: (version: number, byName: string) => void,
) {
  const [mates, setMates] = useState<Mate[]>([]);
  const chanRef = useRef<RealtimeChannel | null>(null);
  const savedRef = useRef(onPeerSaved);
  savedRef.current = onPeerSaved;

  useEffect(() => {
    const sb = realtimeClient();
    if (!sb || !flowId || !me.id) { setMates([]); return; }

    const chan = sb.channel(`flow:${flowId}`, {
      config: { presence: { key: me.id }, broadcast: { self: false } },
    });

    chan.on('presence', { event: 'sync' }, () => {
      const state = chan.presenceState<{ name: string }>();
      setMates(cur => Object.entries(state)
        .filter(([k]) => k !== me.id)
        .map(([k, metas]) => {
          const old = cur.find(m => m.key === k);
          return { key: k, name: metas[0]?.name ?? '同事', color: peerColor(k), x: old?.x, y: old?.y, ts: old?.ts };
        }));
    });
    chan.on('broadcast', { event: 'cursor' }, ({ payload }) => {
      setMates(ms => ms.map(m => m.key === payload.u ? { ...m, x: payload.x, y: payload.y, ts: Date.now() } : m));
    });
    chan.on('broadcast', { event: 'saved' }, ({ payload }) => {
      savedRef.current(payload.v, payload.name ?? '同事');
    });
    chan.subscribe(status => {
      if (status === 'SUBSCRIBED') chan.track({ name: me.name });
    });
    chanRef.current = chan;
    return () => { sb.removeChannel(chan); chanRef.current = null; setMates([]); };
  }, [flowId, me.id, me.name]);

  const meIdRef = useRef(me.id);
  meIdRef.current = me.id;

  /** 光标节流到 ~16/秒 —— 再密就是白烧流量。 */
  const lastSent = useRef(0);
  const sendCursor = useCallback((x: number, y: number) => {
    const now = Date.now();
    if (now - lastSent.current < 60) return;
    lastSent.current = now;
    chanRef.current?.send({ type: 'broadcast', event: 'cursor', payload: { u: meIdRef.current, x, y } })
      ?.catch(() => {});
  }, []);

  const announceSaved = useCallback((v: number, name: string) => {
    chanRef.current?.send({ type: 'broadcast', event: 'saved', payload: { v, name } })?.catch(() => {});
  }, []);

  return { mates, sendCursor, announceSaved };
}
