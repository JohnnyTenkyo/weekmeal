-- ============================================================
-- 家味 App 升级 v4
-- 1) meals 增加 health_conflict：标记自填菜是否与健康状况相背离
-- 在 Supabase SQL Editor 整段运行（幂等，可重复跑）
-- ============================================================

alter table meals add column if not exists health_conflict boolean default false;
