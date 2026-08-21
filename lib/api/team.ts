import { auth, clerkClient } from '@clerk/nextjs/server';
import { admin } from '@/lib/supabase/admin';
import type { FlowDoc } from '@/lib/types';

/** 当前请求的上下文：谁、在哪个空间（个人 or Team）、是不是管理员。
 *  orgId 只信 Clerk 会话 —— 前端传什么都不算数。 */
export interface Scope { userId: string; orgId: string | null; isAdmin: boolean }

export async function getScope(): Promise<Scope | null> {
  const { userId, orgId, orgRole } = await auth();
  if (!userId) return null;
  return { userId, orgId: orgId ?? null, isAdmin: orgRole === 'org:admin' };
}

/** 显示名：问一次 Clerk。只在落版本/写日志时用，不在保存热路径上。 */
export async function displayName(userId: string): Promise<string | null> {
  try {
    const client = await clerkClient();
    const u = await client.users.getUser(userId);
    return u.firstName ?? u.username ?? u.emailAddresses[0]?.emailAddress?.split('@')[0] ?? null;
  } catch { return null; }
}

export interface FlowRow {
  id: string; owner_id: string; org_id: string | null; created_by: string | null;
  doc: FlowDoc; version: number; folder_id: string | null; title: string; updated_at: string;
}

/** 这个人能不能碰这张图。个人图看 owner；Team 图看成员身份。
 *  不锁死在「当前」空间 —— 切换空间的瞬间可能还在保存上一个空间的图，
 *  org 对不上时问一次 Clerk 是不是那个 org 的成员，是就放行。 */
export async function flowAccess(id: string, scope: Scope):
  Promise<{ row: FlowRow; admin: boolean } | null> {
  const { data } = await admin().from('flows')
    .select('id,owner_id,org_id,created_by,doc,version,folder_id,title,updated_at')
    .eq('id', id).maybeSingle();
  if (!data) return null;
  const row = data as FlowRow;
  if (!row.org_id) return row.owner_id === scope.userId ? { row, admin: true } : null;
  if (row.org_id === scope.orgId) return { row, admin: scope.isAdmin };
  try {
    const client = await clerkClient();
    const ms = await client.users.getOrganizationMembershipList({ userId: scope.userId, limit: 100 });
    const m = ms.data.find(x => x.organization.id === row.org_id);
    return m ? { row, admin: m.role === 'org:admin' } : null;
  } catch { return null; }
}

/** 分组必须在「当前」空间里 —— 挂分组是工作区内的操作，不跨空间。 */
export async function folderInScope(folderId: string, scope: Scope): Promise<boolean> {
  const q = admin().from('folders').select('id').eq('id', folderId);
  const { data } = await (scope.orgId
    ? q.eq('org_id', scope.orgId)
    : q.eq('owner_id', scope.userId).is('org_id', null)).maybeSingle();
  return !!data;
}

/** 检查点式版本：同一人 30 分钟内的连续保存只落一版 ——
 *  不然 800ms 一存，一小时就是几百个版本。手动存档和恢复走 force。 */
const CHECKPOINT_MS = 30 * 60 * 1000;
export async function checkpoint(
  flowId: string, version: number, doc: FlowDoc, userId: string,
  opts?: { note?: string; force?: boolean },
): Promise<boolean> {
  if (!opts?.force) {
    const { data } = await admin().from('flow_versions')
      .select('saved_by,created_at').eq('flow_id', flowId)
      .order('version', { ascending: false }).limit(1);
    const last = data?.[0];
    if (last && last.saved_by === userId
        && Date.now() - new Date(last.created_at).getTime() < CHECKPOINT_MS) return false;
  }
  const name = await displayName(userId);
  await admin().from('flow_versions')
    .insert({ flow_id: flowId, version, doc, saved_by: userId, saved_name: name, note: opts?.note ?? null });
  return true;
}

/** 操作日志。写失败不拦业务 —— 日志是旁证，不是主链路。 */
export async function logActivity(e: {
  flowId?: string | null; orgId?: string | null; actor: string; action: string; detail?: string;
}) {
  const name = await displayName(e.actor);
  await admin().from('activity_logs').insert({
    flow_id: e.flowId ?? null, org_id: e.orgId ?? null,
    actor: e.actor, actor_name: name, action: e.action, detail: e.detail ?? null,
  }).then(() => undefined, () => undefined);
}
