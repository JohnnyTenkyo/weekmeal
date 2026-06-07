-- ============================================================
-- 家味 App 升级 v3：数据按账号隔离
-- 每个账号有独立的菜单和健康偏好；AI 配置仍全局共享
-- 在 Supabase SQL Editor 整段运行（幂等，可重复跑）
-- ============================================================

-- 1) meals 增加 owner（归属账号）
alter table meals add column if not exists owner text default '';

-- 1b) preps 也增加 owner（手动添加的提醒可能没有关联菜）
alter table preps add column if not exists owner text default '';

-- 2) 唯一约束从 (date, meal_type) 改为 (owner, date, meal_type)
--    这样不同账号同一天同一餐互不冲突
do $$
begin
  if exists (
    select 1 from pg_constraint
    where conname = 'meals_date_meal_type_key'
  ) then
    alter table meals drop constraint meals_date_meal_type_key;
  end if;
exception when others then null;
end $$;

-- 兼容不同自动命名：再尝试按列组合查找并删除旧唯一约束
do $$
declare c text;
begin
  select conname into c from pg_constraint
   where conrelid = 'meals'::regclass and contype = 'u'
     and array_length(conkey,1) = 2
   limit 1;
  if c is not null then
    execute format('alter table meals drop constraint %I', c);
  end if;
exception when others then null;
end $$;

create unique index if not exists meals_owner_date_meal on meals(owner, date, meal_type);

-- 3) users 表存每个用户独立的健康/口味偏好（prefs）
alter table users add column if not exists prefs jsonb default '{
  "cuisine": "广式",
  "spicy": false,
  "avoid": ["菌菇"],
  "health": "高血脂，需要清淡健康饮食，低盐低糖低脂",
  "redMeatMaxMeals": 2,
  "redMeatMaxGrams": 100
}'::jsonb;

-- 4) 把现有(全局)菜归到第一个账号名下，避免历史数据丢失
--    将 owner 为空的 meals 赋给最早创建的用户
do $$
declare first_user text;
begin
  select username into first_user from users order by created_at asc limit 1;
  if first_user is not null then
    update meals set owner = first_user where owner = '' or owner is null;
    -- preps：有关联菜的取菜的 owner，其余归第一个用户
    update preps p set owner = m.owner from meals m where p.meal_id = m.id and (p.owner = '' or p.owner is null);
    update preps set owner = first_user where owner = '' or owner is null;
  end if;
end $$;

-- 5) 数据保留：清理函数也按 owner 维度（仍只保留最近 2 周）
create or replace function cleanup_old_meals_for(p_owner text) returns void as $$
declare
  this_monday date;
  keep_from   date;
begin
  this_monday := date_trunc('week', current_date)::date;
  keep_from   := this_monday - interval '7 days';
  delete from meals where owner = p_owner and date < keep_from;
end;
$$ language plpgsql;
