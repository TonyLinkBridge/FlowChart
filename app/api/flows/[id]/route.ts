import { admin } from '@/lib/supabase/admin';
import { bad, checkDoc, readJson } from '@/lib/api/guard';
import { checkpoint, flowAccess, folderInScope, getScope, isMemberOf, logActivity } from '@/lib/api/team';

const cols = 'id,folder_id,doc,version,updated_at';

/** 单独拉一张图 —— 协同时收到「同事保存了」的广播后来这里取最新版。 */
export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const scope = await getScope();
  if (!scope) return bad('未登录', 401);
  const { id } = await params;
  const access = await flowAccess(id, scope);
  if (!access) return bad('流程不存在', 404);
  const r = access.row;
  return Response.json({ id: r.id, folder_id: r.folder_id, doc: r.doc, version: r.version, updated_at: r.updated_at });
}

/** 改一张图。权限走 flowAccess（个人看 owner，Team 看成员身份）。
 *
 *  带 baseVersion 的保存走「乐观锁」：只有服务器上还是那一版才写得进去。
 *  写不进去 = 有同事在你之后保存过 → 409 连人家的最新版一起还给你，
 *  前端拿去按节点合并再存一次。没有这一层，两人同时编辑就是互相静默覆盖。 */
export async function PATCH(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const scope = await getScope();
  if (!scope) return bad('未登录', 401);
  const { id } = await params;
  const body = await readJson(req);
  if (!body) return bad('请求体不是合法的 JSON 对象');

  const access = await flowAccess(id, scope);
  if (!access) return bad('流程不存在', 404);

  const patch: Record<string, unknown> = { updated_by: scope.userId };
  let savedDoc = null as import('@/lib/types').FlowDoc | null;
  if ('doc' in body) {
    const checked = checkDoc(body.doc);
    if (!checked.ok) return bad(`流程图数据不合法：${checked.error}`);
    savedDoc = checked.doc;
    patch.doc = checked.doc;
    patch.title = checked.doc.title || '未命名流程';
  }
  if ('folderId' in body) {
    const f = body.folderId;
    if (f === null) patch.folder_id = null;
    else if (typeof f === 'string' && (await folderInScope(f, scope))) patch.folder_id = f;
    else return bad('分组不存在，或者不在当前空间');
  }
  // 搬家：null = 搬回请求者的个人空间（owner 换成他），字符串 = 搬进那个 Team
  if ('toOrgId' in body) {
    const to = body.toOrgId;
    if (to === null) {
      patch.org_id = null; patch.owner_id = scope.userId; patch.folder_id = null;
    } else if (typeof to === 'string') {
      const okOrg = to === scope.orgId ? true : await isMemberOf(scope.userId, to);
      if (!okOrg) return bad('你不是那个 Team 的成员');
      patch.org_id = to; patch.folder_id = null;   // 分组是空间内的，跨空间要清
    } else return bad('目标空间不合法');
    await logActivity({ flowId: id, orgId: access.row.org_id, actor: scope.userId, action: 'move', detail: to ? '移入 Team' : '移回个人空间' });
  }
  if (Object.keys(patch).length === 1) return bad('没有可更新的内容');

  const base = typeof body.baseVersion === 'number' ? body.baseVersion : null;
  if (base !== null && 'doc' in body) {
    patch.version = base + 1;
    const { data, error } = await admin().from('flows').update(patch)
      .eq('id', id).eq('version', base).select('version');
    if (error) return bad(error.message, 500);
    if (data?.length) {
      // 落检查点：同一人 30 分钟内只落一版，落了才记一条日志
      if (savedDoc && await checkpoint(id, base + 1, savedDoc, scope.userId))
        await logActivity({ flowId: id, orgId: access.row.org_id, actor: scope.userId, action: 'update', detail: String(patch.title ?? '') });
      return Response.json({ ok: true, version: base + 1 });
    }

    const { data: cur, error: e2 } = await admin().from('flows')
      .select('doc,version').eq('id', id).maybeSingle();
    if (e2) return bad(e2.message, 500);
    if (!cur) return bad('流程不存在', 404);
    return Response.json({ error: 'conflict', version: cur.version, doc: cur.doc }, { status: 409 });
  }

  // 老路径：纯移动分组，或没带版本号的保存（整篇覆盖，保持兼容）
  const { error } = await admin().from('flows').update(patch).eq('id', id);
  if (error) return bad(error.message, 500);
  return Response.json({ ok: true });
}

/** 删除。Team 里的图只有管理员或创建者能删 —— 别人的心血不该一键消失。 */
export async function DELETE(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const scope = await getScope();
  if (!scope) return bad('未登录', 401);
  const { id } = await params;

  const access = await flowAccess(id, scope);
  if (!access) return bad('流程不存在', 404);
  const r = access.row;
  if (r.org_id && !access.admin && r.created_by !== scope.userId)
    return bad('Team 里的流程只有管理员或创建者能删除', 403);

  const { error } = await admin().from('flows').delete().eq('id', id);
  if (error) return bad(error.message, 500);
  // flow_id 留空 —— 级联删除会把挂在这张图上的日志一起带走，删除记录要独立活着
  await logActivity({ orgId: r.org_id, actor: scope.userId, action: 'delete', detail: r.title });
  return Response.json({ ok: true });
}
