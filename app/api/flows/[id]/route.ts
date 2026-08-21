import { auth } from '@clerk/nextjs/server';
import { admin } from '@/lib/supabase/admin';
import { bad, checkDoc, ownsFolder, readJson } from '@/lib/api/guard';

/** 改一张图。eq('owner_id', userId) 是关键：
 *  就算有人猜到别人的图 ID，也改不动 —— 条件不匹配，影响 0 行。 */
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
