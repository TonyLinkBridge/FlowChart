-- ════════════════════════════════════════════════════════════════
-- 从 Supabase Auth 换成 Clerk
-- 用法：Supabase 后台 → SQL Editor → 整段粘贴 → Run
--
-- 变了什么：
--   owner_id 从 uuid（指向 Supabase 的用户表）改成 text（存 Clerk 的用户 ID，
--   长这样：user_2abc...）。Clerk 的用户不在 Supabase 里，所以外键必须去掉。
--
-- 「各人只看得到自己的」从此由服务端保证：
--   浏览器不直接连数据库，所有读写走 Next.js 接口，
--   接口先验 Clerk 身份，再按你的 ID 过滤。
--   RLS 保持开启但不给任何策略 = 默认全部拒绝，
--   万一 anon key 泄漏出去，照样一行都读不到。
-- ════════════════════════════════════════════════════════════════

-- 旧的、跟 Supabase Auth 绑死的东西，先拆掉
drop trigger if exists flows_owner   on public.flows;
drop trigger if exists folders_owner on public.folders;
drop function if exists public.set_owner();
drop policy  if exists flows_own     on public.flows;
drop policy  if exists folders_own   on public.folders;

alter table public.flows   drop constraint if exists flows_owner_id_fkey;
alter table public.folders drop constraint if exists folders_owner_id_fkey;

-- owner_id 改成文本，装得下 Clerk 的用户 ID
alter table public.flows   alter column owner_id type text using owner_id::text;
alter table public.folders alter column owner_id type text using owner_id::text;

-- 之前用 Supabase Auth 试注册留下的数据清掉（都是测试数据）
delete from public.flows;
delete from public.folders;

-- RLS 继续开着，但一条策略都不给 = 拿 anon key 直连也读不到任何东西。
-- 服务端用 service_role key，它绕过 RLS —— 这把钥匙只能待在服务器上。
alter table public.flows   enable row level security;
alter table public.folders enable row level security;

create index if not exists flows_owner_updated_idx on public.flows   (owner_id, updated_at desc);
create index if not exists folders_owner_idx        on public.folders (owner_id);
