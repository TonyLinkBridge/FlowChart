import { createBrowserClient } from '@supabase/ssr';
import type { SupabaseClient } from '@supabase/supabase-js';

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

/** 配置齐了没。缺 key 时不该白屏，应该明确告诉人「去填 .env.local」。 */
export const supabaseReady = Boolean(url && key);

let cached: SupabaseClient | null = null;

export function getSupabase(): SupabaseClient | null {
  if (!supabaseReady) return null;
  cached ??= createBrowserClient(url!, key!);
  return cached;
}
