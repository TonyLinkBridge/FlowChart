import { beforeEach, describe, expect, it, vi } from 'vitest';

const fixture = vi.hoisted(() => ({
  flowId: '11111111-1111-4111-8111-111111111111',
  snapshotId: '33333333-3333-4333-8333-333333333333',
  foreignSnapshotId: '44444444-4444-4444-8444-444444444444',
  getScope: vi.fn(), access: vi.fn(), rpc: vi.fn(),
}));
vi.mock('@/lib/api/team', () => ({
  getScope: fixture.getScope, flowAccess: fixture.access,
  displayName: async () => 'Tony',
}));
vi.mock('@/lib/supabase/admin', () => ({ admin: () => ({
  from: () => {
    const filters: Record<string, string> = {};
    const query = {
      select: () => query,
      eq: (key: string, value: string) => { filters[key] = value; return query; },
      maybeSingle: async () => {
        const snapshots = [
          { id: fixture.snapshotId, flow_id: fixture.flowId, version: 3, doc: { title: '旧流程', nodes: [], edges: [] }, saved_by: 'user_tony', saved_name: 'Tony', note: '原存档', created_at: '2026-10-22T01:00:00Z' },
          { id: fixture.foreignSnapshotId, flow_id: '22222222-2222-4222-8222-222222222222', version: 3, doc: { title: '别人的私密内容', nodes: [], edges: [] } },
        ];
        return { data: snapshots.find(row => Object.entries(filters).every(([key, value]) => row[key as keyof typeof row] === value)) ?? null, error: null };
      },
    };
    return query;
  },
  rpc: fixture.rpc,
}) }));

import { GET, POST } from '@/app/api/flows/[id]/restore/route';
const context = () => ({ params: Promise.resolve({ id: fixture.flowId }) });
const request = (body: unknown) => new Request(`http://localhost/api/flows/${fixture.flowId}/restore`, {
  method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body),
});
const validRequest = () => ({ snapshotId: fixture.snapshotId, expectedVersion: 12, expectedUpdatedAt: '2026-10-22T02:00:00.123456Z' });

beforeEach(() => {
  fixture.getScope.mockResolvedValue({ userId: 'user_tony', orgId: null, isAdmin: false });
  fixture.access.mockResolvedValue({ row: {
    id: fixture.flowId, version: 12, updated_at: '2026-10-22T02:00:00.123456Z',
    doc: { title: '当前', nodes: [{ id: 'a', title: '核实', note: { text: '不能丢的模板' } }], edges: [] },
  } });
  fixture.rpc.mockResolvedValue({ data: { version: 13, backup: { id: 'backup', version: 12 } }, error: null });
});

describe('安全恢复接口', () => {
  it('requires login for the read-only preview', async () => {
    fixture.getScope.mockResolvedValue(null);
    const response = await GET(new Request(`http://localhost/restore?snapshotId=${fixture.snapshotId}`), context());
    expect(response.status).toBe(401);
  });

  it('does not reveal another flow snapshot in a preview', async () => {
    const response = await GET(new Request(`http://localhost/restore?snapshotId=${fixture.foreignSnapshotId}`), context());
    expect(response.status).toBe(404);
    expect(await response.text()).not.toContain('别人的私密内容');
  });

  it('returns full note-removal details and the exact timestamp for confirmation', async () => {
    const response = await GET(new Request(`http://localhost/restore?snapshotId=${fixture.snapshotId}`), context());
    expect(response.status).toBe(200);
    const data = await response.json();
    expect(data.currentUpdatedAt).toBe('2026-10-22T02:00:00.123456Z');
    expect(data.diff.summary.notesRemoved).toBe(1);
    expect(data.diff.nodesRemoved[0].note.text).toBe('不能丢的模板');
    expect(response.headers.get('cache-control')).toContain('no-store');
  });

  it('rejects the old one-click restore request that has no preview stamp', async () => {
    const response = await POST(request({ version: 3 }), context());
    expect(response.status).toBe(400);
  });

  it('does not allow a restore when the user cannot access that flow', async () => {
    fixture.access.mockResolvedValue(null);
    const response = await POST(request(validRequest()), context());
    expect(response.status).toBe(404);
  });

  it('requires a fresh preview if the database rejects the expected version', async () => {
    fixture.rpc.mockResolvedValue({ data: null, error: { code: 'P0001', message: 'restore_conflict' } });
    const response = await POST(request(validRequest()), context());
    expect(response.status).toBe(409);
    expect((await response.json()).error).toMatch(/重新查看差异/);
  });

  it('fails closed instead of using the old unsafe path when the migration is absent', async () => {
    fixture.rpc.mockResolvedValue({ data: null, error: { code: 'PGRST202', message: 'function not found' } });
    const response = await POST(request(validRequest()), context());
    expect(response.status).toBe(503);
    expect((await response.json()).error).toMatch(/尚未启用/);
  });
});
