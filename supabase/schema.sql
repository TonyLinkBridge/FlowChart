-- ════════════════════════════════════════════════════════════════
-- Runflow 建表脚本
-- 用法：Supabase 后台 → SQL Editor → 新建查询 → 整段粘贴 → Run
-- 可以重复跑，不会重复建表。
-- ════════════════════════════════════════════════════════════════

-- ── 分组（就是左侧栏那些「堆」）────────────────────────────────
create table if not exists public.folders (
  id         uuid primary key default gen_random_uuid(),
  owner_id   uuid not null references auth.users(id) on delete cascade,
  name       text not null default '未命名分组',
  created_at timestamptz not null default now()
);

-- ── 流程图 ─────────────────────────────────────────────────────
create table if not exists public.flows (
  id         uuid primary key default gen_random_uuid(),
  owner_id   uuid not null references auth.users(id) on delete cascade,
  folder_id  uuid references public.folders(id) on delete set null,  -- 删分组不删图，图退回未分组
  title      text not null default '未命名流程',
  doc        jsonb not null,   -- 整张图：nodes / edges / 附注，全在这里
  version    int  not null default 1,   -- 乐观锁：防两个标签页互相覆盖
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists flows_owner_updated_idx on public.flows (owner_id, updated_at desc);
create index if not exists folders_owner_idx       on public.folders (owner_id);

-- ── updated_at 自动跟着走 ──────────────────────────────────────
create or replace function public.touch_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end $$;

drop trigger if exists flows_touch on public.flows;
create trigger flows_touch before update on public.flows
  for each row execute function public.touch_updated_at();

-- ── 行级安全：这是「各人内容归各人」的关键 ──────────────────────
-- 打开之后，没有下面的策略，任何人（包括本人）都读不到任何行。
alter table public.folders enable row level security;
alter table public.flows   enable row level security;

drop policy if exists folders_own on public.folders;
create policy folders_own on public.folders
  for all
  using      (auth.uid() = owner_id)   -- 能看到的：只有自己的
  with check (auth.uid() = owner_id);  -- 能写入的：只能写成自己的

drop policy if exists flows_own on public.flows;
create policy flows_own on public.flows
  for all
  using      (auth.uid() = owner_id)
  with check (auth.uid() = owner_id);

-- ── 插入时自动填 owner_id，前端不用管，也伪造不了 ────────────────
create or replace function public.set_owner()
returns trigger language plpgsql as $$
begin
  new.owner_id = auth.uid();
  return new;
end $$;

drop trigger if exists folders_owner on public.folders;
create trigger folders_owner before insert on public.folders
  for each row execute function public.set_owner();

drop trigger if exists flows_owner on public.flows;
create trigger flows_owner before insert on public.flows
  for each row execute function public.set_owner();
