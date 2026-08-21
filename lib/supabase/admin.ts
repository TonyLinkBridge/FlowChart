import 'server-only';
import { createClient } from '@supabase/supabase-js';

/** 服务端专用的 Supabase 客户端。用 service_role 密钥，绕过所有行级权限。
 *
 *  顶上那句 import 'server-only' 是保险丝：一旦有人不小心在客户端组件里
 *  引了这个文件，构建会直接失败，而不是把密钥打进浏览器代码里。
 *
 *  「各人只看得到自己的」不再靠数据库策略，而是靠每个接口都先验 Clerk 身份、
 *  再用那个 userId 过滤 —— owner_id 一律由服务端填，绝不采信请求里传来的值。 */
export function admin() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) throw new Error('缺少 NEXT_PUBLIC_SUPABASE_URL 或 SUPABASE_SERVICE_ROLE_KEY');
  return createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });
}
