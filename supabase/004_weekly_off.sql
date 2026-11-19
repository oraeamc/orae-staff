-- 직원별 고정 휴무 요일 (0=일 … 6=토)
-- ※ 이미 설치한 경우에만 실행 (처음 설치라면 schema.sql 에 포함되어 있음)
alter table public.profiles add column if not exists weekly_off smallint[] not null default '{}';
