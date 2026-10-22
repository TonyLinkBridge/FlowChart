import { admin } from '@/lib/supabase/admin';
import { bad, readJson } from '@/lib/api/guard';
import { checkpoint, flowAccess, getScope, logActivity } from '@/lib/api/team';

/** 一张图的历史：版本列表（不带 doc，太重）+ 最近的操作日志。 */
export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const scope = await getScope();
  if (!scope) return bad('未登录', 401);
  const { id } = await params;
  if (!(await flowAccess(id, scope))) return bad('流程不存在', 404);

  const [vers, acts] = await Promise.all([
    admin().from('flow_versions')
      .select('id,version,saved_by,saved_name,note,created_at')
      .eq('flow_id', id).order('version', { ascending: false })
      .order('created_at', { ascending: false }).limit(50),
    admin().from('activity_logs')
      .select('action,actor_name,detail,created_at')
      .eq('flow_id', id).order('created_at', { ascending: false }).limit(50),
  ]);
  if (vers.error) return bad(vers.error.message, 500);
  return Response.json({ versions: vers.data, activity: acts.data ?? [] });
}

/** 手动存一版（可带备注）。任何成员都可以 —— 存档只增不减，没风险。 */
export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const scope = await getScope();
  if (!scope) return bad('未登录', 401);
  const { id } = await params;
  const access = await flowAccess(id, scope);
  if (!access) return bad('流程不存在', 404);

  const body = await readJson(req);
  const note = typeof body?.note === 'string' ? body.note.trim().slice(0, 200) : '';
  await checkpoint(id, access.row.version, access.row.doc, scope.userId, { force: true, note: note || '手动存档' });
  await logActivity({ flowId: id, orgId: access.row.org_id, actor: scope.userId, action: 'snapshot', detail: note || access.row.title });
  return Response.json({ ok: true });
}
