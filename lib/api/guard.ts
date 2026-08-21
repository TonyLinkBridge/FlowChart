import { admin } from '@/lib/supabase/admin';
import { parseDocValue } from '@/lib/io';
import type { FlowDoc } from '@/lib/types';

/** 接口层的三道闸：请求体是不是 JSON 对象、doc 像不像一张流程图、
 *  分组是不是这个人自己的。任何一道不过都是 400。 */

export const bad = (error: string, status = 400) => Response.json({ error }, { status });

/** 请求体解析。乱传东西（坏 JSON、数组、字符串）一律当没传。 */
export async function readJson(req: Request): Promise<Record<string, unknown> | null> {
  try {
    const v: unknown = await req.json();
    return v && typeof v === 'object' && !Array.isArray(v) ? (v as Record<string, unknown>) : null;
  } catch { return null; }
}

const MAX_DOC_BYTES = 1_000_000;

/** 服务端不信任何客户端：字段逐个过筛，筛完的才入库 ——
 *  库里永远只有干净数据，别人导出再导入也不会炸。
 *  allowEmpty：把节点删光是合法状态，自动保存不能因此失败。 */
export function checkDoc(raw: unknown): { ok: true; doc: FlowDoc } | { ok: false; error: string } {
  if (raw && JSON.stringify(raw).length > MAX_DOC_BYTES) return { ok: false, error: '流程图太大（超过 1MB）' };
  const parsed = parseDocValue(raw, { allowEmpty: true });
  if (!parsed.ok) return { ok: false, error: parsed.error };
  return { ok: true, doc: parsed.doc };
}

/** 挂分组前先确认分组是这个人的。少了这步，改个请求就能把图
 *  挂到别人的分组 id 底下 —— 看不见，但数据已经串了。 */
export async function ownsFolder(userId: string, folderId: string): Promise<boolean> {
  const { data, error } = await admin()
    .from('folders').select('id').eq('id', folderId).eq('owner_id', userId).maybeSingle();
  return !error && !!data;
}
