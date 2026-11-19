-- 직원 직접 가입 신청 + 원장 승인
-- ※ 이미 설치한 경우에만 실행 (처음 설치라면 schema.sql 에 포함되어 있음)

alter table public.profiles add column if not exists approved boolean not null default true;

-- 승인된 재직 직원인지
create or replace function public.is_member() returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.profiles where id = auth.uid() and active and approved);
$$;
grant execute on function public.is_member() to authenticated, service_role;

create or replace function public.is_admin() returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.profiles where id = auth.uid() and role = 'admin' and active and approved);
$$;

-- 직접 가입한 계정은 승인 대기(approved=false)로 생성
create or replace function public.handle_new_user() returns trigger
language plpgsql security definer set search_path = public as $$
declare first boolean := not exists (select 1 from public.profiles);
begin
  insert into public.profiles (id, name, login_id, role, is_employee, approved)
  values (
    new.id,
    coalesce(new.raw_user_meta_data->>'name', split_part(new.email, '@', 1)),
    split_part(new.email, '@', 1),
    case when first then 'admin' else 'staff' end,
    not first,
    coalesce(new.raw_user_meta_data->>'self_signup', '') <> 'true'
  );
  return new;
end $$;

-- 승인 전 계정은 다른 사람 정보·근무표·설정을 못 보고, 신청·입력도 못 함
drop policy if exists "profiles read" on public.profiles;
create policy "profiles read" on public.profiles for select to authenticated using (id = auth.uid() or public.is_member());

drop policy if exists "settings read" on public.settings;
create policy "settings read" on public.settings for select to authenticated using (public.is_member());

drop policy if exists "shifts read" on public.shifts;
create policy "shifts read" on public.shifts for select to authenticated using (public.is_member());

drop policy if exists "leave read" on public.leave_requests;
create policy "leave read" on public.leave_requests for select to authenticated
  using (user_id = auth.uid() or (status = 'approved' and public.is_member()) or public.is_admin());
drop policy if exists "leave own insert" on public.leave_requests;
create policy "leave own insert" on public.leave_requests for insert to authenticated
  with check (user_id = auth.uid() and status = 'pending' and decided_by is null and public.is_member());

drop policy if exists "lunch insert" on public.lunch_expenses;
create policy "lunch insert" on public.lunch_expenses for insert to authenticated
  with check ((user_id = auth.uid() and public.is_member()) or public.is_admin());
drop policy if exists "lunch update" on public.lunch_expenses;
create policy "lunch update" on public.lunch_expenses for update to authenticated
  using ((user_id = auth.uid() and public.is_member()) or public.is_admin())
  with check ((user_id = auth.uid() and public.is_member()) or public.is_admin());
