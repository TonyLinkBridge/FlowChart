import { auth } from '@clerk/nextjs/server';
import { admin } from '@/lib/supabase/admin';
import { bad, readJson } from '@/lib/api/guard';

export async function GET() {
  const { userId } = await auth();
  if (!userId) return bad('未登录', 401);
  const { data, error } = await admin()
    .from('folders').select('id,name').eq('owner_id', userId).order('created_at');
  if (error) return bad(error.message, 500);
  return Response.json(data);
}

export async function POST(req: Request) {
  const { userId } = await auth();
  if (!userId) return bad('未登录', 401);
  const body = await readJson(req);
  if (!body) return bad('请求体不是合法的 JSON 对象');
  // 名字只收字符串，掐到 40 个字 —— 分组名不是作文
  const name = typeof body.name === 'string' ? body.name.trim().slice(0, 40) : '';
  const { data, error } = await admin()
    .from('folders').insert({ owner_id: userId, name: name || '新分组' })
    .select('id,name').single();
  if (error) return bad(error.message, 500);
  return Response.json(data);
}
