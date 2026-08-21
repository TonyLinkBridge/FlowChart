import { blankDoc } from './doc';
import type { FlowDoc } from './types';

/** 工作区：你存过的所有流程图 + 你自己建的分堆。
 *  浏览器不直接连数据库 —— 全部走 /api，接口先验 Clerk 身份再按你的 ID 过滤。
 *  「各人只看得到自己的」就靠这一层，不靠前端自觉。 */

export interface Folder { id: string; name: string }
export interface StoredDoc { id: string; folderId: string | null; doc: FlowDoc; updatedAt: number }
export interface Workspace { folders: Folder[]; docs: StoredDoc[]; currentId: string | null }

const CURRENT_KEY = 'runflow.current';   // 「上次看的是哪张」纯属本机偏好

type FlowRow = { id: string; folder_id: string | null; doc: FlowDoc; updated_at: string };
const toDoc = (r: FlowRow): StoredDoc => ({
  id: r.id, folderId: r.folder_id, doc: r.doc, updatedAt: new Date(r.updated_at).getTime(),
});

async function call<T>(url: string, init?: RequestInit): Promise<T> {
  const res = await fetch(url, {
    ...init,
    headers: init?.body ? { 'Content-Type': 'application/json' } : undefined,
  });
  if (!res.ok) throw new Error((await res.json().catch(() => ({}))).error ?? `请求失败 ${res.status}`);
  return res.json();
}

export async function loadWorkspace(): Promise<Workspace> {
  const [folders, rows] = await Promise.all([
    call<Folder[]>('/api/folders'),
    call<FlowRow[]>('/api/flows'),
  ]);
  let docs = rows.map(toDoc);
  if (!docs.length) {
    const first = await createFlow(blankDoc(), null);
    if (first) docs = [first];
  }
  const saved = typeof window !== 'undefined' ? localStorage.getItem(CURRENT_KEY) : null;
  const currentId = docs.some(d => d.id === saved) ? saved : docs[0]?.id ?? null;
  return { folders, docs, currentId };
}

export function rememberCurrent(id: string | null) {
  if (typeof window !== 'undefined' && id) localStorage.setItem(CURRENT_KEY, id);
}

export async function createFlow(doc: FlowDoc, folderId: string | null): Promise<StoredDoc | null> {
  return toDoc(await call<FlowRow>('/api/flows', { method: 'POST', body: JSON.stringify({ doc, folderId }) }));
}

/** 存一张图。调用方要防抖 —— 每敲一个字发一次请求谁也受不了。 */
export async function saveFlow(id: string, doc: FlowDoc) {
  await call(`/api/flows/${id}`, { method: 'PATCH', body: JSON.stringify({ doc }) });
}

export async function deleteFlow(id: string) {
  await call(`/api/flows/${id}`, { method: 'DELETE' });
}

export async function moveFlow(id: string, folderId: string | null) {
  await call(`/api/flows/${id}`, { method: 'PATCH', body: JSON.stringify({ folderId }) });
}

export async function createFolder(name: string): Promise<Folder | null> {
  return call<Folder>('/api/folders', { method: 'POST', body: JSON.stringify({ name }) });
}

export async function renameFolderDb(id: string, name: string) {
  await call(`/api/folders/${id}`, { method: 'PATCH', body: JSON.stringify({ name }) });
}

/** 删分组不删图 —— 图退回未分组。 */
export async function deleteFolderDb(id: string) {
  await call(`/api/folders/${id}`, { method: 'DELETE' });
}

export const currentDoc = (w: Workspace) => w.docs.find(d => d.id === w.currentId) ?? w.docs[0];
