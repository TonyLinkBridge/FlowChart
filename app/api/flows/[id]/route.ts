import { auth } from '@clerk/nextjs/server';
import { admin } from '@/lib/supabase/admin';
import { bad, checkDoc, ownsFolder, readJson } from '@/lib/api/guard';

const cols = 'id,folder_id,doc,version,updated_at';

/** 单独拉一张图 —— 协同时收到「同事保存了」的广播后来这里取最新版。 */
export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { userId } = await auth();
  if (!userId) return bad('未登录', 401);
  const { id } = await params;
  const { data, error } = await admin().from('flows').select(cols).eq('id', id).eq('owner_id', userId).maybeSingle();
  if (error) return bad(error.message, 500);
  if (!data) return bad('流程不存在', 404);
  return Response.json(data);
}

/** 改一张图。eq('owner_id', userId) 是关键：
 *  就算有人猜到别人的图 ID，也改不动 —— 条件不匹配，影响 0 行。
 *
 *  带 baseVersion 的保存走「乐观锁」：只有服务器上还是那一版才写得进去。
 *  写不进去 = 有同事在你之后保存过 → 409 连人家的最新版一起还给你，
 *  前端拿去按节点合并再存一次。没有这一层，两人同时编辑就是互相静默覆盖。 */
export async function PATCH(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { userId } = await auth();
  if (!userId) return bad('未登录', 401);
  const { id } = await params;
  const body = await readJson(req);
  if (!body) return bad('请求体不是合法的 JSON 对象');

  const patch: Record<string, unknown> = {};
  if ('doc' in body) {
    const checked = checkDoc(body.doc);
    if (!checked.ok) return bad(`流程图数据不合法：${checked.error}`);
    patch.doc = checked.doc;
    patch.title = checked.doc.title || '未命名流程';
  }
  if ('folderId' in body) {
    const f = body.folderId;
    if (f === null) patch.folder_id = null;
    else if (typeof f === 'string' && (await ownsFolder(userId, f))) patch.folder_id = f;
    else return bad('分组不存在，或者不是你的');
  }
  if (!Object.keys(patch).length) return bad('没有可更新的内容');

  const base = typeof body.baseVersion === 'number' ? body.baseVersion : null;
  if (base !== null && 'doc' in body) {
    patch.version = base + 1;
    const { data, error } = await admin().from('flows').update(patch)
      .eq('id', id).eq('owner_id', userId).eq('version', base).select('version');
    if (error) return bad(error.message, 500);
    if (data?.length) return Response.json({ ok: true, version: base + 1 });

    const { data: cur, error: e2 } = await admin().from('flows')
      .select('doc,version').eq('id', id).eq('owner_id', userId).maybeSingle();
    if (e2) return bad(e2.message, 500);
    if (!cur) return bad('流程不存在', 404);
    return Response.json({ error: 'conflict', version: cur.version, doc: cur.doc }, { status: 409 });
  }

  // 老路径：纯移动分组，或没带版本号的保存（整篇覆盖，保持兼容）
  const { error } = await admin().from('flows').update(patch).eq('id', id).eq('owner_id', userId);
  if (error) return bad(error.message, 500);
  return Response.json({ ok: true });
}

export async function DELETE(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { userId } = await auth();
  if (!userId) return bad('未登录', 401);
  const { id } = await params;

  const { error } = await admin().from('flows').delete().eq('id', id).eq('owner_id', userId);
  if (error) return bad(error.message, 500);
  return Response.json({ ok: true });
}
