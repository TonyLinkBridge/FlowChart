-- ════════════════════════════════════════════════════════════════
-- Runflow 建表脚本（Clerk 时代）
-- 全新数据库跑这一份就够。
-- 老库（之前用 Supabase Auth 建的）不要跑这份，跑 migrate-to-clerk.sql。
-- 用法：Supabase 后台 → SQL Editor → 整段粘贴 → Run（可重复跑）
--
-- 身份在 Clerk，不在这个库里，所以 owner_id 是文本（user_2abc…），
-- 没有外键。「各人只看得到自己的」由服务端接口保证：
-- 每个接口先验 Clerk 身份，再按 userId 过滤；owner_id 由服务端填。
-- RLS 开着但不给任何策略 = anon key 直连一行都读不到。
-- ════════════════════════════════════════════════════════════════

create table if not exists public.folders (
  id         uuid primary key default gen_random_uuid(),
  owner_id   text not null,
  name       text not null default '未命名分组',
  created_at timestamptz not null default now()
);

create table if not exists public.flows (
  id         uuid primary key default gen_random_uuid(),
  owner_id   text not null,
  folder_id  uuid references public.folders(id) on delete set null,  -- 删分组不删图
  title      text not null default '未命名流程',
  doc        jsonb not null,
  version    int  not null default 1,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists flows_owner_updated_idx on public.flows (owner_id, updated_at desc);
create index if not exists folders_owner_idx       on public.folders (owner_id);

create or replace function public.touch_updated_at()
returns trigger language plpgsql as $$
begin new.updated_at = now(); return new; end $$;

drop trigger if exists flows_touch on public.flows;
create trigger flows_touch before update on public.flows
  for each row execute function public.touch_updated_at();

alter table public.folders enable row level security;
alter table public.flows   enable row level security;
