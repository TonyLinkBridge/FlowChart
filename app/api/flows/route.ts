import { auth } from '@clerk/nextjs/server';
import { admin } from '@/lib/supabase/admin';
import { bad, checkDoc, ownsFolder, readJson } from '@/lib/api/guard';

const cols = 'id,folder_id,doc,updated_at';

export async function GET() {
  const { userId } = await auth();
  if (!userId) return bad('未登录', 401);

  const { data, error } = await admin()
    .from('flows').select(cols)
    .eq('owner_id', userId)                 // ← 只给这个人的
    .order('updated_at', { ascending: false });
  if (error) return bad(error.message, 500);
  return Response.json(data);
}

export async function POST(req: Request) {
  const { userId } = await auth();
  if (!userId) return bad('未登录', 401);

  const body = await readJson(req);
  if (!body) return bad('请求体不是合法的 JSON 对象');
  const checked = checkDoc(body.doc);
  if (!checked.ok) return bad(`流程图数据不合法：${checked.error}`);

  let folderId: string | null = null;
  if (body.folderId != null) {
    if (typeof body.folderId !== 'string' || !(await ownsFolder(userId, body.folderId)))
      return bad('分组不存在，或者不是你的');
    folderId = body.folderId;
  }

  const { data, error } = await admin()
    .from('flows')
    // owner_id 用登录身份，不采信请求里传来的 —— 否则改个请求就能写到别人名下
    .insert({ owner_id: userId, doc: checked.doc, title: checked.doc.title || '未命名流程', folder_id: folderId })
    .select(cols).single();
  if (error) return bad(error.message, 500);
  return Response.json(data);
}
