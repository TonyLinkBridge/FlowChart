import { auth } from '@clerk/nextjs/server';
import { admin } from '@/lib/supabase/admin';

export async function GET() {
  const { userId } = await auth();
  if (!userId) return Response.json({ error: '未登录' }, { status: 401 });
  const { data, error } = await admin()
    .from('folders').select('id,name').eq('owner_id', userId).order('created_at');
  if (error) return Response.json({ error: error.message }, { status: 500 });
  return Response.json(data);
}

export async function POST(req: Request) {
  const { userId } = await auth();
  if (!userId) return Response.json({ error: '未登录' }, { status: 401 });
  const { name } = await req.json();
  const { data, error } = await admin()
    .from('folders').insert({ owner_id: userId, name: name || '新分组' })
    .select('id,name').single();
  if (error) return Response.json({ error: error.message }, { status: 500 });
  return Response.json(data);
}
