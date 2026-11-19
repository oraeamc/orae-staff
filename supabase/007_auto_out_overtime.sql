-- 퇴근 미체크 시 자동 퇴근 처리 + 추가근무 신청(30분 단위)
-- ※ 이미 설치한 경우에만 실행 (처음 설치라면 schema.sql 에 포함되어 있음)

alter table public.settings add column if not exists work_end time not null default '18:00';   -- 자동 퇴근 시각
alter table public.attendance add column if not exists auto_out boolean not null default false;

-- 지난 날짜의 퇴근 안 한 기록을 정규 퇴근 시각으로 닫음 (앱을 열 때마다 실행, 여러 번 실행해도 안전)
create or replace function public.close_stale_attendance() returns integer
language plpgsql security definer set search_path = public as $$
declare n integer; endt time;
begin
  select work_end into endt from public.settings where id = 1;
  update public.attendance a
     set clock_out = greatest(a.clock_in, (a.work_date + endt) at time zone 'Asia/Seoul'),
         auto_out = true,
         edit_note = coalesce(a.edit_note, '퇴근 미체크 → 자동 퇴근 처리')
   where a.clock_out is null and a.clock_in is not null
     and a.work_date < (now() at time zone 'Asia/Seoul')::date
     -- 야간당직은 다음 날 정오까지 기다림
     and not exists (select 1 from public.shifts s where s.user_id = a.user_id and s.work_date = a.work_date and s.kind = 'night'
                     and now() < ((a.work_date + 1) + time '12:00') at time zone 'Asia/Seoul');
  get diagnostics n = row_count;
  return n;
end $$;
revoke all on function public.close_stale_attendance() from public, anon;
grant execute on function public.close_stale_attendance() to authenticated, service_role;

create table if not exists public.overtime_requests (
  id bigint generated always as identity primary key,
  user_id uuid not null references public.profiles(id) on delete cascade,
  work_date date not null,
  minutes int not null check (minutes > 0 and minutes <= 960 and minutes % 30 = 0),
  reason text,
  status text not null default 'pending' check (status in ('pending','approved','rejected')),
  decided_by uuid references public.profiles(id),
  decided_at timestamptz,
  created_at timestamptz not null default now()
);
alter table public.overtime_requests enable row level security;
grant select, insert, update, delete on public.overtime_requests to authenticated, service_role;
grant usage, select on all sequences in schema public to authenticated, service_role;

create policy "ot read" on public.overtime_requests for select to authenticated
  using (user_id = auth.uid() or public.is_admin());
create policy "ot own insert" on public.overtime_requests for insert to authenticated
  with check (user_id = auth.uid() and status = 'pending' and decided_by is null and public.is_member());
create policy "ot admin update" on public.overtime_requests for update to authenticated
  using (public.is_admin()) with check (public.is_admin());
create policy "ot delete" on public.overtime_requests for delete to authenticated
  using ((user_id = auth.uid() and status = 'pending') or public.is_admin());
