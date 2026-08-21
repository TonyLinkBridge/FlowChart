import { auth } from '@clerk/nextjs/server';
import { admin } from '@/lib/supabase/admin';

/** 改一张图。eq('owner_id', userId) 是关键：
 *  就算有人猜到别人的图 ID，也改不动 —— 条件不匹配，影响 0 行。 */
export async function PATCH(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { userId } = await auth();
  if (!userId) return Response.json({ error: '未登录' }, { status: 401 });
  const { id } = await params;
  const body = await req.json();

  const patch: Record<string, unknown> = {};
  if (body.doc) { patch.doc = body.doc; patch.title = body.doc.title ?? '未命名流程'; }
  if ('folderId' in body) patch.folder_id = body.folderId;

  const { error } = await admin().from('flows').update(patch).eq('id', id).eq('owner_id', userId);
  if (error) return Response.json({ error: error.message }, { status: 500 });
  return Response.json({ ok: true });
}

export async function DELETE(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { userId } = await auth();
  if (!userId) return Response.json({ error: '未登录' }, { status: 401 });
  const { id } = await params;

  const { error } = await admin().from('flows').delete().eq('id', id).eq('owner_id', userId);
  if (error) return Response.json({ error: error.message }, { status: 500 });
  return Response.json({ ok: true });
}
