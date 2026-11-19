-- 1년 미만 직원 연차를 입사 시 한 번에 지급하는 옵션 + 연차 가감을 '해당 연도에만' 적용
-- ※ 이미 설치한 경우에만 실행 (처음 설치라면 schema.sql 에 포함되어 있음)
alter table public.settings add column if not exists custom_first_year_upfront boolean not null default false;
alter table public.settings add column if not exists custom_first_year_days numeric not null default 11;
alter table public.profiles add column if not exists leave_adjust_period date;  -- 가감을 적용할 연차 기간 시작일

-- 연차 관리 대상(근로자 여부와 별개)
alter table public.profiles add column if not exists track_leave boolean not null default true;
