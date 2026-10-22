import { existsSync, readFileSync } from 'node:fs';
import { PGlite } from '@electric-sql/pglite';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';

const flowId = '11111111-1111-4111-8111-111111111111';
const otherId = '22222222-2222-4222-8222-222222222222';
const snapshotId = '33333333-3333-4333-8333-333333333333';
const otherSnapshotId = '44444444-4444-4444-8444-444444444444';
const actor = 'user_test_tony';
const updatedAt = '2026-10-22T02:00:00.000Z';
const currentDoc = {
  title: '当前完整流程', nodes: [
    { id: 'a', title: '核实', note: { text: '当前的完整邮件模板', steps: [{ text: '确认资料', done: true }] } },
    { id: 'b', title: '等待法院结果', note: { text: '法院诉讼说明' } },
  ], edges: [{ source: 'a', target: 'b' }],
};
const targetDoc = { title: '旧流程', nodes: [{ id: 'a', title: '旧核实' }], edges: [] };
let db: PGlite;

async function query<T>(sql: string, values: unknown[] = []) { return (await db.query<T>(sql, values)).rows; }
async function restore(target = snapshotId, expectedVersion = 12, expectedUpdatedAt = updatedAt) {
  const rows = await query<{ result: {
    version: number; doc: typeof targetDoc; backup: { id: string; version: number }; restoredSnapshotId: string;
  } }>('select public.restore_flow_version_safe($1::uuid,$2::uuid,$3::int,$4::timestamptz,$5::text,$6::text) as result',
  [flowId, target, expectedVersion, expectedUpdatedAt, actor, 'Tony']);
  return rows[0].result;
}

beforeAll(async () => {
  // In-memory Postgres only: this test never reads .env or connects to the website database.
  db = new PGlite();
  await db.exec('create role anon; create role authenticated; create role service_role bypassrls;');
  await db.exec(readFileSync(new URL('../supabase/schema.sql', import.meta.url), 'utf8'));
  await db.exec(readFileSync(new URL('../supabase/migrate-team.sql', import.meta.url), 'utf8'));
  const migration = new URL('../supabase/migrate-safe-restore.sql', import.meta.url);
  if (existsSync(migration)) await db.exec(readFileSync(migration, 'utf8'));
});

beforeEach(async () => {
  await db.exec('truncate public.flows cascade;');
  await query('insert into public.flows(id,owner_id,org_id,created_by,updated_by,title,doc,version,updated_at) values ($1,$2,$3,$2,$2,$4,$5,12,$6)',
    [flowId, actor, 'org_test', currentDoc.title, JSON.stringify(currentDoc), updatedAt]);
  await query('insert into public.flows(id,owner_id,title,doc,version,updated_at) values ($1,$2,$3,$4,7,$5)',
    [otherId, 'user_other', '别人的流程', JSON.stringify({ title: '别人的流程', nodes: [], edges: [] }), updatedAt]);
  await query('insert into public.flow_versions(id,flow_id,version,doc,saved_by,note) values ($1,$2,3,$3,$4,$5),($6,$7,3,$3,$4,$5)',
    [snapshotId, flowId, JSON.stringify(targetDoc), actor, '历史原文', otherSnapshotId, otherId]);
});

afterAll(async () => { await db?.close(); });

