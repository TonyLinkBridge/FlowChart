import { admin } from '@/lib/supabase/admin';
import { bad, readJson } from '@/lib/api/guard';
import { checkpoint, flowAccess, getScope, logActivity } from '@/lib/api/team';
import type { FlowDoc } from '@/lib/types';

/** 恢复到某个历史版本。不覆盖历史 —— 恢复的结果本身成为一个新版本，
 *  所以「恢复错了」也能再恢复回去，什么都不会真的丢。 */
export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const scope = await getScope();
  if (!scope) return bad('未登录', 401);
  const { id } = await params;
  const access = await flowAccess(id, scope);
  if (!access) return bad('流程不存在', 404);

  const body = await readJson(req);
  const target = typeof body?.version === 'number' ? body.version : null;
  if (target === null) return bad('要恢复到第几版？');

  const { data: snap, error: e1 } = await admin().from('flow_versions')
    .select('doc').eq('flow_id', id).eq('version', target)
    .order('created_at', { ascending: false }).limit(1).maybeSingle();
  if (e1) return bad(e1.message, 500);
  if (!snap) return bad(`没有 V${target} 这个版本`, 404);

  const newVersion = access.row.version + 1;
  const { data, error } = await admin().from('flows')
    .update({ doc: snap.doc, version: newVersion, title: (snap.doc as { title?: string }).title ?? access.row.title, updated_by: scope.userId })
    .eq('id', id).eq('version', access.row.version).select('version');
  if (error) return bad(error.message, 500);
  if (!data?.length) return bad('有人正在保存这张图，稍等两秒再试', 409);

  await checkpoint(id, newVersion, snap.doc as FlowDoc, scope.userId, { force: true, note: `恢复自 V${target}` });
  await logActivity({ flowId: id, orgId: access.row.org_id, actor: scope.userId, action: 'restore', detail: `V${target} → V${newVersion}` });
  return Response.json({ doc: snap.doc, version: newVersion });
}
