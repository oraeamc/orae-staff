-- 직원별 정규 출근 시각 (화면 표시·지각 표시에 사용, 비어 있으면 설정의 기본값)
-- ※ 이미 설치한 경우에만 실행 (처음 설치라면 schema.sql 에 포함되어 있음)
alter table public.profiles add column if not exists work_start time;
alter table public.settings add column if not exists work_start time not null default '09:30';
