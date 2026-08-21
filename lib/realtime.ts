import { createClient, type SupabaseClient } from '@supabase/supabase-js';

/** 实时通道用的 Supabase 客户端（anon key）。
 *  它读不到任何表 —— RLS 是拒绝一切的，数据照旧全走 /api。
 *  这个客户端只用来进「频道」：谁在线、光标在哪、谁刚保存了。
 *  频道名带流程图的 uuid（128 位随机数），拿不到 uuid 的人进不来。
 *  没配 key 时返回 null，所有协同功能静默降级成单人模式。 */
let cached: SupabaseClient | null | undefined;

export function realtimeClient(): SupabaseClient | null {
  if (cached !== undefined) return cached;
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  cached = url && key
    ? createClient(url, key, { realtime: { params: { eventsPerSecond: 20 } } })
    : null;
  return cached;
}

/** 给每个同事一个稳定的颜色 —— 按 userId 哈希，不用协商。 */
const PEER_COLORS = ['#9A6B12', '#1F3A5F', '#B4322F', '#3D5A46', '#6B4B8A', '#0F6B6B'];
export function peerColor(userId: string): string {
  let h = 0;
  for (const ch of userId) h = (h * 31 + ch.charCodeAt(0)) >>> 0;
  return PEER_COLORS[h % PEER_COLORS.length];
}
