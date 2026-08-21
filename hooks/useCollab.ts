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
  sel?: string | null;   // 对方当前选中的节点
  ts?: number;
}

/** 同事正在拖动的节点：实时位置的「幽灵」。
 *  只盖在渲染上，绝不写进 doc —— 数据的对错交给版本号和三方合并，
 *  这里只负责让你「看见对方的手」。 */
export interface Ghost { id: string; x: number; y: number; color: string; name: string; ts: number }

/** 一张流程图一个频道：presence 记谁在线，broadcast 传光标 / 选中 / 拖动 / 「我存了第 N 版」。 */
export function useCollab(
  flowId: string | null,
  me: { id: string; name: string },
  onPeerSaved: (version: number, byName: string) => void,
) {
  const [mates, setMates] = useState<Mate[]>([]);
  const [ghosts, setGhosts] = useState<Record<string, Ghost>>({});
  const chanRef = useRef<RealtimeChannel | null>(null);
  const savedRef = useRef(onPeerSaved);
  savedRef.current = onPeerSaved;
  const meIdRef = useRef(me.id);
  meIdRef.current = me.id;

  useEffect(() => {
    const sb = realtimeClient();
    if (!sb || !flowId || !me.id) { setMates([]); setGhosts({}); return; }

    const chan = sb.channel(`flow:${flowId}`, {
      config: { presence: { key: me.id }, broadcast: { self: false } },
    });

    chan.on('presence', { event: 'sync' }, () => {
      const state = chan.presenceState<{ name: string }>();
      const alive = new Set(Object.keys(state));
      setMates(cur => Object.entries(state)
        .filter(([k]) => k !== me.id)
        .map(([k, metas]) => {
          const old = cur.find(m => m.key === k);
          return { key: k, name: metas[0]?.name ?? '同事', color: peerColor(k),
                   x: old?.x, y: old?.y, sel: old?.sel, ts: old?.ts };
        }));
      // 人走了，他的幽灵也散
      setGhosts(g => Object.fromEntries(Object.entries(g).filter(([k]) => alive.has(k))));
    });
    chan.on('broadcast', { event: 'cursor' }, ({ payload }) => {
      setMates(ms => ms.map(m => m.key === payload.u ? { ...m, x: payload.x, y: payload.y, ts: Date.now() } : m));
    });
    chan.on('broadcast', { event: 'sel' }, ({ payload }) => {
      setMates(ms => ms.map(m => m.key === payload.u ? { ...m, sel: payload.id ?? null } : m));
    });
    chan.on('broadcast', { event: 'drag' }, ({ payload }) => {
      setGhosts(g => ({ ...g, [payload.u]: {
        id: payload.id, x: payload.x, y: payload.y,
        color: peerColor(payload.u), name: payload.name ?? '同事', ts: Date.now(),
      } }));
    });
    chan.on('broadcast', { event: 'dragend' }, ({ payload }) => {
      setGhosts(g => { const { [payload.u as string]: _gone, ...rest } = g; return rest; });
    });
    chan.on('broadcast', { event: 'saved' }, ({ payload }) => {
      setGhosts({});   // 权威版本要来了，幽灵退场
      savedRef.current(payload.v, payload.name ?? '同事');
    });
    chan.subscribe(status => {
      if (status === 'SUBSCRIBED') chan.track({ name: me.name });
    });
    chanRef.current = chan;

    // 拖到一半断线的幽灵，5 秒没动静就清掉
    const sweeper = setInterval(() => {
      setGhosts(g => {
        const now = Date.now();
        const kept = Object.entries(g).filter(([, v]) => now - v.ts < 5000);
        return kept.length === Object.keys(g).length ? g : Object.fromEntries(kept);
      });
    }, 3000);

    return () => {
      clearInterval(sweeper);
      sb.removeChannel(chan);
      chanRef.current = null;
      setMates([]); setGhosts({});
    };
  }, [flowId, me.id, me.name]);

  /** 光标节流 ~16/秒；拖动节流 ~12/秒 —— 频道有每秒事件数上限，别烧光。 */
  const lastCursor = useRef(0);
  const sendCursor = useCallback((x: number, y: number) => {
    const now = Date.now();
    if (now - lastCursor.current < 60) return;
    lastCursor.current = now;
    chanRef.current?.send({ type: 'broadcast', event: 'cursor', payload: { u: meIdRef.current, x, y } })
      ?.catch(() => {});
  }, []);

  const lastDrag = useRef(0);
  const meNameRef = useRef(me.name);
  meNameRef.current = me.name;
  const sendDrag = useCallback((id: string, x: number, y: number) => {
    const now = Date.now();
    if (now - lastDrag.current < 80) return;
    lastDrag.current = now;
    chanRef.current?.send({ type: 'broadcast', event: 'drag',
      payload: { u: meIdRef.current, name: meNameRef.current, id, x, y } })?.catch(() => {});
  }, []);
  const sendDragEnd = useCallback(() => {
    chanRef.current?.send({ type: 'broadcast', event: 'dragend', payload: { u: meIdRef.current } })
      ?.catch(() => {});
  }, []);

  const sendSel = useCallback((id: string | null) => {
    chanRef.current?.send({ type: 'broadcast', event: 'sel', payload: { u: meIdRef.current, id } })
      ?.catch(() => {});
  }, []);

  const announceSaved = useCallback((v: number, name: string) => {
    chanRef.current?.send({ type: 'broadcast', event: 'saved', payload: { v, name } })?.catch(() => {});
  }, []);

  return { mates, ghosts, sendCursor, sendDrag, sendDragEnd, sendSel, announceSaved };
}
