-- 직원별 정규 퇴근 시각 (자동 퇴근에 사용, 비어 있으면 설정의 기본값)
-- ※ 이미 설치한 경우에만 실행 (처음 설치라면 schema.sql 에 포함되어 있음)
alter table public.profiles add column if not exists work_end time;

create or replace function public.close_stale_attendance() returns integer
language plpgsql security definer set search_path = public as $$
declare n integer; endt time;
begin
  select work_end into endt from public.settings where id = 1;
  update public.attendance a
     set clock_out = greatest(a.clock_in, (a.work_date + coalesce(p.work_end, endt)) at time zone 'Asia/Seoul'),
         auto_out = true,
         edit_note = coalesce(a.edit_note, '퇴근 미체크 → 자동 퇴근 처리')
    from public.profiles p
   where p.id = a.user_id
     and a.clock_out is null and a.clock_in is not null
     and a.work_date < (now() at time zone 'Asia/Seoul')::date
     and not exists (select 1 from public.shifts s where s.user_id = a.user_id and s.work_date = a.work_date and s.kind = 'night'
                     and now() < ((a.work_date + 1) + time '12:00') at time zone 'Asia/Seoul');
  get diagnostics n = row_count;
  return n;
end $$;
