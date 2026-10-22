-- 安全恢复：只添加一个服务端函数，不改写现有流程、存档或分组。
-- 依赖 schema.sql + migrate-team.sql。备份、替换、存档、日志在同一事务内完成。
begin;

create or replace function public.restore_flow_version_safe(
  p_flow_id uuid,
  p_snapshot_id uuid,
  p_expected_version integer,
  p_expected_updated_at timestamptz,
  p_actor text,
  p_actor_name text default null
) returns jsonb
language plpgsql
security invoker
set search_path = public, pg_temp
as $$
declare
  current_flow public.flows%rowtype;
  target_snapshot public.flow_versions%rowtype;
  backup_id uuid := gen_random_uuid();
  restored_id uuid := gen_random_uuid();
  next_version integer;
  backup_time timestamptz;
begin
  if p_actor is null or length(trim(p_actor)) = 0 then
    raise exception 'invalid_actor';
  end if;

  select * into current_flow from public.flows where id = p_flow_id for update;
  if not found then raise exception 'flow_not_found'; end if;
  if current_flow.version is distinct from p_expected_version
      or current_flow.updated_at is distinct from p_expected_updated_at then
    raise exception 'restore_conflict';
  end if;

  -- The UUID identifies one exact snapshot, and it MUST belong to this same flow.
  select * into target_snapshot from public.flow_versions
    where id = p_snapshot_id and flow_id = p_flow_id;
  if not found then raise exception 'snapshot_not_found'; end if;
  if jsonb_typeof(target_snapshot.doc) is distinct from 'object'
      or jsonb_typeof(target_snapshot.doc->'nodes') is distinct from 'array'
      or jsonb_typeof(target_snapshot.doc->'edges') is distinct from 'array' then
    raise exception 'invalid_snapshot';
  end if;
  if current_flow.doc = target_snapshot.doc then raise exception 'restore_no_changes'; end if;

  next_version := current_flow.version + 1;
  insert into public.flow_versions(id,flow_id,version,doc,saved_by,saved_name,note)
    values (backup_id,p_flow_id,current_flow.version,current_flow.doc,p_actor,p_actor_name,
      format('恢复前自动备份 V%s（准备恢复 V%s）',current_flow.version,target_snapshot.version))
    returning created_at into backup_time;

  -- Ownership, Team, folder, and every other flow remain untouched.
  update public.flows set
    doc = target_snapshot.doc,
    title = coalesce(target_snapshot.doc->>'title',current_flow.title),
    version = next_version,
    updated_by = p_actor
  where id = p_flow_id;

  insert into public.flow_versions(id,flow_id,version,doc,saved_by,saved_name,note)
    values (restored_id,p_flow_id,next_version,target_snapshot.doc,p_actor,p_actor_name,
      format('恢复自 V%s；恢复前 V%s 已自动备份',target_snapshot.version,current_flow.version));

  insert into public.activity_logs(flow_id,org_id,actor,actor_name,action,detail) values
    (p_flow_id,current_flow.org_id,p_actor,p_actor_name,'snapshot',format('恢复前自动备份 V%s',current_flow.version)),
    (p_flow_id,current_flow.org_id,p_actor,p_actor_name,'restore',
      format('V%s → V%s（恢复自 V%s；原内容已备份）',current_flow.version,next_version,target_snapshot.version));

  return jsonb_build_object(
    'doc',target_snapshot.doc,'version',next_version,'restoredSnapshotId',restored_id,
    'restoredFrom',jsonb_build_object('id',target_snapshot.id,'version',target_snapshot.version),
    'backup',jsonb_build_object('id',backup_id,'version',current_flow.version,'createdAt',backup_time)
  );
end;
$$;

-- Only the server service role may call this; the API still checks Clerk membership first.
revoke all on function public.restore_flow_version_safe(uuid,uuid,integer,timestamptz,text,text)
  from public, anon, authenticated;
grant execute on function public.restore_flow_version_safe(uuid,uuid,integer,timestamptz,text,text)
  to service_role;

notify pgrst, 'reload schema';
commit;
