-- ============================================================
-- 家庭菜谱 App 数据库结构 (Supabase / PostgreSQL)
-- 在 Supabase 控制台 → SQL Editor 里整段粘贴运行即可
-- ============================================================

-- 1) 全局设置（单行）：AI 配置 + 口味偏好，两人共用
create table if not exists settings (
  id            int primary key default 1,
  ai_api_key    text default '',
  ai_base_url   text default 'https://api.openai.com/v1',
  ai_model      text default 'gpt-4o-mini',
  prefs         jsonb default '{
    "cuisine": "广式",
    "spicy": false,
    "avoid": ["菌菇"],
    "health": "高血脂，需低盐低糖低脂",
    "redMeatMaxMeals": 2,
    "redMeatMaxGrams": 100
  }'::jsonb,
  updated_at    timestamptz default now(),
  constraint settings_singleton check (id = 1)
);
insert into settings (id) values (1) on conflict (id) do nothing;

-- 2) 每餐记录
create table if not exists meals (
  id          uuid primary key default gen_random_uuid(),
  date        date not null,
  meal_type   text not null check (meal_type in ('breakfast','lunch','dinner')),
  title       text not null default '',
  recipe      text default '',
  author      text default '',
  created_at  timestamptz default now(),
  unique (date, meal_type)
);

-- 3) 某餐的原材料（采购清单，可勾选）
create table if not exists ingredients (
  id          uuid primary key default gen_random_uuid(),
  meal_id     uuid references meals(id) on delete cascade,
  name        text not null,
  amount      text default '',
  bought      boolean default false,
  created_at  timestamptz default now()
);

-- 4) 预处理提醒（解冻/腌制/泡发等，提醒前一天准备）
create table if not exists preps (
  id          uuid primary key default gen_random_uuid(),
  meal_id     uuid references meals(id) on delete cascade,
  prep_date   date not null,          -- 需要动手处理的日期（通常是吃的前一天）
  item        text not null,
  kind        text default 'prep' check (kind in ('defrost','prep')),
  done        boolean default false,
  created_at  timestamptz default now()
);

create index if not exists idx_meals_date on meals(date);
create index if not exists idx_preps_date on preps(prep_date);
create index if not exists idx_ing_meal on ingredients(meal_id);

-- ============================================================
-- 行级安全：这是你和老婆私用的，开放给 anon 角色全权访问
-- （凭 anon key 即可读写；不公开 URL 就够安全）
-- ============================================================
alter table settings    enable row level security;
alter table meals       enable row level security;
alter table ingredients enable row level security;
alter table preps       enable row level security;

do $$
declare t text;
begin
  foreach t in array array['settings','meals','ingredients','preps'] loop
    execute format('drop policy if exists allow_all on %I;', t);
    execute format('create policy allow_all on %I for all using (true) with check (true);', t);
  end loop;
end $$;
