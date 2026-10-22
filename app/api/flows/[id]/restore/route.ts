import { admin } from '@/lib/supabase/admin';
import { bad, readJson } from '@/lib/api/guard';
import { displayName, flowAccess, getScope } from '@/lib/api/team';
import { diffDocuments } from '@/lib/version-diff';
import type { RestorePreview } from '@/lib/version-restore';

const uuid = /^[0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12}$/i;
type Context = { params: Promise<{ id: string }> };

/** Read-only: previewing a snapshot never changes the flow or creates a backup. */
export async function GET(req: Request, { params }: Context) {
  const scope = await getScope();
  if (!scope) return bad('未登录', 401);
  const { id } = await params;
  const access = await flowAccess(id, scope);
  if (!access) return bad('流程不存在', 404);
  const snapshotId = new URL(req.url).searchParams.get('snapshotId') ?? '';
  if (!uuid.test(snapshotId)) return bad('请选择有效的历史存档');
  const { data: snapshot, error } = await admin().from('flow_versions')
    .select('id,version,doc,saved_by,saved_name,note,created_at')
    .eq('flow_id', id).eq('id', snapshotId).maybeSingle();
  if (error) return bad('历史存档读取失败，请重试', 500);
  if (!snapshot) return bad('这张流程中没有该存档', 404);
  const preview: RestorePreview = {
    flowId: id, currentVersion: access.row.version, currentUpdatedAt: access.row.updated_at,
    snapshot: {
      id: snapshot.id, version: snapshot.version, savedBy: snapshot.saved_by,
      savedName: snapshot.saved_name, note: snapshot.note, createdAt: new Date(snapshot.created_at).getTime(),
    },
    diff: diffDocuments(access.row.doc, snapshot.doc),
  };
  return Response.json(preview, { headers: { 'Cache-Control': 'no-store' } });
}

/** The DB function backs up + restores + logs in one transaction, with a preview stamp. */
export async function POST(req: Request, { params }: Context) {
  const scope = await getScope();
  if (!scope) return bad('未登录', 401);
  const { id } = await params;
  const body = await readJson(req);
  if (!body || typeof body.snapshotId !== 'string' || !uuid.test(body.snapshotId)
      || !Number.isSafeInteger(body.expectedVersion) || (body.expectedVersion as number) < 1
      || typeof body.expectedUpdatedAt !== 'string' || !Number.isFinite(Date.parse(body.expectedUpdatedAt)))
    return bad('请先查看差异，再确认恢复');
  if (!(await flowAccess(id, scope))) return bad('流程不存在', 404);

  const { data, error } = await admin().rpc('restore_flow_version_safe', {
    p_flow_id: id, p_snapshot_id: body.snapshotId,
    p_expected_version: body.expectedVersion, p_expected_updated_at: body.expectedUpdatedAt,
    p_actor: scope.userId, p_actor_name: await displayName(scope.userId),
  });
  if (error) {
    if (error.message.includes('restore_conflict')) return bad('内容已变化，请重新查看差异后再确认恢复', 409);
    if (error.message.includes('restore_no_changes')) return bad('存档与当前内容相同，无需恢复', 409);
    if (error.message.includes('snapshot_not_found') || error.message.includes('flow_not_found'))
      return bad('这张流程中没有该存档', 404);
    if (error.code === 'PGRST202' || error.code === '42883')
      return bad('安全恢复尚未启用，请先完成数据库升级；本次未执行恢复', 503);
    return bad('备份或恢复未能确认完成，请刷新历史记录后再试', 500);
  }
  return Response.json(data);
}
