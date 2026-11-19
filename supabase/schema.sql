-- 오래동물의료센터 직원관리 — Supabase 데이터베이스 설정
-- Supabase 대시보드 > SQL Editor 에 이 파일 전체를 붙여넣고 Run 하세요. (한 번만)

-- ───────── 테이블 ─────────
create table if not exists public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  name text not null default '',
  login_id text unique,
  role text not null default 'staff' check (role in ('admin','staff')),   -- admin = 원장(관리 권한)
  job text not null default '테크니션',
  hire_date date,
  is_employee boolean not null default true,   -- 근로자 여부 (5인 계산·연차 대상). 대표원장은 false
  active boolean not null default true,         -- 퇴사 시 false
  leave_adjust numeric not null default 0,      -- 연차 수동 가감(이월·포상 등)
  created_at timestamptz not null default now()
);

create table if not exists public.settings (
  id int primary key default 1 check (id = 1),
  allowed_ips text[] not null default '{}',     -- 출퇴근 허용 병원 공인 IP
  leave_mode text not null default 'custom' check (leave_mode in ('legal','custom')),
  legal_threshold int not null default 5,       -- 근로자 수가 이 이상이면 법 기준 자동 적용
  custom_annual_days numeric not null default 15,
  custom_first_year_monthly boolean not null default true,
  custom_seniority boolean not null default false,
  regular_hours text not null default '09:00–18:00',
  updated_at timestamptz not null default now()
);
insert into public.settings (id) values (1) on conflict (id) do nothing;

create table if not exists public.attendance (
  id bigint generated always as identity primary key,
  user_id uuid not null references public.profiles(id) on delete cascade,
  work_date date not null,
  clock_in timestamptz,
  clock_out timestamptz,
  in_ip text,
  out_ip text,
  edited_by uuid references public.profiles(id),
  edit_note text,
  edited_at timestamptz,
  unique (user_id, work_date)
);

create table if not exists public.leave_requests (
  id bigint generated always as identity primary key,
  user_id uuid not null references public.profiles(id) on delete cascade,
  kind text not null check (kind in ('full','am','pm')),
  start_date date not null,
  end_date date not null,
  days numeric not null,
  reason text,
  status text not null default 'pending' check (status in ('pending','approved','rejected')),
  decided_by uuid references public.profiles(id),
  decided_at timestamptz,
  created_at timestamptz not null default now(),
  check (end_date >= start_date)
);

create table if not exists public.shifts (
  id bigint generated always as identity primary key,
  user_id uuid not null references public.profiles(id) on delete cascade,
  work_date date not null,
  kind text not null check (kind in ('regular','night','weekend','off')),
  unique (user_id, work_date)
);

-- ───────── 권한 확인 함수 ─────────
create or replace function public.is_admin() returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.profiles where id = auth.uid() and role = 'admin' and active);
$$;

-- 계정이 만들어지면 프로필 자동 생성. 맨 처음 만든 계정은 자동으로 원장(admin).
create or replace function public.handle_new_user() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  insert into public.profiles (id, name, login_id, role, is_employee)
  values (
    new.id,
    coalesce(new.raw_user_meta_data->>'name', split_part(new.email, '@', 1)),
    split_part(new.email, '@', 1),
    case when exists (select 1 from public.profiles) then 'staff' else 'admin' end,
    case when exists (select 1 from public.profiles) then true else false end
  );
  return new;
end $$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created after insert on auth.users
  for each row execute function public.handle_new_user();

-- ───────── 보안 규칙 (RLS) ─────────
alter table public.profiles enable row level security;
alter table public.settings enable row level security;
alter table public.attendance enable row level security;
alter table public.leave_requests enable row level security;
alter table public.shifts enable row level security;

-- 프로필: 로그인한 직원 모두 열람(근무표 이름 표시용), 수정은 원장만
create policy "profiles read" on public.profiles for select to authenticated using (true);
create policy "profiles admin update" on public.profiles for update to authenticated using (public.is_admin()) with check (public.is_admin());

-- 설정: 모두 열람, 수정은 원장만
create policy "settings read" on public.settings for select to authenticated using (true);
create policy "settings admin update" on public.settings for update to authenticated using (public.is_admin()) with check (public.is_admin());

