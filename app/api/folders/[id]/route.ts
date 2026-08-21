import { auth } from '@clerk/nextjs/server';
import { admin } from '@/lib/supabase/admin';

export async function PATCH(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { userId } = await auth();
  if (!userId) return Response.json({ error: '未登录' }, { status: 401 });
  const { id } = await params;
  const { name } = await req.json();
  const { error } = await admin().from('folders').update({ name }).eq('id', id).eq('owner_id', userId);
  if (error) return Response.json({ error: error.message }, { status: 500 });
  return Response.json({ ok: true });
}

/** 删分组不删图 —— 表定义里 folder_id 是 on delete set null，图退回未分组。 */
export async function DELETE(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { userId } = await auth();
  if (!userId) return Response.json({ error: '未登录' }, { status: 401 });
  const { id } = await params;
  const { error } = await admin().from('folders').delete().eq('id', id).eq('owner_id', userId);
  if (error) return Response.json({ error: error.message }, { status: 500 });
  return Response.json({ ok: true });
}
