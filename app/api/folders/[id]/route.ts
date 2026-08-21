import { admin } from '@/lib/supabase/admin';
import { bad, readJson } from '@/lib/api/guard';
import { getScope } from '@/lib/api/team';

/** 分组操作限定在当前空间：个人空间只碰自己的，Team 空间全员可管
 *  （分组是轻量的，删分组也不删图）。 */

export async function PATCH(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const scope = await getScope();
  if (!scope) return bad('未登录', 401);
  const { id } = await params;
  const body = await readJson(req);
  if (!body) return bad('请求体不是合法的 JSON 对象');
  const name = typeof body.name === 'string' ? body.name.trim().slice(0, 40) : '';
  if (!name) return bad('分组名不能为空');

  const q = admin().from('folders').update({ name }).eq('id', id);
  const { error } = await (scope.orgId
    ? q.eq('org_id', scope.orgId)
    : q.eq('owner_id', scope.userId).is('org_id', null));
  if (error) return bad(error.message, 500);
  return Response.json({ ok: true });
}

/** 删分组不删图 —— 表定义里 folder_id 是 on delete set null，图退回未分组。 */
export async function DELETE(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const scope = await getScope();
  if (!scope) return bad('未登录', 401);
  const { id } = await params;

  const q = admin().from('folders').delete().eq('id', id);
  const { error } = await (scope.orgId
    ? q.eq('org_id', scope.orgId)
    : q.eq('owner_id', scope.userId).is('org_id', null));
  if (error) return bad(error.message, 500);
  return Response.json({ ok: true });
}
