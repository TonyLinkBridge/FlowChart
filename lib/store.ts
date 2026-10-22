import { blankDoc } from './doc';
import type { FlowDoc } from './types';
import type { RestorePreview, RestoreRequest, RestoreResult, VersionSnapshot } from './version-restore';

/** 工作区：你存过的所有流程图 + 你自己建的分堆。
 *  浏览器不直接连数据库 —— 全部走 /api，接口先验 Clerk 身份再按你的 ID 过滤。
 *  「各人只看得到自己的」就靠这一层，不靠前端自觉。 */

export interface Folder { id: string; name: string }
export interface StoredDoc { id: string; folderId: string | null; doc: FlowDoc; updatedAt: number; version: number }
export interface Workspace { folders: Folder[]; docs: StoredDoc[]; currentId: string | null }

/** 保存撞车：有同事在你之后存过。带着服务器的最新版回来，调用方拿去合并。 */
export class SaveConflict extends Error {
  constructor(public serverDoc: FlowDoc, public serverVersion: number) { super('conflict'); }
}

const CURRENT_KEY = 'runflow.current';   // 「上次看的是哪张」纯属本机偏好

type FlowRow = { id: string; folder_id: string | null; doc: FlowDoc; version: number; updated_at: string };
const toDoc = (r: FlowRow): StoredDoc => ({
  id: r.id, folderId: r.folder_id, doc: r.doc, updatedAt: new Date(r.updated_at).getTime(),
  version: r.version ?? 1,
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

/** 存一张图。调用方要防抖 —— 每敲一个字发一次请求谁也受不了。
 *  带 baseVersion 走乐观锁：撞车抛 SaveConflict（里面是服务器的最新版）。
 *  不带就是老式整篇覆盖 —— 只给改名这类单字段小动作用。
 *  返回保存后的版本号。 */
export async function saveFlow(id: string, doc: FlowDoc, baseVersion?: number): Promise<number> {
  const res = await fetch(`/api/flows/${id}`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(baseVersion === undefined ? { doc } : { doc, baseVersion }),
  });
  if (res.status === 409) {
    const j = await res.json().catch(() => null);
    if (j?.doc) throw new SaveConflict(j.doc, j.version);
  }
  if (!res.ok) throw new Error((await res.json().catch(() => ({}))).error ?? `请求失败 ${res.status}`);
  const j = await res.json().catch(() => ({}));
  return typeof j.version === 'number' ? j.version : (baseVersion ?? 0) + 1;
}

/** 单独拉一张图的最新版 —— 收到「同事保存了」的广播后用。 */
export async function fetchFlow(id: string): Promise<StoredDoc | null> {
  try { return toDoc(await call<FlowRow>(`/api/flows/${id}`)); }
  catch { return null; }
}

export async function deleteFlow(id: string) {
  await call(`/api/flows/${id}`, { method: 'DELETE' });
}

export async function moveFlow(id: string, folderId: string | null) {
  await call(`/api/flows/${id}`, { method: 'PATCH', body: JSON.stringify({ folderId }) });
}

/** 搬家：null = 搬回自己的个人空间，字符串 = 搬进那个 Team。 */
export async function moveFlowSpace(id: string, orgId: string | null) {
  await call(`/api/flows/${id}`, { method: 'PATCH', body: JSON.stringify({ toOrgId: orgId }) });
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

/* ── 版本历史 ── */

export type FlowVersion = VersionSnapshot;
export interface ActivityEntry {
  action: string; actorName: string | null; detail: string | null; createdAt: number;
}

type VersionRow = { id: string; version: number; saved_by: string; saved_name: string | null; note: string | null; created_at: string };
type ActivityRow = { action: string; actor_name: string | null; detail: string | null; created_at: string };

/** 一张图的版本列表 + 最近动态。 */
export async function fetchHistory(id: string): Promise<{ versions: FlowVersion[]; activity: ActivityEntry[] }> {
  const r = await call<{ versions: VersionRow[]; activity: ActivityRow[] }>(`/api/flows/${id}/versions`);
  return {
    versions: r.versions.map(v => ({
      id: v.id, version: v.version, savedBy: v.saved_by, savedName: v.saved_name,
      note: v.note, createdAt: new Date(v.created_at).getTime(),
    })),
    activity: r.activity.map(a => ({
      action: a.action, actorName: a.actor_name, detail: a.detail,
      createdAt: new Date(a.created_at).getTime(),
    })),
  };
}

/** 手动存一版（可带备注）。 */
export async function snapshotVersion(id: string, note?: string) {
  await call(`/api/flows/${id}/versions`, { method: 'POST', body: JSON.stringify({ note }) });
}

/** Read-only comparison against one exact snapshot, not an ambiguous version number. */
export async function previewVersion(id: string, snapshotId: string): Promise<RestorePreview> {
  return call(`/api/flows/${id}/restore?snapshotId=${encodeURIComponent(snapshotId)}`, { cache: 'no-store' });
}

/** A stale preview is rejected by the server; no unsafe legacy fallback. */
export async function restoreVersion(id: string, request: RestoreRequest): Promise<RestoreResult> {
  return call(`/api/flows/${id}/restore`, { method: 'POST', body: JSON.stringify(request) });
}
