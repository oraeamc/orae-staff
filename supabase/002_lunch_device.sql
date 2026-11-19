-- 점심값 + 병원 기기(IP 자동 갱신) 기능 추가
-- ※ schema.sql 을 이미 실행한 경우에만 이 파일을 SQL Editor에서 한 번 실행하세요.
--   (처음 설치라면 schema.sql 에 이미 들어 있으니 실행하지 않아도 됩니다)

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
