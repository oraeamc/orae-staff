-- 승인된 연차 취소 (직원 취소 요청 → 원장 승인, 또는 원장이 바로 취소)
-- ※ 이미 설치한 경우에만 실행 (처음 설치라면 schema.sql 에 포함되어 있음)

alter table public.leave_requests drop constraint if exists leave_requests_status_check;
alter table public.leave_requests add constraint leave_requests_status_check
  check (status in ('pending','approved','rejected','cancel_requested','cancelled'));

-- 직원이 본인의 승인된(아직 끝나지 않은) 연차에 취소 요청
create or replace function public.request_leave_cancel(p_id bigint) returns void
language plpgsql security definer set search_path = public as $$
begin
  update public.leave_requests set status = 'cancel_requested'
   where id = p_id and user_id = auth.uid() and status = 'approved'
     and end_date >= (now() at time zone 'Asia/Seoul')::date
     and public.is_member();
  if not found then raise exception '취소 요청할 수 없는 연차예요.'; end if;
end $$;
revoke all on function public.request_leave_cancel(bigint) from public, anon;
grant execute on function public.request_leave_cancel(bigint) to authenticated;

-- 취소 요청 중인 연차도 확정될 때까지는 근무표·잔여 계산에 그대로 반영
drop policy if exists "leave read" on public.leave_requests;
create policy "leave read" on public.leave_requests for select to authenticated
  using (user_id = auth.uid() or (status in ('approved','cancel_requested') and public.is_member()) or public.is_admin());