describe('数据库里的安全恢复', () => {
  it('backs up the exact current document and keeps ownership, team and other flows unchanged', async () => {
    const before = await query<Record<string, unknown>>('select * from public.flows order by id');
    const result = await restore();
    expect(result.version).toBe(13);
    expect(result.doc).toEqual(targetDoc);
    const backup = await query<{ doc: unknown; version: number }>('select doc,version from public.flow_versions where id=$1', [result.backup.id]);
    expect(backup[0]).toEqual({ doc: currentDoc, version: 12 });
    const after = await query<Record<string, unknown>>('select * from public.flows order by id');
    expect(after[1]).toEqual(before[1]);
    for (const key of ['owner_id', 'org_id', 'folder_id', 'created_by', 'created_at']) expect(after[0][key]).toEqual(before[0][key]);
    expect(after[0].doc).toEqual(targetDoc);
    const original = await query<{ doc: unknown; note: string }>('select doc,note from public.flow_versions where id=$1', [snapshotId]);
    expect(original[0]).toEqual({ doc: targetDoc, note: '历史原文' });
    expect((await query<{ action: string }>('select action from public.activity_logs order by created_at')).map(r => r.action)).toEqual(['snapshot', 'restore']);
  });

  it('rejects restoring a snapshot from another flow without creating any backup', async () => {
    await expect(restore(otherSnapshotId)).rejects.toThrow(/snapshot_not_found/);
    expect((await query<{ doc: unknown }>('select doc from public.flows where id=$1', [flowId]))[0].doc).toEqual(currentDoc);
    expect(await query('select id from public.flow_versions')).toHaveLength(2);
  });

  it('requires another preview when somebody saved a new version', async () => {
    await expect(restore(snapshotId, 11)).rejects.toThrow(/restore_conflict/);
    expect(await query('select id from public.flow_versions')).toHaveLength(2);
  });

  it('also catches concurrent writes that did not increment the version', async () => {
    await expect(restore(snapshotId, 12, '2026-10-22T01:59:00Z')).rejects.toThrow(/restore_conflict/);
    expect(await query('select id from public.flow_versions')).toHaveLength(2);
  });

  it('does not change the flow if the automatic backup cannot be saved', async () => {
    await db.exec("alter table public.flow_versions add constraint test_backup_failure check (note not like '恢复前自动备份%') not valid");
    try { await expect(restore()).rejects.toMatchObject({ code: '23514' }); }
    finally { await db.exec('alter table public.flow_versions drop constraint test_backup_failure'); }
    expect((await query<{ doc: unknown; version: number }>('select doc,version from public.flows where id=$1', [flowId]))[0]).toEqual({ doc: currentDoc, version: 12 });
    expect(await query('select id from public.flow_versions')).toHaveLength(2);
    expect(await query('select id from public.activity_logs')).toHaveLength(0);
  });

  it('rolls back backup and content together if recording the restored version fails', async () => {
    await db.exec('alter table public.flow_versions add constraint test_snapshot_failure check (version <> 13) not valid');
    try { await expect(restore()).rejects.toMatchObject({ code: '23514' }); }
    finally { await db.exec('alter table public.flow_versions drop constraint test_snapshot_failure'); }
    expect((await query<{ doc: unknown; version: number }>('select doc,version from public.flows where id=$1', [flowId]))[0]).toEqual({ doc: currentDoc, version: 12 });
    expect(await query('select id from public.flow_versions')).toHaveLength(2);
    expect(await query('select id from public.activity_logs')).toHaveLength(0);
  });

  it('can return to the automatic backup and also protects content edited after the first restore', async () => {
    const first = await restore();
    const afterEdit = { ...targetDoc, title: '恢复后又改过的内容' };
    await query('update public.flows set doc=$1,version=14 where id=$2', [JSON.stringify(afterEdit), flowId]);
    const row = (await query<{ updated_at: string }>('select updated_at::text from public.flows where id=$1', [flowId]))[0];
    const undo = await restore(first.backup.id, 14, row.updated_at);
    expect(undo.doc).toEqual(currentDoc);
    expect(undo.version).toBe(15);
    expect((await query<{ doc: unknown }>('select doc from public.flow_versions where id=$1', [undo.backup.id]))[0].doc).toEqual(afterEdit);
  });

  it('uses the exact snapshot id even when version numbers repeat', async () => {
    await query('insert into public.flow_versions(flow_id,version,doc,saved_by) values ($1,3,$2,$3)',
      [flowId, JSON.stringify({ ...targetDoc, title: '同号但不同的存档' }), actor]);
    expect((await restore()).doc).toEqual(targetDoc);
  });

  it('does not allow anonymous clients to run the maintenance function directly', async () => {
    await db.exec('set role anon');
    try { await expect(restore()).rejects.toThrow(/permission denied/); }
    finally { await db.exec('reset role'); }
  });

  it('rolls back everything if writing the operation log fails', async () => {
    await db.exec("alter table public.activity_logs add constraint test_log_failure check (action <> 'restore') not valid");
    try { await expect(restore()).rejects.toMatchObject({ code: '23514' }); }
    finally { await db.exec('alter table public.activity_logs drop constraint test_log_failure'); }
    expect((await query<{ doc: unknown; version: number }>('select doc,version from public.flows where id=$1', [flowId]))[0]).toEqual({ doc: currentDoc, version: 12 });
    expect(await query('select id from public.flow_versions')).toHaveLength(2);
    expect(await query('select id from public.activity_logs')).toHaveLength(0);
  });

  it('does not generate backups or new versions for identical content', async () => {
    await query('update public.flow_versions set doc=$1 where id=$2', [JSON.stringify(currentDoc), snapshotId]);
    await expect(restore()).rejects.toThrow(/restore_no_changes/);
    expect(await query('select id from public.flow_versions')).toHaveLength(2);
    expect((await query<{ version: number }>('select version from public.flows where id=$1', [flowId]))[0].version).toBe(12);
  });
});
