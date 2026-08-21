import { auth } from '@clerk/nextjs/server';
import { admin } from '@/lib/supabase/admin';
import { bad, readJson } from '@/lib/api/guard';

export async function PATCH(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { userId } = await auth();
  if (!userId) return bad('未登录', 401);
  const { id } = await params;
  const body = await readJson(req);
  if (!body) return bad('请求体不是合法的 JSON 对象');
  const name = typeof body.name === 'string' ? body.name.trim().slice(0, 40) : '';
  if (!name) return bad('分组名不能为空');
  const { error } = await admin().from('folders').update({ name }).eq('id', id).eq('owner_id', userId);
  if (error) return bad(error.message, 500);
  return Response.json({ ok: true });
}

/** 删分组不删图 —— 表定义里 folder_id 是 on delete set null，图退回未分组。 */
export async function DELETE(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { userId } = await auth();
  if (!userId) return bad('未登录', 401);
  const { id } = await params;
  const { error } = await admin().from('folders').delete().eq('id', id).eq('owner_id', userId);
  if (error) return bad(error.message, 500);
  return Response.json({ ok: true });
}
