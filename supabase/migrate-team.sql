-- ════════════════════════════════════════════════════════════════
-- Runflow 协同第二步：Team 工作区 + 版本历史 + 操作日志
-- 用法：Supabase 后台 → SQL Editor → 整段粘贴 → Run（可重复跑）
-- 跑完不影响现有功能 —— 新列全部可空，老代码照常工作。
-- ════════════════════════════════════════════════════════════════

-- Team 归属：org_id 空 = 个人空间的图；有值 = 属于某个 Clerk Organization
alter table public.flows   add column if not exists org_id     text;
alter table public.flows   add column if not exists created_by text;
alter table public.flows   add column if not exists updated_by text;
alter table public.folders add column if not exists org_id     text;

create index if not exists flows_org_updated_idx on public.flows   (org_id, updated_at desc);
create index if not exists folders_org_idx       on public.folders (org_id);

-- 版本历史：检查点式快照（间隔 30 分钟的首次保存 / 手动存版本 / 恢复时落一版）
-- 恢复旧版 = 生成新版本，历史永不覆盖
create table if not exists public.flow_versions (
  id         uuid primary key default gen_random_uuid(),
  flow_id    uuid not null references public.flows(id) on delete cascade,
  version    int  not null,
  doc        jsonb not null,
  saved_by   text not null,          -- Clerk user id
  saved_name text,                   -- 显示名，查历史时不用再问 Clerk
  note       text,                   -- 手动存版本时的备注
  created_at timestamptz not null default now()
);
create index if not exists flow_versions_flow_idx on public.flow_versions (flow_id, version desc);

-- 操作日志：「Tony 修改了流程」「Amy 删了节点」「恢复到 V12」
create table if not exists public.activity_logs (
  id         uuid primary key default gen_random_uuid(),
  flow_id    uuid references public.flows(id) on delete cascade,
  org_id     text,
  actor      text not null,
  actor_name text,
  action     text not null,
  detail     text,
  created_at timestamptz not null default now()
);
create index if not exists activity_logs_flow_idx on public.activity_logs (flow_id, created_at desc);
create index if not exists activity_logs_org_idx  on public.activity_logs (org_id, created_at desc);

-- 和主表一个规矩：RLS 开着、零策略 —— anon key 一行都读不到，全走服务端
alter table public.flow_versions enable row level security;
alter table public.activity_logs enable row level security;
