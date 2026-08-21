import { auth } from '@clerk/nextjs/server';
import { admin } from '@/lib/supabase/admin';

const cols = 'id,folder_id,doc,updated_at';

export async function GET() {
  const { userId } = await auth();
  if (!userId) return Response.json({ error: '未登录' }, { status: 401 });

  const { data, error } = await admin()
    .from('flows').select(cols)
    .eq('owner_id', userId)                 // ← 只给这个人的
    .order('updated_at', { ascending: false });
  if (error) return Response.json({ error: error.message }, { status: 500 });
  return Response.json(data);
}

export async function POST(req: Request) {
  const { userId } = await auth();
  if (!userId) return Response.json({ error: '未登录' }, { status: 401 });

  const body = await req.json();
  const { data, error } = await admin()
    .from('flows')
    // owner_id 用登录身份，不采信请求里传来的 —— 否则改个请求就能写到别人名下
    .insert({ owner_id: userId, doc: body.doc, title: body.doc?.title ?? '未命名流程', folder_id: body.folderId ?? null })
    .select(cols).single();
  if (error) return Response.json({ error: error.message }, { status: 500 });
  return Response.json(data);
}
