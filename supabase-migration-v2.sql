-- ============================================================
-- 家味 App 升级 v2：登录系统 + 健康说明 + 数据保留策略
-- 在 Supabase SQL Editor 整段运行（可重复运行，幂等）
-- ============================================================

-- 1) 用户表（简易登录，家人共用）
create table if not exists users (
  username      text primary key,
  password_hash text not null,      -- sha256(password + salt)
  salt          text not null,
  display_name  text default '',
  created_at    timestamptz default now()
);

-- 2) meals 增加健康说明字段
alter table meals add column if not exists health_note text default '';

-- 3) RLS：users 也开放给 anon（私用，凭 anon key 访问）
alter table users enable row level security;
do $$
begin
  execute 'drop policy if exists allow_all on users';
  execute 'create policy allow_all on users for all using (true) with check (true)';
end $$;

-- 4) 数据保留：删除「上上周一」之前的菜（仅保留最近 2 个自然周）
-- 以周一为一周起点。本周一往前推 7 天 = 上周一，再往前的都清掉。
create or replace function cleanup_old_meals() returns void as $$
declare
  this_monday date;
  keep_from   date;
begin
  -- PostgreSQL: date_trunc('week') 返回本周一
  this_monday := date_trunc('week', current_date)::date;
  keep_from   := this_monday - interval '7 days';  -- 保留上周一及以后
  delete from meals where date < keep_from;
end;
$$ language plpgsql;

-- 说明：可在 Supabase 后台用 pg_cron 定时调用 cleanup_old_meals()，
-- 或由前端在加载时按需调用（本项目采用前端按需触发，见 lib/db.ts）。