-- 출퇴근: 본인 기록만 열람(원장은 전체). 직원은 직접 쓸 수 없고 서버(Wi-Fi 확인)만 기록.
create policy "attendance read" on public.attendance for select to authenticated using (user_id = auth.uid() or public.is_admin());
create policy "attendance admin insert" on public.attendance for insert to authenticated with check (public.is_admin());
create policy "attendance admin update" on public.attendance for update to authenticated using (public.is_admin()) with check (public.is_admin());
create policy "attendance admin delete" on public.attendance for delete to authenticated using (public.is_admin());

-- 연차: 본인 신청 + 승인된 연차(근무표 표시용) 열람, 원장은 전체
create policy "leave read" on public.leave_requests for select to authenticated
  using (user_id = auth.uid() or status = 'approved' or public.is_admin());
create policy "leave own insert" on public.leave_requests for insert to authenticated
  with check (user_id = auth.uid() and status = 'pending' and decided_by is null);
create policy "leave admin update" on public.leave_requests for update to authenticated using (public.is_admin()) with check (public.is_admin());
create policy "leave delete" on public.leave_requests for delete to authenticated
  using ((user_id = auth.uid() and status = 'pending') or public.is_admin());

-- 근무표: 모두 열람, 편집은 원장만
create policy "shifts read" on public.shifts for select to authenticated using (true);
create policy "shifts admin insert" on public.shifts for insert to authenticated with check (public.is_admin());
create policy "shifts admin update" on public.shifts for update to authenticated using (public.is_admin()) with check (public.is_admin());
create policy "shifts admin delete" on public.shifts for delete to authenticated using (public.is_admin());

-- ───────── 점심값 ─────────
alter table public.settings add column if not exists lunch_support int not null default 8000;  -- 1일 지원 한도(원)

create table if not exists public.lunch_expenses (
  id bigint generated always as identity primary key,
  user_id uuid not null references public.profiles(id) on delete cascade,
  spend_date date not null,
  amount int not null check (amount >= 0 and amount <= 1000000),
  memo text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (user_id, spend_date)
);

alter table public.lunch_expenses enable row level security;

-- 본인 것만 입력·수정·삭제, 원장은 전체
create policy "lunch read" on public.lunch_expenses for select to authenticated
  using (user_id = auth.uid() or public.is_admin());
create policy "lunch insert" on public.lunch_expenses for insert to authenticated
  with check (user_id = auth.uid() or public.is_admin());
create policy "lunch update" on public.lunch_expenses for update to authenticated
  using (user_id = auth.uid() or public.is_admin()) with check (user_id = auth.uid() or public.is_admin());
create policy "lunch delete" on public.lunch_expenses for delete to authenticated
  using (user_id = auth.uid() or public.is_admin());

-- ───────── 병원 기기 (공인 IP 자동 갱신) ─────────
create table if not exists public.hospital_devices (
  id bigint generated always as identity primary key,
  name text not null default '병원 기기',
  token_hash text not null unique,
  last_ip text,
  last_seen timestamptz,
  created_by uuid references public.profiles(id),
  created_at timestamptz not null default now()
);
alter table public.hospital_devices enable row level security;
-- 원장만 목록 보기·삭제. 등록·갱신은 서버만.
create policy "devices admin read" on public.hospital_devices for select to authenticated using (public.is_admin());
create policy "devices admin delete" on public.hospital_devices for delete to authenticated using (public.is_admin());

-- ───────── 권한 (새 Supabase 프로젝트는 자동으로 주지 않음) ─────────
grant usage on schema public to authenticated, service_role;
grant select, insert, update, delete on public.profiles, public.settings, public.attendance, public.leave_requests, public.shifts, public.lunch_expenses, public.hospital_devices to authenticated, service_role;
grant usage, select on all sequences in schema public to authenticated, service_role;
grant execute on function public.is_admin() to authenticated, service_role;

-- ───────── 직원 직접 가입 + 원장 승인 ─────────
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

-- ───────── 고정 휴무 요일 ─────────
alter table public.profiles add column if not exists weekly_off smallint[] not null default '{}';

-- ───────── 승인된 연차 취소 ─────────
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

-- ───────── 1년 미만 일괄 지급 + 가감 기간 ─────────
alter table public.settings add column if not exists custom_first_year_upfront boolean not null default false;
alter table public.settings add column if not exists custom_first_year_days numeric not null default 11;
alter table public.profiles add column if not exists leave_adjust_period date;  -- 가감을 적용할 연차 기간 시작일

-- 연차 관리 대상(근로자 여부와 별개)
alter table public.profiles add column if not exists track_leave boolean not null default true;

-- 당직 사용 여부 (기본: 사용 안 함)
alter table public.settings add column if not exists use_duty boolean not null default false;
