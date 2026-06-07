-- ============================================================
-- 家味 App 升级 v5
-- preps 增加 prep_time：建议开始处理的时间（HH:MM），用于排序
-- 在 Supabase SQL Editor 整段运行（幂等，可重复跑）
-- ============================================================

alter table preps add column if not exists prep_time text;
