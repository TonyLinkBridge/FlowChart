import { admin } from '@/lib/supabase/admin';
import { bad, checkDoc, readJson } from '@/lib/api/guard';
import { checkpoint, folderInScope, getScope, logActivity } from '@/lib/api/team';

const cols = 'id,folder_id,doc,version,updated_at';

/** 工作区列表：个人空间 = 我的、没挂 Team 的图；Team 空间 = 这个 Team 的全部。 */
export async function GET() {
  const scope = await getScope();
  if (!scope) return bad('未登录', 401);

  const q = admin().from('flows').select(cols);
  const { data, error } = await (scope.orgId
    ? q.eq('org_id', scope.orgId)
    : q.eq('owner_id', scope.userId).is('org_id', null))
    .order('updated_at', { ascending: false });
  if (error) return bad(error.message, 500);
  return Response.json(data);
}

export async function POST(req: Request) {
  const scope = await getScope();
  if (!scope) return bad('未登录', 401);

  const body = await readJson(req);
  if (!body) return bad('请求体不是合法的 JSON 对象');
  const checked = checkDoc(body.doc);
  if (!checked.ok) return bad(`流程图数据不合法：${checked.error}`);

  let folderId: string | null = null;
  if (body.folderId != null) {
    if (typeof body.folderId !== 'string' || !(await folderInScope(body.folderId, scope)))
      return bad('分组不存在，或者不在当前空间');
    folderId = body.folderId;
  }

  const { data, error } = await admin()
    .from('flows')
    // owner/org 全用登录会话，不采信请求里传来的 —— 否则改个请求就能写到别人名下
    .insert({
      owner_id: scope.userId, org_id: scope.orgId,
      created_by: scope.userId, updated_by: scope.userId,
      doc: checked.doc, title: checked.doc.title || '未命名流程', folder_id: folderId,
    })
    .select(cols).single();
  if (error) return bad(error.message, 500);

  await checkpoint(data.id, 1, checked.doc, scope.userId, { force: true, note: '创建' });
  await logActivity({ flowId: data.id, orgId: scope.orgId, actor: scope.userId, action: 'create', detail: checked.doc.title });
  return Response.json(data);
}
