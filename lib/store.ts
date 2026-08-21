import { getSupabase } from './supabase/client';
import { blankDoc } from './doc';
import type { FlowDoc } from './types';

/** 工作区：你存过的所有流程图 + 你自己建的分堆。
 *  数据在 Supabase，靠 RLS 保证「各人只看得到自己的」——
 *  owner_id 由数据库触发器自动填，前端传不了也伪造不了。 */

export interface Folder { id: string; name: string }
export interface StoredDoc { id: string; folderId: string | null; doc: FlowDoc; updatedAt: number }
export interface Workspace { folders: Folder[]; docs: StoredDoc[]; currentId: string | null }

const CURRENT_KEY = 'runflow.current';   // 「上次看的是哪张」纯属本机偏好，不必存云端

type FlowRow = { id: string; folder_id: string | null; doc: FlowDoc; updated_at: string };
type FolderRow = { id: string; name: string };

const toDoc = (r: FlowRow): StoredDoc => ({
  id: r.id, folderId: r.folder_id, doc: r.doc, updatedAt: new Date(r.updated_at).getTime(),
});

/** 拉一次工作区。一张图都没有就先建一张空白的，不然进来是空屏。 */
export async function loadWorkspace(): Promise<Workspace> {
  const sb = getSupabase();
  if (!sb) return { folders: [], docs: [], currentId: null };

  const [f, d] = await Promise.all([
    sb.from('folders').select('id,name').order('created_at'),
    sb.from('flows').select('id,folder_id,doc,updated_at').order('updated_at', { ascending: false }),
  ]);
  if (f.error) throw f.error;
  if (d.error) throw d.error;

  let docs = (d.data as FlowRow[]).map(toDoc);
  if (!docs.length) {
    const first = await createFlow(blankDoc(), null);
    if (first) docs = [first];
  }

  const saved = typeof window !== 'undefined' ? localStorage.getItem(CURRENT_KEY) : null;
  const currentId = docs.some(x => x.id === saved) ? saved : docs[0]?.id ?? null;
  return { folders: f.data as FolderRow[], docs, currentId };
}

export function rememberCurrent(id: string | null) {
  if (typeof window !== 'undefined' && id) localStorage.setItem(CURRENT_KEY, id);
}

export async function createFlow(doc: FlowDoc, folderId: string | null): Promise<StoredDoc | null> {
  const sb = getSupabase();
  if (!sb) return null;
  const { data, error } = await sb.from('flows')
    .insert({ doc, title: doc.title, folder_id: folderId })
    .select('id,folder_id,doc,updated_at').single();
  if (error) throw error;
  return toDoc(data as FlowRow);
}

/** 存一张图。调用方要防抖 —— 每敲一个字就发一次请求谁也受不了。 */
export async function saveFlow(id: string, doc: FlowDoc) {
  const sb = getSupabase();
  if (!sb) return;
  const { error } = await sb.from('flows').update({ doc, title: doc.title }).eq('id', id);
  if (error) throw error;
}

export async function deleteFlow(id: string) {
  const sb = getSupabase();
  if (!sb) return;
  const { error } = await sb.from('flows').delete().eq('id', id);
  if (error) throw error;
}

export async function moveFlow(id: string, folderId: string | null) {
  const sb = getSupabase();
  if (!sb) return;
  const { error } = await sb.from('flows').update({ folder_id: folderId }).eq('id', id);
  if (error) throw error;
}

export async function createFolder(name: string): Promise<Folder | null> {
  const sb = getSupabase();
  if (!sb) return null;
  const { data, error } = await sb.from('folders').insert({ name }).select('id,name').single();
  if (error) throw error;
  return data as Folder;
}

export async function renameFolderDb(id: string, name: string) {
  const sb = getSupabase();
  if (!sb) return;
  const { error } = await sb.from('folders').update({ name }).eq('id', id);
  if (error) throw error;
}

/** 删分组不删图 —— 表定义里 folder_id 是 on delete set null，图会退回未分组。 */
export async function deleteFolderDb(id: string) {
  const sb = getSupabase();
  if (!sb) return;
  const { error } = await sb.from('folders').delete().eq('id', id);
  if (error) throw error;
}

export const currentDoc = (w: Workspace) => w.docs.find(d => d.id === w.currentId) ?? w.docs[0];
