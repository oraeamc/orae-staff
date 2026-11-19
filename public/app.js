import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import {
  DOW, kstToday, addDays, dowOf, mondayOf, md, daysBetween,
  employeeCount, effectiveMode, leaveInfo, requestDays,
} from './leave.js';

const LOGIN_DOMAIN = 'orae.staff';
const SHIFT = {
  regular: { label: '정규', cls: 's-reg' },
  night: { label: '야간당직', cls: 's-duty' },
  weekend: { label: '주말당직', cls: 's-duty' },
  off: { label: '휴무', cls: 's-off' },
};
const CYCLE = [null, 'regular', 'night', 'weekend', 'off'];
const KIND = { full: '연차', am: '오전 반차', pm: '오후 반차' };
const STATUS = { pending: '승인 대기', approved: '승인', rejected: '반려', cancel_requested: '취소 요청 중', cancelled: '취소됨' };
const LIVE = ['approved', 'cancel_requested']; // 확정된(사용 중인) 연차

const ICON = {
  clock: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><circle cx="12" cy="12" r="9"/><polyline points="12 7 12 12 15 14"/></svg>',
  cal: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><rect x="3" y="4" width="18" height="17" rx="2"/><line x1="3" y1="9" x2="21" y2="9"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="16" y1="2" x2="16" y2="6"/></svg>',
  grid: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><rect x="3" y="3" width="7" height="7"/><rect x="14" y="3" width="7" height="7"/><rect x="3" y="14" width="7" height="7"/><rect x="14" y="14" width="7" height="7"/></svg>',
  check: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M9 11l3 3 8-8"/><path d="M20 12v7a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h9"/></svg>',
  users: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><circle cx="9" cy="8" r="4"/><path d="M2 21a7 7 0 0 1 14 0"/><path d="M16 3.5a4 4 0 0 1 0 9"/><path d="M22 21a7 7 0 0 0-4-6.3"/></svg>',
  meal: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M7 2v20"/><path d="M4 2v6a3 3 0 0 0 6 0V2"/><path d="M17 22V2c-2.2 0-4 2.7-4 6s1.8 5 4 5"/></svg>',
  wifi: '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M5 12.55a11 11 0 0 1 14.08 0"/><path d="M1.42 9a16 16 0 0 1 21.16 0"/><path d="M8.53 16.11a6 6 0 0 1 6.95 0"/><line x1="12" y1="20" x2="12.01" y2="20"/></svg>',
};

const TABS_STAFF = [
  { id: 'home', label: '출퇴근', icon: 'clock' },
  { id: 'leave', label: '연차', icon: 'cal' },
  { id: 'schedule', label: '근무표', icon: 'grid' },
  { id: 'lunch', label: '점심', icon: 'meal' },
];
const TABS_ADMIN = [
  ...TABS_STAFF,
  { id: 'manage', label: '관리', icon: 'check' },
  { id: 'people', label: '직원·설정', short: '설정', icon: 'users' },
];
const DEVICE_KEY = 'orae_device_token';
function getDeviceToken() { try { return localStorage.getItem(DEVICE_KEY); } catch { return null; } }
function setDeviceToken(t) { try { t ? localStorage.setItem(DEVICE_KEY, t) : localStorage.removeItem(DEVICE_KEY); } catch { /* 저장 불가 브라우저 */ } }

let sb;
const state = {
  session: null, me: null, profiles: [], settings: null,
  tab: 'home', weekStart: null, leaveKind: 'full', logMonth: null, logUser: '',
  lunchMonth: null, lunchEdit: null,
};
const $app = document.getElementById('app');

// ───────── 유틸 ─────────
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const isAdmin = () => state.me?.role === 'admin';
const nameOf = (id) => state.profiles.find((p) => p.id === id)?.name || '알 수 없음';
const fmtTime = (iso) => iso ? new Date(iso).toLocaleTimeString('ko-KR', { timeZone: 'Asia/Seoul', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }) : '—';
const kstIso = (date, hhmm) => new Date(`${date}T${hhmm}:00+09:00`).toISOString();
const num = (n) => (Math.round(Number(n) * 10) / 10).toString();
function hours(a, b) { if (!a || !b) return ''; const h = (new Date(b) - new Date(a)) / 3600000; return h > 0 ? `${num(h)}시간` : ''; }
function activePeople() {
  return state.profiles.filter((p) => p.active && p.approved !== false).sort((a, b) => (a.role === b.role ? a.name.localeCompare(b.name, 'ko') : a.role === 'admin' ? -1 : 1));
}

// 그날의 실제 근무: 원장님이 직접 지정한 칸 > 고정 휴무 요일(휴무) > 기본(정규)
function effShift(p, date, shifts) {
  const sh = shifts.find((s) => s.user_id === p.id && s.work_date === date);
  if (sh) return { kind: sh.kind, auto: false };
  if ((p.weekly_off || []).includes(dowOf(date))) return { kind: 'off', auto: true };
  return { kind: 'regular', auto: true };
}

// 화면 안 확인창 (브라우저 기본 확인창은 일부 앱·홈화면 앱에서 막힘)
function ask(message, { input = false, value = '', placeholder = '', ok = '확인', danger = false } = {}) {
  return new Promise((resolve) => {
    const wrap = document.createElement('div');
    wrap.className = 'modal-back';
    wrap.innerHTML = `<form class="modal card" role="dialog" aria-modal="true">
      <p style="margin:0;font-size:15px;line-height:1.5">${esc(message)}</p>
      ${input ? `<input type="text" name="v" value="${esc(value)}" placeholder="${esc(placeholder)}" aria-label="${esc(message)}">` : ''}
      <div class="grid2"><button type="button" class="btn" data-x="cancel">닫기</button><button type="submit" class="btn primary ${danger ? 'danger-fill' : ''}">${esc(ok)}</button></div>
    </form>`;
    const done = (v) => { wrap.remove(); resolve(v); };
    wrap.addEventListener('click', (e) => { if (e.target === wrap || e.target.dataset.x === 'cancel') done(input ? null : false); });
    wrap.querySelector('form').addEventListener('submit', (e) => { e.preventDefault(); e.stopPropagation(); done(input ? wrap.querySelector('[name=v]').value : true); });
    document.body.appendChild(wrap);
    (wrap.querySelector('[name=v]') || wrap.querySelector('[type=submit]')).focus();
  });
}

// 화면 안 선택창: 고른 값 반환, 닫으면 null
function choose(title, options, current) {
  return new Promise((resolve) => {
    const wrap = document.createElement('div');
    wrap.className = 'modal-back';
    wrap.innerHTML = `<div class="modal card" role="dialog" aria-modal="true" aria-label="${esc(title)}">
      <h2>${esc(title)}</h2>
      <div class="choices">${options.map((o, i) => `<button type="button" class="btn ${o.v === current ? 'primary' : ''}" data-i="${i}">${esc(o.label)}${o.v === current ? ' ✓' : ''}</button>`).join('')}</div>
      <button type="button" class="btn ghost" data-x="cancel">닫기</button>
    </div>`;
    const done = (v) => { wrap.remove(); resolve(v); };
    wrap.addEventListener('click', (e) => {
      if (e.target === wrap || e.target.dataset.x === 'cancel') return done(null);
      const btn = e.target.closest('[data-i]');
      if (btn) done(options[Number(btn.dataset.i)].v);
    });
    document.body.appendChild(wrap);
    wrap.querySelector('[data-i]').focus();
  });
}

const hm = (t) => (t || '').slice(0, 5);
const startOf = (p) => hm(p?.work_start || state.settings?.work_start || '09:30');
const endOf = (p) => hm(p?.work_end || state.settings?.work_end || '18:00');
// 지각 분: 출근 시각이 정규 출근 시각보다 늦은 만큼 (고정 패턴상 정규 근무일만)
function lateMin(p, rec, kind = 'regular') {
  if (!p || !rec?.clock_in || kind !== 'regular') return 0;
  const d = (new Date(rec.clock_in) - new Date(`${rec.work_date}T${startOf(p)}:00+09:00`)) / 60000;
  return d >= 1 ? Math.floor(d) : 0;
}
const OT_OPTIONS = Array.from({ length: 16 }, (_, i) => (i + 1) * 30); // 30분 ~ 8시간
const fmtMin = (m) => { m = Number(m) || 0; const h = Math.floor(m / 60), mm = m % 60; return h && mm ? `${h}시간 ${mm}분` : h ? `${h}시간` : `${mm}분`; };

let toastTimer;
function toast(msg) {
  const t = document.getElementById('toast');
  t.textContent = msg; t.classList.add('show');
  clearTimeout(toastTimer); toastTimer = setTimeout(() => t.classList.remove('show'), 2600);
}
function must(res) { if (res.error) throw res.error; return res.data; }

async function api(path, opts = {}) {
  const { data: { session } } = await sb.auth.getSession();
  const r = await fetch(path, {
    ...opts,
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${session?.access_token || ''}`, ...(opts.headers || {}) },
  });
  const j = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(j.error || '요청에 실패했어요.');
  return j;
}

// ───────── 시작 ─────────
async function boot() {
  try {
    const cfg = await fetch('/api/config').then((r) => r.json());
    if (!cfg.url || !cfg.anonKey) throw new Error('config');
    sb = createClient(cfg.url, cfg.anonKey);
    startHeartbeat();
  } catch {
    $app.innerHTML = '<div class="login"><div class="card"><h2>설정이 필요해요</h2><p class="sub">Vercel 환경변수(SUPABASE_URL, SUPABASE_ANON_KEY)를 확인해 주세요.</p></div></div>';
    return;
  }
  const { data: { session } } = await sb.auth.getSession();
  state.session = session;
  sb.auth.onAuthStateChange((_e, s) => {
    const was = !!state.session; state.session = s;
    if (!s && was) renderLogin();
  });
  if (!session) return renderLogin();
  await loadBase();
  render();
}

async function loadBase() {
  state.profiles = must(await sb.from('profiles').select('*'));
  state.me = state.profiles.find((p) => p.id === state.session.user.id) || null;
  // 승인 전 계정은 설정을 읽을 수 없음
  if (state.me && state.me.active && state.me.approved !== false) {
    state.settings = must(await sb.from('settings').select('*').eq('id', 1).single());
    await sb.rpc('close_stale_attendance'); // 지난날 퇴근 미체크 → 정규 퇴근 시각으로 자동 처리
  }
}

// ───────── 로그인 ─────────
function renderLogin(msg = '') {
  $app.innerHTML = `
  <div class="login"><form class="card" data-form="login">
    <div class="brand"><b>ORAE</b><span>직원관리</span></div>
    <h1>로그인</h1>
    <label class="f">아이디<input type="text" name="uid" autocomplete="username" autocapitalize="none" required></label>
    <label class="f">비밀번호<input type="password" name="pw" autocomplete="current-password" required></label>
    <div class="err">${esc(msg)}</div>
    <button class="btn primary" type="submit">로그인</button>
    <button class="btn ghost" type="button" data-action="showSignup">처음이세요? 가입 신청</button>
  </form></div>`;
}

function renderSignup(msg = '', done = false) {
  $app.innerHTML = done ? `
  <div class="login"><div class="card">
    <div class="brand"><b>ORAE</b><span>직원관리</span></div>
    <h1>가입 신청 완료</h1>
    <p class="sub">원장님이 승인하면 바로 로그인할 수 있어요.</p>
    <button class="btn primary" data-action="showLogin">로그인 화면으로</button>
  </div></div>` : `
  <div class="login"><form class="card" data-form="signup">
    <div class="brand"><b>ORAE</b><span>직원관리</span></div>
    <h1>가입 신청</h1>
    <p class="small">병원 Wi-Fi에 연결된 상태에서 신청해 주세요. 원장님 승인 후 사용할 수 있어요.</p>
    <label class="f">이름<input type="text" name="name" maxlength="30" required></label>
    <label class="f">아이디 (영문 소문자·숫자 3~30자)<input type="text" name="login_id" autocomplete="username" autocapitalize="none" pattern="[a-z0-9._\\-]{3,30}" required></label>
    <label class="f">비밀번호 (8자 이상)<input type="password" name="password" autocomplete="new-password" minlength="8" required></label>
    <label class="f">비밀번호 확인<input type="password" name="password2" autocomplete="new-password" minlength="8" required></label>
    <div class="err">${esc(msg)}</div>
    <button class="btn primary" type="submit">가입 신청</button>
    <button class="btn ghost" type="button" data-action="showLogin">로그인 화면으로</button>
  </form></div>`;
}

// ───────── 화면 틀 ─────────
function render() {
  if (!state.me) {
    $app.innerHTML = '<div class="login"><div class="card"><h2>계정 정보를 찾을 수 없어요</h2><p class="sub">원장님께 문의해 주세요.</p><button class="btn" data-action="logout">로그아웃</button></div></div>';
    return;
  }
  if (!state.me.active) {
    $app.innerHTML = '<div class="login"><div class="card"><h2>사용이 중지된 계정이에요</h2><button class="btn" data-action="logout">로그아웃</button></div></div>';
    return;
  }
  if (state.me.approved === false) {
    $app.innerHTML = `<div class="login"><div class="card"><div class="brand"><b>ORAE</b><span>직원관리</span></div><h2>${esc(state.me.name)}님, 승인을 기다리고 있어요</h2><p class="sub">원장님이 승인하면 바로 사용할 수 있어요.</p><button class="btn primary" data-action="recheck">승인됐는지 확인</button><button class="btn ghost" data-action="logout">로그아웃</button></div></div>`;
    return;
  }
  const tabs = isAdmin() ? TABS_ADMIN : TABS_STAFF;
  if (!tabs.some((t) => t.id === state.tab)) state.tab = 'home';
  const navBtn = (t) => `<button type="button" data-action="tab" data-tab="${t.id}" ${state.tab === t.id ? 'aria-current="page"' : ''}>`;
  $app.innerHTML = `
  <div class="shell">
    <header class="topbar"><div class="topbar-in">
      <div class="brand"><b>ORAE</b><span>직원관리</span></div>
      <nav class="topnav" aria-label="메뉴">${tabs.map((t) => `${navBtn(t)}${t.label}</button>`).join('')}</nav>
      <div class="who">${esc(state.me.name)} ${isAdmin() ? '원장' : ''}<button class="btn sm ghost" data-action="logout">로그아웃</button></div>
    </div></header>
    <main id="view"><div class="loading">불러오는 중…</div></main>
    <nav class="tabbar" aria-label="메뉴">${tabs.map((t) => `${navBtn(t)}${ICON[t.icon]}${t.short || t.label}</button>`).join('')}</nav>
  </div>`;
  renderView();
}

async function renderView() {
  const el = document.getElementById('view');
  if (!el) return;
  const views = { home: viewHome, leave: viewLeave, schedule: viewSchedule, lunch: viewLunch, manage: viewManage, people: viewPeople };
  try {
    el.innerHTML = await views[state.tab]();
  } catch (e) {
    console.error(e);
    el.innerHTML = `<div class="card"><h2>불러오지 못했어요</h2><p class="sub">${esc(e.message || e)}</p><button class="btn" data-action="reload">다시 시도</button></div>`;
  }
}

async function approvedLeaves(userId) {
  let q = sb.from('leave_requests').select('*').in('status', LIVE);
  if (userId) q = q.eq('user_id', userId);
  return must(await q);
}

// ───────── 출퇴근 ─────────
async function viewHome() {
  const me = state.me; const today = kstToday();
  const monthStart = `${today.slice(0, 7)}-01`;
  const [net, recs, shifts, leaves, ots] = await Promise.all([
    api('/api/clock').catch((e) => ({ error: e.message })),
    sb.from('attendance').select('*').eq('user_id', me.id).gte('work_date', addDays(today, -14)).order('work_date', { ascending: false }).then(must),
    sb.from('shifts').select('*').eq('user_id', me.id).gte('work_date', today).lte('work_date', addDays(today, 13)).order('work_date').then(must),
    approvedLeaves(me.id),
    sb.from('overtime_requests').select('*').eq('user_id', me.id).gte('work_date', addDays(today, -40)).order('work_date', { ascending: false }).then(must),
  ]);
  const open = recs.find((r) => r.clock_in && !r.clock_out);
  const autoMissed = recs.filter((r) => r.auto_out && r.work_date >= addDays(today, -3) && !ots.some((o) => o.work_date === r.work_date));
  const otMonth = ots.filter((o) => o.status === 'approved' && o.work_date >= monthStart).reduce((a, o) => a + o.minutes, 0);
  const otDate = state.otDate || today;
  const todayRec = recs.find((r) => r.work_date === today);
  const todayShift = effShift(me, today, shifts);
  const todayLeave = leaves.find((l) => l.start_date <= today && l.end_date >= today);
  const useDuty = !!state.settings.use_duty;
  const nextDuty = useDuty ? shifts.find((s) => s.kind === 'night' || s.kind === 'weekend') : null;
  let nextOff = null;
  for (let i = 1; i <= 13 && !nextOff; i++) {
    const d = addDays(today, i);
    const onLeave = leaves.some((l) => l.kind === 'full' && l.start_date <= d && l.end_date >= d);
    if (onLeave || effShift(me, d, shifts).kind === 'off') nextOff = { date: d, label: onLeave ? '연차' : '휴무' };
  }
  const info = me.track_leave !== false ? leaveInfo(me, state.settings, state.profiles, leaves, today) : null;

  let shiftText = '근무표 미정';
  if (todayLeave) shiftText = KIND[todayLeave.kind];
  else shiftText = todayShift.kind === 'regular' ? `정규 · ${startOf(me)}–${endOf(me)}` : SHIFT[todayShift.kind].label;

  let btn;
  if (open) btn = `<button class="btn primary big" data-action="clock" data-dir="out" ${net.allowed ? '' : 'disabled'}>퇴근하기</button>`;
  else if (todayRec?.clock_out) btn = '<button class="btn big" disabled>오늘 근무 완료</button>';
  else btn = `<button class="btn primary big" data-action="clock" data-dir="in" ${net.allowed ? '' : 'disabled'}>출근하기</button>`;

  const netBox = net.error
    ? `<div class="net no">${ICON.wifi}<div><b>네트워크 확인 실패</b><div class="small">${esc(net.error)}</div></div></div>`
    : net.allowed
      ? `<div class="net ok">${ICON.wifi}<div><b>병원 Wi-Fi 연결됨</b><div>지금 출퇴근 체크를 할 수 있어요</div></div></div>`
      : `<div class="net no">${ICON.wifi}<div><b>병원 Wi-Fi가 아니에요</b><div>병원 Wi-Fi에 연결한 뒤 <button class="btn sm" data-action="reload">다시 확인</button></div>${isAdmin() ? `<div class="small">현재 주소: ${esc(net.ip)}</div>` : ''}</div></div>`;

  const shown = open || todayRec;
  return `
  <div><h1>안녕하세요, ${esc(me.name)}님</h1><div class="sub">${md(today)}</div></div>
  ${netBox}
  ${autoMissed.map((r) => `<div class="net no"><div><b>${md(r.work_date)} 퇴근 체크가 없어 ${fmtTime(r.clock_out)}로 자동 퇴근 처리됐어요.</b>
    <div class="small">그보다 늦게까지 일했다면 추가근무를 신청해 주세요.</div>
    <button class="btn sm" style="margin-top:6px" data-action="otFor" data-date="${r.work_date}">${md(r.work_date)} 추가근무 신청</button></div></div>`).join('')}
  <section class="card">
    <div class="row between"><span class="sub">오늘 근무</span><b>${esc(shiftText)}</b></div>
    ${btn}
    <div class="grid2">
      <div class="stat" style="background:var(--bg)"><span class="k">출근</span><span class="v" style="font-size:20px">${fmtTime(shown?.clock_in)}</span></div>
      <div class="stat" style="background:var(--bg)"><span class="k">퇴근</span><span class="v" style="font-size:20px">${fmtTime(shown?.clock_out)}</span></div>
    </div>
  </section>
  <div class="grid2">
    <div class="stat"><span class="k">남은 연차</span><span class="v" style="color:var(--primary)">${info ? `${num(info.remain)}일` : '—'}</span></div>
    ${useDuty
      ? `<div class="stat"><span class="k">다가오는 당직</span><span class="v" style="font-size:18px">${nextDuty ? `${md(nextDuty.work_date)}<br><span class="small">${SHIFT[nextDuty.kind].label}</span>` : '없음'}</span></div>`
      : `<div class="stat"><span class="k">다음 쉬는 날</span><span class="v" style="font-size:18px">${nextOff ? `${md(nextOff.date)}<br><span class="small">${nextOff.label}</span>` : '2주 안에 없음'}</span></div>`}
  </div>
  <section class="card">
    <h2>최근 기록</h2>
    <div class="list">${recs.length ? recs.slice(0, 10).map((r) => `<div><span>${md(r.work_date)}</span><span class="sub">${fmtTime(r.clock_in)} – ${fmtTime(r.clock_out)}${r.auto_out ? ' · <b style="color:var(--warn)">자동 퇴근</b>' : r.edit_note ? ' · 수정됨' : ''}</span></div>`).join('') : '<div><span class="sub">아직 기록이 없어요</span></div>'}</div>
  </section>
  <form class="card" data-form="overtime" id="otForm">
    <div class="row between"><h2>추가근무 신청</h2><span class="small">이번 달 승인 ${fmtMin(otMonth)}</span></div>
    <div class="grid2">
      <label class="f">날짜<input type="date" name="date" value="${otDate}" max="${today}" required></label>
      <label class="f">추가근무 시간<select name="minutes">${OT_OPTIONS.map((m) => `<option value="${m}">${fmtMin(m)}</option>`).join('')}</select></label>
    </div>
    <label class="f">내용 (선택)<input type="text" name="reason" maxlength="100" placeholder="예: 응급 수술 보조"></label>
    <button class="btn primary" type="submit">신청하기</button>
    <div class="list">${ots.slice(0, 8).map((o) => `<div><span>${md(o.work_date)} · ${fmtMin(o.minutes)}${o.reason ? ` <span class="small">${esc(o.reason)}</span>` : ''}</span>
      <span class="row" style="gap:6px"><span class="badge b-${o.status}">${STATUS[o.status]}</span>${o.status === 'pending' ? `<button type="button" class="btn sm ghost" data-action="cancelOt" data-id="${o.id}">취소</button>` : ''}</span></div>`).join('')}</div>
  </form>`;
}

// ───────── 연차 ─────────
async function viewLeave() {
  const me = state.me;
  const [mine, approved] = await Promise.all([
    sb.from('leave_requests').select('*').eq('user_id', me.id).order('start_date', { ascending: false }).limit(30).then(must),
    approvedLeaves(me.id),
  ]);
  const info = me.track_leave !== false ? leaveInfo(me, state.settings, state.profiles, approved) : null;
  const k = state.leaveKind;
  const today = kstToday();
  return `
  <h1>연차</h1>
  ${info ? `<div class="hero"><div class="grid3">
      <div><div class="k">발생</div><div class="v">${num(info.granted)}일</div></div>
      <div><div class="k">사용</div><div class="v">${num(info.used)}일</div></div>
      <div><div class="k">잔여</div><div class="v">${num(info.remain)}일</div></div></div>
      <div class="k" style="margin-top:8px">${md(info.start)} ~ ${md(info.end)} 기준</div></div>`
    : `<div class="card"><span class="sub">${me.track_leave !== false ? '입사일이 등록되면 연차가 계산돼요. 원장님께 문의해 주세요.' : '연차 계산 대상이 아니에요.'}</span></div>`}
  <form class="card" data-form="leave">
    <h2>새 신청</h2>
    <div class="seg" role="group" aria-label="종류">
      ${Object.entries(KIND).map(([key, label]) => `<button type="button" data-action="leavekind" data-kind="${key}" aria-pressed="${k === key}">${label}</button>`).join('')}
    </div>
    <div class="grid2">
      <label class="f">${k === 'full' ? '시작일' : '날짜'}<input type="date" name="start" value="${today}" required></label>
      ${k === 'full' ? `<label class="f">종료일<input type="date" name="end" value="${today}" required></label>` : '<div></div>'}
    </div>
    <label class="f">사유 (선택)<input type="text" name="reason" maxlength="100" placeholder="예: 개인 일정"></label>
    <p class="small">근무표에 '휴무'로 잡힌 날은 연차 일수에서 빠져요. 원장님 승인 후 확정됩니다.</p>
    <button class="btn primary" type="submit" style="min-height:52px">신청하기</button>
  </form>
  <section class="card">
    <h2>내 신청 내역</h2>
    <div class="list">${mine.length ? mine.map((l) => `<div>
      <span>${md(l.start_date)}${l.end_date !== l.start_date ? ` ~ ${md(l.end_date)}` : ''} · ${KIND[l.kind]} <span class="small">${num(l.days)}일</span></span>
      <span class="row" style="gap:6px"><span class="badge b-${l.status}">${STATUS[l.status]}</span>
      ${l.status === 'pending' ? `<button class="btn sm ghost" data-action="cancelLeave" data-id="${l.id}">취소</button>` : ''}
      ${l.status === 'approved' && l.end_date >= today ? `<button class="btn sm ghost" data-action="requestCancel" data-id="${l.id}">취소 요청</button>` : ''}</span></div>`).join('') : '<div><span class="sub">신청 내역이 없어요</span></div>'}</div>
  </section>`;
}

// ───────── 근무표 ─────────
async function viewSchedule() {
  const today = kstToday();
  const ws = state.weekStart || mondayOf(today);
  state.weekStart = ws;
  const we = addDays(ws, 6);
  const [shifts, leaves] = await Promise.all([
    sb.from('shifts').select('*').gte('work_date', ws).lte('work_date', we).then(must),
    sb.from('leave_requests').select('*').in('status', LIVE).lte('start_date', we).gte('end_date', ws).then(must),
  ]);
  const people = activePeople();
  const admin = isAdmin();
  const days = [...Array(7)].map((_, i) => addDays(ws, i));
  const dayHtml = days.map((d) => {
    const w = dowOf(d);
    const chips = people.map((p) => {
      const lv = leaves.find((l) => l.user_id === p.id && l.start_date <= d && l.end_date >= d);
      const eff = effShift(p, d, shifts);
      const sh = eff.auto ? null : eff;
      const base = SHIFT[eff.kind].label + (eff.auto && eff.kind === 'off' ? '(고정)' : '');
      let cls = SHIFT[eff.kind].cls; let label = base;
      if (lv) { cls = 's-leave'; label = lv.kind === 'full' ? KIND[lv.kind] : `${base}·${KIND[lv.kind]}`; }
      const text = `${esc(p.name)}<br>${label}`;
      return admin
        ? `<button type="button" class="chip ${cls}" data-action="cycle" data-uid="${p.id}" data-date="${d}" data-kind="${sh?.kind || ''}" aria-label="${esc(p.name)} ${d} ${label}, 눌러서 변경하기">${text}</button>`
        : `<span class="chip ${cls}">${text}</span>`;
    }).join('');
    return `<div class="day ${d === today ? 'today' : ''}"><div class="d ${w === 6 ? 'sat' : w === 0 ? 'sun' : ''}"><small>${DOW[w]}</small><b>${Number(d.slice(8))}</b></div><div class="chips">${chips}</div></div>`;
  }).join('');
  return `
  <div class="row between"><h1>근무표</h1>
    ${admin ? '<button class="btn sm" data-action="copyWeek">지난주 그대로 복사</button>' : ''}</div>
  <div class="row between">
    <button class="btn" data-action="week" data-n="-7" aria-label="이전 주">‹</button>
    <b>${md(ws)} – ${md(we)}</b>
    <button class="btn" data-action="week" data-n="7" aria-label="다음 주">›</button>
  </div>
  <div class="legend"><span><i class="s-reg"></i>정규</span>${state.settings.use_duty ? '<span><i class="s-duty"></i>당직</span>' : ''}<span><i class="s-leave"></i>연차·반차</span><span><i class="s-off"></i>휴무</span></div>
  ${admin ? `<p class="small">고정 휴무 요일은 직원·설정에서 정해요. 특정 날만 바꾸려면 그 칸을 눌러 고르세요.</p>` : ''}
  <section class="card" style="padding:6px 16px">${dayHtml}</section>
  ${ws !== mondayOf(today) ? '<button class="btn" data-action="thisWeek">이번 주로</button>' : ''}`;
}

// ───────── 관리 (원장) ─────────
async function viewManage() {
  const today = kstToday();
  const month = state.logMonth || today.slice(0, 7);
  state.logMonth = month;
  const mStart = `${month}-01`;
  const mEnd = addDays(addDays(mStart, 31).slice(0, 7) + '-01', -1);
  const [todayAtt, openAtt, pending, others, todayShifts, logs, approved, otPending, otMonth] = await Promise.all([
    sb.from('attendance').select('*').eq('work_date', today).then(must),
    sb.from('attendance').select('*').is('clock_out', null).not('clock_in', 'is', null).gte('work_date', addDays(today, -1)).then(must),
    sb.from('leave_requests').select('*').in('status', ['pending', 'cancel_requested']).order('start_date').then(must),
    sb.from('leave_requests').select('*').in('status', ['pending', ...LIVE]).gte('end_date', today).order('start_date').then(must),
    sb.from('shifts').select('*').eq('work_date', today).then(must),
    (() => { let q = sb.from('attendance').select('*').gte('work_date', mStart).lte('work_date', mEnd).order('work_date', { ascending: false }); if (state.logUser) q = q.eq('user_id', state.logUser); return q.then(must); })(),
    approvedLeaves(),
    sb.from('overtime_requests').select('*').eq('status', 'pending').order('work_date').then(must),
    sb.from('overtime_requests').select('*').eq('status', 'approved').gte('work_date', mStart).lte('work_date', mEnd).then(must),
  ]);
  const otAtt = otPending.length
    ? must(await sb.from('attendance').select('*').in('work_date', [...new Set(otPending.map((o) => o.work_date))]))
    : [];
  const people = activePeople();
  const here = people.filter((p) => todayAtt.some((a) => a.user_id === p.id && a.clock_in) || openAtt.some((a) => a.user_id === p.id));

  const todayRows = people.map((p) => {
    const a = todayAtt.find((x) => x.user_id === p.id) || openAtt.find((x) => x.user_id === p.id);
    const sh = effShift(p, today, todayShifts);
    const lv = approved.find((l) => l.user_id === p.id && l.start_date <= today && l.end_date >= today);
    return `<tr><td><b>${esc(p.name)}</b></td><td>${lv ? KIND[lv.kind] : SHIFT[sh.kind].label}</td><td>${fmtTime(a?.clock_in)}${lateMin(p, a, lv ? 'leave' : sh.kind) ? ` <span class="badge b-pending">지각 ${fmtMin(lateMin(p, a, lv ? 'leave' : sh.kind))}</span>` : ''}</td><td>${fmtTime(a?.clock_out)}</td></tr>`;
  }).join('');

  const pendHtml = pending.length ? pending.map((l) => {
    const clash = others.filter((o) => o.id !== l.id && o.user_id !== l.user_id && o.start_date <= l.end_date && o.end_date >= l.start_date);
    const p = state.profiles.find((x) => x.id === l.user_id);
    const info = p ? leaveInfo(p, state.settings, state.profiles, approved) : null;
    if (l.status === 'cancel_requested') {
      return `<div class="card" style="border:1px solid var(--warn);box-shadow:none;padding:14px;gap:8px">
      <div class="row between"><b>${esc(nameOf(l.user_id))} · ${KIND[l.kind]} ${num(l.days)}일 <span class="badge b-cancel_requested">취소 요청</span></b><span class="sub">${md(l.start_date)}${l.end_date !== l.start_date ? ` ~ ${md(l.end_date)}` : ''}</span></div>
      <div class="small">승인된 연차를 취소하고 싶다는 요청이에요. 취소하면 연차가 돌아가고 근무표도 원래대로 바뀌어요.</div>
      <div class="grid2"><button class="btn primary" data-action="decide" data-id="${l.id}" data-s="cancelled">취소 승인</button><button class="btn" data-action="decide" data-id="${l.id}" data-s="approved">연차 유지</button></div>
    </div>`;
    }
    return `<div class="card" style="border:1px solid var(--line);box-shadow:none;padding:14px;gap:8px">
      <div class="row between"><b>${esc(nameOf(l.user_id))} · ${KIND[l.kind]} ${num(l.days)}일</b><span class="sub">${md(l.start_date)}${l.end_date !== l.start_date ? ` ~ ${md(l.end_date)}` : ''}</span></div>
      ${l.reason ? `<div class="small">사유: ${esc(l.reason)}</div>` : ''}
      ${info ? `<div class="small">현재 잔여 ${num(info.remain)}일${info.remain < Number(l.days) ? ' — <b style="color:var(--warn)">잔여보다 많아요</b>' : ''}</div>` : ''}
      ${clash.length ? `<div class="small" style="color:var(--warn)">같은 기간: ${clash.map((c) => `${esc(nameOf(c.user_id))}(${STATUS[c.status]})`).join(', ')}</div>` : ''}
      <div class="grid2"><button class="btn primary" data-action="decide" data-id="${l.id}" data-s="approved">승인</button><button class="btn" data-action="decide" data-id="${l.id}" data-s="rejected">반려</button></div>
    </div>`;
  }).join('') : '<p class="sub">대기 중인 신청이 없어요</p>';

  const monthShifts = must(await sb.from('shifts').select('*').gte('work_date', mStart).lte('work_date', mEnd));
  const kindOn = (p, d) => (approved.some((l) => l.user_id === p.id && l.kind === 'full' && l.start_date <= d && l.end_date >= d) ? 'leave'
    : approved.some((l) => l.user_id === p.id && l.kind === 'am' && l.start_date === d) ? 'leave' : effShift(p, d, monthShifts).kind);
  const logRows = logs.map((r) => { const lp = state.profiles.find((x) => x.id === r.user_id); const late = lp ? lateMin(lp, r, kindOn(lp, r.work_date)) : 0; return `<tr>
    <td>${md(r.work_date)}</td><td>${esc(nameOf(r.user_id))}</td><td>${fmtTime(r.clock_in)}${late ? ` <span class="badge b-pending">지각 ${fmtMin(late)}</span>` : ''}</td><td>${fmtTime(r.clock_out)}</td><td>${hours(r.clock_in, r.clock_out)}</td>
    <td class="small">${r.auto_out ? '<b style="color:var(--warn)">자동 퇴근</b>' : r.edit_note ? `수정: ${esc(r.edit_note)}` : ''}</td>
    <td><button class="btn sm" data-action="editAtt" data-id="${r.id}">수정</button></td></tr>`; }).join('');

  const waiting = state.profiles.filter((p) => p.approved === false).length;
  const otHtml = otPending.length ? otPending.map((o) => {
    const a = otAtt.find((x) => x.user_id === o.user_id && x.work_date === o.work_date);
    return `<div class="card" style="border:1px solid var(--line);box-shadow:none;padding:14px;gap:8px">
      <div class="row between"><b>${esc(nameOf(o.user_id))} · ${fmtMin(o.minutes)}</b><span class="sub">${md(o.work_date)}</span></div>
      ${o.reason ? `<div class="small">내용: ${esc(o.reason)}</div>` : ''}
      <div class="small">그날 기록: ${a ? `${fmtTime(a.clock_in)} – ${fmtTime(a.clock_out)}${a.auto_out ? ' (자동 퇴근)' : ''}` : '출퇴근 기록 없음'}</div>
      <div class="grid2"><button class="btn primary" data-action="decideOt" data-id="${o.id}" data-s="approved">승인</button><button class="btn" data-action="decideOt" data-id="${o.id}" data-s="rejected">반려</button></div>
    </div>`;
  }).join('') : '<p class="sub">대기 중인 신청이 없어요</p>';
  const otRows = people.map((p) => ({ p, m: otMonth.filter((o) => o.user_id === p.id).reduce((s2, o) => s2 + o.minutes, 0) }))
    .filter((x) => x.m).map((x) => `<div><span>${esc(x.p.name)}</span><b>${fmtMin(x.m)}</b></div>`).join('');
  return `
  <h1>관리</h1>
  ${waiting ? `<div class="net no"><div><b>가입 승인 대기 ${waiting}명</b> — <button class="btn sm" data-action="tab" data-tab="people">직원·설정에서 승인하기</button></div></div>` : ''}
  <div class="grid3" style="grid-template-columns:repeat(auto-fit,minmax(160px,1fr));gap:12px">
    <div class="stat"><span class="k">지금 근무 중</span><span class="v">${here.length} / ${people.length}명</span></div>
    <div class="stat"><span class="k">승인 대기 (연차·추가근무)</span><span class="v" style="color:var(--warn)">${pending.length + otPending.length}건</span></div>
    <div class="stat"><span class="k">적용 연차 규정</span><span class="v" style="font-size:18px">${effectiveMode(state.settings, state.profiles) === 'legal' ? '근로기준법' : '병원 규정'}</span></div>
  </div>
  <div class="cols">
    <section class="card wide"><h2>오늘 (${md(today)})</h2>
      <div class="tbl-wrap"><table><thead><tr><th>이름</th><th>근무</th><th>출근</th><th>퇴근</th></tr></thead><tbody>${todayRows}</tbody></table></div>
    </section>
    <section class="card narrow"><h2>연차 승인 대기</h2>${pendHtml}
      <h2 style="margin-top:8px">다가오는 확정 연차</h2>
      <div class="list">${others.filter((o) => LIVE.includes(o.status)).map((o) => `<div><span>${esc(nameOf(o.user_id))} · ${md(o.start_date)}${o.end_date !== o.start_date ? ` ~ ${md(o.end_date)}` : ''} ${KIND[o.kind]}</span><button class="btn sm danger" data-action="adminCancel" data-id="${o.id}">승인 취소</button></div>`).join('') || '<div><span class="sub">없어요</span></div>'}</div>
      <h2 style="margin-top:8px">추가근무 승인 대기</h2>${otHtml}
      <div class="row between" style="margin-top:8px"><h2>${Number(month.slice(5))}월 추가근무 (승인)</h2><button class="btn sm" data-action="otCsv">엑셀 받기</button></div>
      <div class="list">${otRows || '<div><span class="sub">없어요</span></div>'}</div>
    </section>
  </div>
  <section class="card">
    <div class="row between"><h2>출퇴근 기록</h2>
      <div class="row" style="gap:8px">
        <input type="month" value="${month}" data-change="logMonth" aria-label="월 선택" style="width:auto">
        <select data-change="logUser" aria-label="직원 선택" style="width:auto"><option value="">전체</option>${people.map((p) => `<option value="${p.id}" ${state.logUser === p.id ? 'selected' : ''}>${esc(p.name)}</option>`).join('')}</select>
        <button class="btn sm" data-action="csv">엑셀(CSV) 받기</button>
        <button class="btn sm" data-action="addAtt">기록 추가</button>
      </div></div>
    <div id="attEditor"></div>
    <div class="tbl-wrap"><table><thead><tr><th>날짜</th><th>이름</th><th>출근</th><th>퇴근</th><th>근무</th><th>비고</th><th></th></tr></thead>
    <tbody>${logRows || '<tr><td colspan="7" class="sub">기록이 없어요</td></tr>'}</tbody></table></div>
  </section>`;
}

// ───────── 직원·설정 (원장) ─────────
async function viewPeople() {
  const approved = await approvedLeaves();
  const s = state.settings;
  const count = employeeCount(state.profiles);
  const mode = effectiveMode(s, state.profiles);
  const forced = count >= Number(s.legal_threshold);
  const [net, devices] = await Promise.all([
    api('/api/clock').catch(() => ({})),
    sb.from('hospital_devices').select('id,name,last_ip,last_seen').order('created_at').then(must).catch(() => []),
  ]);
  const thisIsDevice = !!getDeviceToken();
  const ago = (iso) => {
    if (!iso) return '—';
    const m = Math.round((Date.now() - new Date(iso)) / 60000);
    return m < 1 ? '방금' : m < 60 ? `${m}분 전` : m < 1440 ? `${Math.round(m / 60)}시간 전` : `${Math.round(m / 1440)}일 전`;
  };
  const deviceHtml = `
    <h2 style="margin-top:8px">자동 갱신 병원 기기</h2>
    <p class="small">병원 PC를 등록하고 이 사이트를 켜두면, 병원 인터넷 주소가 바뀌어도 몇 분 안에 자동으로 새 주소가 적용돼요.</p>
    ${thisIsDevice
      ? '<div class="net ok">' + ICON.wifi + '<div><b>이 기기는 병원 기기로 등록되어 있어요</b><div class="small">이 창을 켜두면 자동으로 갱신돼요</div></div></div>'
      : '<button class="btn primary" data-action="registerDevice">이 기기를 병원 기기로 등록</button><p class="small">병원 Wi-Fi(인터넷)에 연결된, 항상 켜두는 PC에서 누르세요.</p>'}
    <div class="list">${devices.length ? devices.map((d) => `<div><span>${esc(d.name)}<br><span class="small">${esc(d.last_ip || '')} · ${ago(d.last_seen)}</span></span><button class="btn sm ghost danger" data-action="removeDevice" data-id="${d.id}">해제</button></div>`).join('') : '<div><span class="sub">등록된 병원 기기가 없어요</span></div>'}</div>`;

  const pendingUsers = state.profiles.filter((p) => p.approved === false);
  const pendingHtml = pendingUsers.length ? `
  <section class="card" style="border:2px solid var(--warn)">
    <h2>가입 승인 대기 ${pendingUsers.length}명</h2>
    <p class="small">본인이 맞는지 확인하고 입사일·직군을 넣은 뒤 승인해 주세요.</p>
    ${pendingUsers.map((p) => `<div class="row" data-pending="${p.id}" style="border-top:1px solid var(--line);padding-top:12px">
      <div style="min-width:140px"><b>${esc(p.name)}</b><div class="small">아이디 ${esc(p.login_id || '')}</div></div>
      <label class="f" style="flex:1;min-width:120px">직군<input type="text" name="job" value="${esc(p.job)}"></label>
      <label class="f" style="flex:1;min-width:150px">입사일<input type="date" name="hire_date" value="${p.hire_date || ''}"></label>
      <div class="row" style="gap:6px;align-self:flex-end"><button class="btn primary" data-action="approveUser" data-id="${p.id}">승인</button><button class="btn danger" data-action="rejectUser" data-id="${p.id}">거절</button></div>
    </div>`).join('')}
  </section>` : '';

  const rows = [...state.profiles].filter((p) => p.approved !== false).sort((a, b) => Number(b.active) - Number(a.active) || a.name.localeCompare(b.name, 'ko')).map((p) => {
    const info = p.track_leave !== false ? leaveInfo(p, s, state.profiles, approved) : null;
    return `<tr data-row="${p.id}">
      <td><input type="text" name="name" value="${esc(p.name)}" aria-label="이름" style="min-width:90px"><div class="small">${esc(p.login_id || '')}</div></td>
      <td><input type="text" name="job" value="${esc(p.job)}" aria-label="직군" style="min-width:80px"></td>
      <td><select name="role" aria-label="권한"><option value="staff" ${p.role === 'staff' ? 'selected' : ''}>직원</option><option value="admin" ${p.role === 'admin' ? 'selected' : ''}>원장(관리)</option></select></td>
      <td><input type="date" name="hire_date" value="${p.hire_date || ''}" aria-label="입사일"></td>
      <td><div style="display:flex;flex-direction:column;gap:4px"><input type="time" name="work_start" value="${hm(p.work_start)}" aria-label="정규 출근 시각" style="width:110px"><input type="time" name="work_end" value="${hm(p.work_end)}" aria-label="정규 퇴근 시각" style="width:110px"></div></td>
      <td><label class="check"><input type="checkbox" name="is_employee" ${p.is_employee ? 'checked' : ''}>근로자</label><label class="check"><input type="checkbox" name="track_leave" ${p.track_leave !== false ? 'checked' : ''}>연차 관리</label><label class="check"><input type="checkbox" name="active" ${p.active ? 'checked' : ''}>재직</label></td>
      <td><div class="days">${[1, 2, 3, 4, 5, 6, 0].map((w) => `<label title="${DOW[w]}요일 고정 휴무"><input type="checkbox" name="off${w}" ${(p.weekly_off || []).includes(w) ? 'checked' : ''}>${DOW[w]}</label>`).join('')}</div></td>
      <td><input type="number" name="leave_adjust" value="${info ? info.adjust : p.leave_adjust}" step="0.5" aria-label="연차 가감" style="width:80px"></td>
      <td class="small">${info ? `${num(info.granted)} / ${num(info.used)} / <b>${num(info.remain)}</b>` : '—'}</td>
      <td><div class="row" style="gap:6px"><button class="btn sm primary" data-action="saveProfile" data-id="${p.id}">저장</button><button class="btn sm" data-action="resetPw" data-id="${p.id}">비번 변경</button></div></td>
    </tr>`;
  }).join('');

  return `
  <h1>직원·설정</h1>
  ${pendingHtml}
  <section class="card">
    <h2>직원</h2>
    <p class="small">출근/퇴근 시각: 출근이 늦으면 관리 화면에 지각으로 표시되고, 퇴근을 안 누르면 퇴근 시각으로 자동 처리돼요. 고정 휴무 요일: 체크한 요일은 근무표에 자동으로 '휴무', 나머지는 '정규'로 들어가요. 근로자: 5인 인원 계산에 들어가는 직원(대표원장은 해제). 연차 관리: 연차를 계산·표시할 사람(원장님도 체크 가능). 연차 가감: 이월·포상 등 수동 조정(지금 연차 기간에만 적용, 다음 해엔 자동으로 0). 연차 칸은 발생 / 사용 / 잔여.</p>
    <div class="tbl-wrap"><table style="min-width:1220px"><thead><tr><th>이름</th><th>직군</th><th>권한</th><th>입사일</th><th>출근 / 퇴근 시각</th><th>구분</th><th>고정 휴무 요일</th><th>연차 가감</th><th>연차</th><th></th></tr></thead><tbody>${rows}</tbody></table></div>
  </section>
  <form class="card" data-form="newUser">
    <h2>직원 추가</h2>
    <div class="grid2" style="grid-template-columns:repeat(auto-fit,minmax(180px,1fr))">
      <label class="f">이름<input type="text" name="name" required></label>
      <label class="f">로그인 아이디 (영문)<input type="text" name="login_id" autocapitalize="none" pattern="[a-z0-9._\\-]{3,30}" required></label>
      <label class="f">처음 비밀번호 (8자 이상)<input type="text" name="password" minlength="8" required></label>
      <label class="f">직군<input type="text" name="job" value="테크니션"></label>
      <label class="f">입사일<input type="date" name="hire_date"></label>
      <label class="f">권한<select name="role"><option value="staff">직원</option><option value="admin">원장(관리)</option></select></label>
    </div>
    <label class="check"><input type="checkbox" name="is_employee" checked>근로자 (5인 인원 계산 대상)</label>
    <button class="btn primary" type="submit">계정 만들기</button>
  </form>
  <div class="cols">
    <form class="card wide" data-form="leavePolicy">
      <h2>연차 규정</h2>
      <div class="net ${forced ? 'no' : 'ok'}"><div>현재 근로자 <b>${count}명</b> · 적용 중: <b>${mode === 'legal' ? '근로기준법 기준' : '병원 자체 규정'}</b>
        <div class="small">${forced ? `근로자가 ${s.legal_threshold}명 이상이라 법 기준이 자동 적용 중이에요. 아래 병원 규정은 무시됩니다.` : `근로자가 ${s.legal_threshold}명 이상이 되면 자동으로 법 기준으로 바뀌어요.`}</div></div></div>
      <label class="check"><input type="radio" name="leave_mode" value="legal" ${s.leave_mode === 'legal' ? 'checked' : ''}>지금부터 근로기준법 기준 사용 (1년 미만 월 1일, 1년 이상 15일, 3년차부터 2년마다 +1, 최대 25일)</label>
      <label class="check"><input type="radio" name="leave_mode" value="custom" ${s.leave_mode === 'custom' ? 'checked' : ''}>병원 자체 규정</label>
      <div class="grid2" style="grid-template-columns:repeat(auto-fit,minmax(200px,1fr))">
        <label class="f">1년 이상 직원 연간 연차 (일)<input type="number" name="custom_annual_days" value="${s.custom_annual_days}" step="0.5" min="0"></label>
        <label class="f">기본 출근 시각 (직원별 값이 비어 있을 때)<input type="time" name="work_start" value="${hm(s.work_start || '09:30')}"></label>
        <label class="f">기본 퇴근 시각 (직원별 값이 비어 있을 때)<input type="time" name="work_end" value="${hm(s.work_end || '18:00')}"></label>
      </div>
      <label class="check"><input type="checkbox" name="use_duty" ${s.use_duty ? 'checked' : ''}>당직 사용 (근무표에 야간·주말 당직 표시)</label>
      <div class="f">1년 미만 직원 연차
        <label class="check"><input type="radio" name="first_year" value="monthly" ${!s.custom_first_year_upfront && s.custom_first_year_monthly ? 'checked' : ''}>한 달 근무마다 1일씩 생김 (최대 11일)</label>
        <label class="check"><input type="radio" name="first_year" value="upfront" ${s.custom_first_year_upfront ? 'checked' : ''}>입사할 때 <input type="number" name="custom_first_year_days" value="${s.custom_first_year_days ?? 11}" min="0" step="0.5" style="width:70px;min-height:32px;margin:0 4px">일 한 번에 지급</label>
        <label class="check"><input type="radio" name="first_year" value="none" ${!s.custom_first_year_upfront && !s.custom_first_year_monthly ? 'checked' : ''}>지급 안 함</label>
      </div>
      <label class="check"><input type="checkbox" name="custom_seniority" ${s.custom_seniority ? 'checked' : ''}>3년차부터 2년마다 1일 추가</label>
      <p class="small">연차 기간은 각 직원 입사일 기준 1년 단위입니다. 출근율 80% 요건은 따로 확인해 주세요.</p>
      <button class="btn primary" type="submit">저장</button>
    </form>
    <section class="card narrow">
      <h2>출퇴근 허용 네트워크</h2>
      <p class="small">병원 Wi-Fi에 연결된 상태에서 아래 버튼을 누르면 병원 인터넷 주소가 등록돼요.</p>
      <div class="small">지금 접속한 주소: <b>${esc(net.ip || '확인 불가')}</b> ${net.allowed ? '(등록됨)' : ''}</div>
      <button class="btn primary" data-action="addIp" data-ip="${esc(net.ip || '')}" ${net.ip && !net.allowed ? '' : 'disabled'}>지금 네트워크 등록</button>
      <div class="list">${(s.allowed_ips || []).map((ip) => `<div><span>${esc(ip)}</span><button class="btn sm ghost danger" data-action="removeIp" data-ip="${esc(ip)}">삭제</button></div>`).join('') || '<div><span class="sub">등록된 주소가 없어요 — 아직 아무도 출근 체크를 할 수 없어요</span></div>'}</div>
      <form class="row" data-form="manualIp" style="gap:8px"><input type="text" name="ip" placeholder="직접 입력 (예: 211.234.1.10)" aria-label="IP 직접 입력" style="flex:1"><button class="btn sm" type="submit">추가</button></form>
      ${deviceHtml}
    </section>
  </div>`;
}

// ───────── 점심값 ─────────
const won = (n) => `${Number(n || 0).toLocaleString('ko-KR')}원`;
function lunchSupport() { return Number(state.settings?.lunch_support ?? 8000); }
function lunchSplit(amount, support) {
  const a = Number(amount) || 0;
  return { sup: Math.min(a, support), over: Math.max(0, a - support) };
}
function monthRange(month) { const s = `${month}-01`; return [s, addDays(addDays(s, 31).slice(0, 7) + '-01', -1)]; }
function lunchTotals(rows, S) {
  return rows.reduce((t, r) => { const x = lunchSplit(r.amount, S); t.n++; t.total += Number(r.amount); t.sup += x.sup; t.over += x.over; return t; }, { n: 0, total: 0, sup: 0, over: 0 });
}

async function viewLunch() {
  const today = kstToday();
  const month = state.lunchMonth || today.slice(0, 7);
  state.lunchMonth = month;
  const [ms, me] = monthRange(month);
  const S = lunchSupport();
  const mine = must(await sb.from('lunch_expenses').select('*').eq('user_id', state.me.id).gte('spend_date', ms).lte('spend_date', me).order('spend_date', { ascending: false }));
  const t = lunchTotals(mine, S);
  const ed = state.lunchEdit;

  let adminHtml = '';
  if (isAdmin()) {
    const all = must(await sb.from('lunch_expenses').select('*').gte('spend_date', ms).lte('spend_date', me));
    const people = activePeople();
    const sumAll = lunchTotals(all, S);
    const rows = people.map((p) => {
      const x = lunchTotals(all.filter((r) => r.user_id === p.id), S);
      return `<tr><td><b>${esc(p.name)}</b></td><td>${x.n}일</td><td>${won(x.total)}</td><td>${won(x.sup)}</td><td><b>${won(x.over)}</b></td></tr>`;
    }).join('');
    adminHtml = `
    <section class="card">
      <div class="row between"><h2>직원별 합계 · ${Number(month.slice(5))}월</h2><button class="btn sm" data-action="lunchCsv">엑셀(CSV) 받기</button></div>
      <div class="tbl-wrap"><table style="min-width:520px"><thead><tr><th>이름</th><th>입력</th><th>총 사용</th><th>병원 지원</th><th>본인 부담</th></tr></thead>
      <tbody>${rows}<tr><td><b>합계</b></td><td>${sumAll.n}일</td><td><b>${won(sumAll.total)}</b></td><td><b>${won(sumAll.sup)}</b></td><td><b>${won(sumAll.over)}</b></td></tr></tbody></table></div>
      <form class="row" data-form="lunchSupport" style="gap:8px">
        <label class="f" style="flex:1;min-width:180px">1일 지원 한도 (원)<input type="number" name="support" value="${S}" min="0" step="500" inputmode="numeric"></label>
        <button class="btn sm" type="submit" style="align-self:flex-end;min-height:44px">저장</button>
      </form>
    </section>`;
  }

  return `
  <div class="row between"><h1>점심</h1>
    <input type="month" value="${month}" data-change="lunchMonth" aria-label="월 선택" style="width:auto"></div>
  <div class="hero"><div class="grid3">
    <div><div class="k">이번 달 사용</div><div class="v">${won(t.total)}</div></div>
    <div><div class="k">병원 지원</div><div class="v">${won(t.sup)}</div></div>
    <div><div class="k">본인 부담</div><div class="v">${won(t.over)}</div></div></div>
    <div class="k" style="margin-top:8px">하루 ${won(S)}까지 지원 · 넘는 금액은 본인 부담으로 합산돼요</div></div>
  <form class="card" data-form="lunch">
    <h2>${ed ? '수정하기' : '오늘 점심 입력'}</h2>
    <div class="grid2">
      <label class="f">날짜<input type="date" name="date" value="${ed?.spend_date || today}" max="${today}" required></label>
      <label class="f">금액 (원)<input type="number" name="amount" value="${ed?.amount ?? ''}" min="0" max="1000000" step="100" inputmode="numeric" placeholder="예: 9500" required></label>
    </div>
    <label class="f">메뉴·메모 (선택)<input type="text" name="memo" maxlength="60" value="${esc(ed?.memo || '')}" placeholder="예: 김치찌개"></label>
    <p class="small">같은 날짜를 다시 입력하면 새 금액으로 바뀌어요.</p>
    <div class="row"><button class="btn primary" type="submit" style="flex:1;min-height:52px">저장</button>
    ${ed ? '<button class="btn" type="button" data-action="lunchCancel">취소</button>' : ''}</div>
  </form>
  <section class="card">
    <h2>${Number(month.slice(5))}월 내 기록</h2>
    <div class="list">${mine.length ? mine.map((r) => {
      const x = lunchSplit(r.amount, S);
      return `<div><span>${md(r.spend_date)} <b>${won(r.amount)}</b>${r.memo ? ` <span class="small">${esc(r.memo)}</span>` : ''}${x.over ? `<br><span class="small" style="color:var(--warn)">본인 부담 ${won(x.over)}</span>` : ''}</span>
      <span class="row" style="gap:4px"><button class="btn sm ghost" data-action="lunchEditStart" data-id="${r.id}">수정</button><button class="btn sm ghost danger" data-action="deleteLunch" data-id="${r.id}">삭제</button></span></div>`;
    }).join('') : '<div><span class="sub">입력한 기록이 없어요</span></div>'}</div>
  </section>
  ${adminHtml}`;
}

// ───────── 병원 기기: 공인 IP 자동 알림 ─────────
let heartbeatOn = false;
function startHeartbeat() {
  if (heartbeatOn || !getDeviceToken()) return;
  heartbeatOn = true;
  const beat = () => {
    const token = getDeviceToken();
    if (!token) return;
    fetch('/api/device', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ action: 'beat', token }) })
      .then((r) => { if (r.status === 404) setDeviceToken(null); })
      .catch(() => {});
  };
  beat();
  setInterval(beat, 3 * 60 * 1000);
  document.addEventListener('visibilitychange', () => { if (!document.hidden) beat(); });
  window.addEventListener('online', beat);
}

// ───────── 동작 ─────────
async function refreshBase() { await loadBase(); }

const actions = {
  async logout() { await sb.auth.signOut(); state.session = null; renderLogin(); },
  tab(b) { state.tab = b.dataset.tab; render(); window.scrollTo(0, 0); },
  reload() { renderView(); },
  async clock(b) {
    b.disabled = true;
    try {
      await api('/api/clock', { method: 'POST', body: JSON.stringify({ action: b.dataset.dir }) });
      toast(b.dataset.dir === 'in' ? '출근 완료! 오늘도 화이팅' : '퇴근 완료. 수고하셨어요');
    } catch (e) { toast(e.message); }
    renderView();
  },
  leavekind(b) { state.leaveKind = b.dataset.kind; renderView(); },
  async cancelLeave(b) {
    try { must(await sb.from('leave_requests').delete().eq('id', b.dataset.id)); toast('신청을 취소했어요'); } catch (e) { toast(e.message); }
    renderView();
  },
  week(b) { state.weekStart = addDays(state.weekStart, Number(b.dataset.n)); renderView(); },
  thisWeek() { state.weekStart = null; renderView(); },
  async cycle(b) {
    const cur = b.dataset.kind || '';
    const { uid, date } = b.dataset;
    const p = state.profiles.find((x) => x.id === uid);
    const autoKind = (p?.weekly_off || []).includes(dowOf(date)) ? '휴무' : '정규';
    const opts = [
      { v: 'regular', label: '정규 근무' },
      { v: 'off', label: '휴무' },
      ...(state.settings.use_duty ? [{ v: 'night', label: '야간당직' }, { v: 'weekend', label: '주말당직' }] : []),
      { v: '', label: `원래대로 (고정 패턴: ${autoKind})` },
    ];
    const pick = await choose(`${p?.name || ''} · ${md(date)}`, opts, cur);
    if (pick === null || pick === cur) return;
    const next = pick || null;
    b.disabled = true;
    try {
      if (next) must(await sb.from('shifts').upsert({ user_id: uid, work_date: date, kind: next }, { onConflict: 'user_id,work_date' }));
      else must(await sb.from('shifts').delete().eq('user_id', uid).eq('work_date', date));
    } catch (e) { toast(e.message); }
    const y = window.scrollY; await renderView(); window.scrollTo(0, y);
  },
  async copyWeek() {
    const ws = state.weekStart; const prev = addDays(ws, -7);
    try {
      const rows = must(await sb.from('shifts').select('*').gte('work_date', prev).lte('work_date', addDays(prev, 6)));
      if (!rows.length) return toast('지난주 근무표가 비어 있어요');
      must(await sb.from('shifts').upsert(rows.map((r) => ({ user_id: r.user_id, work_date: addDays(r.work_date, 7), kind: r.kind })), { onConflict: 'user_id,work_date' }));
      toast('지난주 근무표를 복사했어요');
    } catch (e) { toast(e.message); }
    renderView();
  },
  async otFor(b) {
    state.otDate = b.dataset.date;
    await renderView();
    document.getElementById('otForm')?.scrollIntoView({ behavior: 'smooth', block: 'center' });
  },
  async cancelOt(b) {
    try { must(await sb.from('overtime_requests').delete().eq('id', b.dataset.id)); toast('신청을 취소했어요'); } catch (e) { toast(e.message); }
    renderView();
  },
  async decideOt(b) {
    try {
      must(await sb.from('overtime_requests').update({ status: b.dataset.s, decided_by: state.me.id, decided_at: new Date().toISOString() }).eq('id', b.dataset.id));
      toast(b.dataset.s === 'approved' ? '추가근무를 승인했어요' : '반려했어요');
    } catch (e) { toast(e.message); }
    renderView();
  },
  async otCsv() {
    const month = state.logMonth; const mStart = `${month}-01`;
    const mEnd = addDays(addDays(mStart, 31).slice(0, 7) + '-01', -1);
    const rows = must(await sb.from('overtime_requests').select('*').eq('status', 'approved').gte('work_date', mStart).lte('work_date', mEnd).order('work_date'));
    downloadCsv(`추가근무_${month}.csv`, [['날짜', '이름', '시간(분)', '시간', '내용']].concat(rows.map((o) => [o.work_date, nameOf(o.user_id), o.minutes, fmtMin(o.minutes), o.reason || ''])));
  },
  async requestCancel(b) {
    if (!(await ask('이 연차의 취소를 원장님께 요청할까요?', { ok: '취소 요청' }))) return;
    try { must(await sb.rpc('request_leave_cancel', { p_id: Number(b.dataset.id) })); toast('취소 요청을 보냈어요'); } catch (e) { toast(e.message); }
    renderView();
  },
  async adminCancel(b) {
    if (!(await ask('승인된 연차를 취소할까요? 사용한 연차가 직원에게 다시 돌아갑니다.', { ok: '연차 취소', danger: true }))) return;
    try { must(await sb.from('leave_requests').update({ status: 'cancelled', decided_by: state.me.id, decided_at: new Date().toISOString() }).eq('id', b.dataset.id)); toast('연차를 취소했어요'); } catch (e) { toast(e.message); }
    renderView();
  },
  async decide(b) {
    try {
      must(await sb.from('leave_requests').update({ status: b.dataset.s, decided_by: state.me.id, decided_at: new Date().toISOString() }).eq('id', b.dataset.id));
      toast({ approved: '승인했어요', rejected: '반려했어요', cancelled: '연차를 취소했어요' }[b.dataset.s]);
    } catch (e) { toast(e.message); }
    renderView();
  },
  async editAtt(b) {
    const r = must(await sb.from('attendance').select('*').eq('id', b.dataset.id).single());
    showAttEditor(r);
  },
  addAtt() { showAttEditor(null); },
  closeAtt() { document.getElementById('attEditor').innerHTML = ''; },
  async deleteAtt(b) {
    try { must(await sb.from('attendance').delete().eq('id', b.dataset.id)); toast('삭제했어요'); } catch (e) { toast(e.message); }
    renderView();
  },
  async csv() {
    const month = state.logMonth; const mStart = `${month}-01`;
    const mEnd = addDays(addDays(mStart, 31).slice(0, 7) + '-01', -1);
    let q = sb.from('attendance').select('*').gte('work_date', mStart).lte('work_date', mEnd).order('work_date');
    if (state.logUser) q = q.eq('user_id', state.logUser);
    const rows = must(await q);
    const lines = [['날짜', '이름', '출근', '퇴근', '근무시간', '자동퇴근', '비고']]
      .concat(rows.map((r) => [r.work_date, nameOf(r.user_id), fmtTime(r.clock_in), fmtTime(r.clock_out), hours(r.clock_in, r.clock_out), r.auto_out ? 'Y' : '', r.edit_note || '']));
    const text = '﻿' + lines.map((l) => l.map((c) => `"${String(c).replace(/"/g, '""')}"`).join(',')).join('\r\n');
    const a = document.createElement('a');
    a.href = URL.createObjectURL(new Blob([text], { type: 'text/csv;charset=utf-8' }));
    a.download = `출퇴근_${month}.csv`; a.click();
  },
  async saveProfile(b) {
    const tr = document.querySelector(`tr[data-row="${b.dataset.id}"]`);
    const v = (n) => tr.querySelector(`[name="${n}"]`);
    const patch = {
      name: v('name').value.trim(), job: v('job').value.trim(), role: v('role').value,
      hire_date: v('hire_date').value || null, work_start: v('work_start').value || null, work_end: v('work_end').value || null, is_employee: v('is_employee').checked, track_leave: v('track_leave').checked,
      active: v('active').checked, leave_adjust: Number(v('leave_adjust').value || 0),
      weekly_off: [0, 1, 2, 3, 4, 5, 6].filter((w) => v(`off${w}`).checked),
      leave_adjust_period: null,
    };
    if (b.dataset.id === state.me.id && (patch.role !== 'admin' || !patch.active)) return toast('본인의 원장 권한은 해제할 수 없어요');
    // 가감은 지금 연차 기간(입사일 기준 1년)에만 적용
    const target = state.profiles.find((x) => x.id === b.dataset.id);
    const cur = leaveInfo({ ...target, ...patch, leave_adjust: 0 }, state.settings, state.profiles, []);
    patch.leave_adjust_period = patch.leave_adjust && cur ? cur.start : null;
    try { must(await sb.from('profiles').update(patch).eq('id', b.dataset.id)); await refreshBase(); toast('저장했어요'); } catch (e) { toast(e.message); }
    renderView();
  },
  async resetPw(b) {
    const pw = await ask(`${nameOf(b.dataset.id)}님의 새 비밀번호 (8자 이상)`, { input: true, ok: '변경' });
    if (!pw) return;
    try { await api('/api/users', { method: 'PUT', body: JSON.stringify({ user_id: b.dataset.id, password: pw }) }); toast('비밀번호를 바꿨어요'); } catch (e) { toast(e.message); }
  },
  showSignup() { renderSignup(); },
  showLogin() { renderLogin(); },
  async recheck() { await loadBase(); render(); },
  async approveUser(b) {
    const row = document.querySelector(`[data-pending="${b.dataset.id}"]`);
    const patch = { approved: true, active: true, job: row.querySelector('[name=job]').value.trim() || '테크니션', hire_date: row.querySelector('[name=hire_date]').value || null };
    if (!patch.hire_date) return toast('입사일을 넣어 주세요 (연차 계산에 필요해요)');
    try { must(await sb.from('profiles').update(patch).eq('id', b.dataset.id)); await refreshBase(); toast(`${nameOf(b.dataset.id)}님을 승인했어요`); } catch (e) { toast(e.message); }
    renderView();
  },
  async rejectUser(b) {
    if (!(await ask(`${nameOf(b.dataset.id)}님의 가입 신청을 거절할까요? 계정이 삭제됩니다.`, { ok: '거절', danger: true }))) return;
    try { await api('/api/users', { method: 'DELETE', body: JSON.stringify({ user_id: b.dataset.id }) }); await refreshBase(); toast('거절했어요'); } catch (e) { toast(e.message); }
    renderView();
  },
  async registerDevice() {
    const name = await ask('이 기기 이름', { input: true, value: '데스크 PC', ok: '등록' });
    if (name === null) return;
    try {
      const r = await api('/api/device', { method: 'POST', body: JSON.stringify({ action: 'register', name }) });
      setDeviceToken(r.token);
      startHeartbeat();
      toast('병원 기기로 등록했어요');
    } catch (e) { toast(e.message); }
    renderView();
  },
  async removeDevice(b) {
    try { must(await sb.from('hospital_devices').delete().eq('id', b.dataset.id)); toast('해제했어요'); } catch (e) { toast(e.message); }
    renderView();
  },
  async lunchEditStart(b) {
    try { state.lunchEdit = must(await sb.from('lunch_expenses').select('*').eq('id', b.dataset.id).single()); } catch (e) { toast(e.message); }
    await renderView(); window.scrollTo({ top: 0, behavior: 'smooth' });
  },
  lunchCancel() { state.lunchEdit = null; renderView(); },
  async deleteLunch(b) {
    try { must(await sb.from('lunch_expenses').delete().eq('id', b.dataset.id)); toast('삭제했어요'); } catch (e) { toast(e.message); }
    if (state.lunchEdit?.id === Number(b.dataset.id)) state.lunchEdit = null;
    renderView();
  },
  async lunchCsv() {
    const [ms, me] = monthRange(state.lunchMonth);
    const S = lunchSupport();
    const rows = must(await sb.from('lunch_expenses').select('*').gte('spend_date', ms).lte('spend_date', me).order('spend_date'));
    const lines = [['날짜', '이름', '금액', '병원 지원', '본인 부담', '메모']]
      .concat(rows.map((r) => { const x = lunchSplit(r.amount, S); return [r.spend_date, nameOf(r.user_id), r.amount, x.sup, x.over, r.memo || '']; }));
    downloadCsv(`점심값_${state.lunchMonth}.csv`, lines);
  },
  async addIp(b) { await saveIps([...(state.settings.allowed_ips || []), b.dataset.ip]); },
  async removeIp(b) { await saveIps((state.settings.allowed_ips || []).filter((x) => x !== b.dataset.ip)); },
};

async function saveIps(list) {
  const uniq = [...new Set(list.map((x) => x.trim()).filter(Boolean))];
  try {
    must(await sb.from('settings').update({ allowed_ips: uniq, updated_at: new Date().toISOString() }).eq('id', 1));
    await refreshBase(); toast('네트워크 설정을 저장했어요');
  } catch (e) { toast(e.message); }
  renderView();
}

function downloadCsv(filename, lines) {
  const text = '﻿' + lines.map((l) => l.map((c) => `"${String(c).replace(/"/g, '""')}"`).join(',')).join('\r\n');
  const a = document.createElement('a');
  a.href = URL.createObjectURL(new Blob([text], { type: 'text/csv;charset=utf-8' }));
  a.download = filename; a.click();
}

function toHHMM(iso) { return iso ? fmtTime(iso) : ''; }
function showAttEditor(r) {
  const people = activePeople();
  document.getElementById('attEditor').innerHTML = `
  <form class="card" data-form="att" style="border:1px solid var(--tint-line);box-shadow:none">
    <h2>${r ? '기록 수정' : '기록 추가'}</h2>
    <input type="hidden" name="id" value="${r?.id || ''}">
    <div class="grid2" style="grid-template-columns:repeat(auto-fit,minmax(150px,1fr))">
      <label class="f">직원<select name="user_id" ${r ? 'disabled' : ''}>${people.map((p) => `<option value="${p.id}" ${r?.user_id === p.id ? 'selected' : ''}>${esc(p.name)}</option>`).join('')}</select></label>
      <label class="f">날짜<input type="date" name="work_date" value="${r?.work_date || kstToday()}" ${r ? 'disabled' : ''} required></label>
      <label class="f">출근<input type="time" name="in" value="${toHHMM(r?.clock_in)}"></label>
      <label class="f">퇴근<input type="time" name="out" value="${toHHMM(r?.clock_out)}"></label>
    </div>
    <label class="f">수정 사유 (필수)<input type="text" name="note" value="${esc(r?.edit_note || '')}" required placeholder="예: 출근 체크 누락"></label>
    <p class="small">퇴근 시각이 출근보다 이르면 다음 날 퇴근으로 저장돼요.</p>
    <div class="row"><button class="btn primary" type="submit">저장</button><button class="btn" type="button" data-action="closeAtt">닫기</button>
    ${r ? `<button class="btn danger" type="button" data-action="deleteAtt" data-id="${r.id}">기록 삭제</button>` : ''}</div>
  </form>`;
  document.getElementById('attEditor').scrollIntoView({ behavior: 'smooth', block: 'center' });
}

const forms = {
  async login(f) {
    const id = f.uid.value.trim().toLowerCase();
    const email = id.includes('@') ? id : `${id}@${LOGIN_DOMAIN}`;
    const { error } = await sb.auth.signInWithPassword({ email, password: f.pw.value });
    if (error) return renderLogin('아이디 또는 비밀번호가 맞지 않아요.');
    const { data: { session } } = await sb.auth.getSession();
    state.session = session; state.tab = 'home';
    await loadBase(); render();
  },
  async overtime(f) {
    const date = f.date.value; const minutes = Number(f.minutes.value);
    if (!date || date > kstToday()) return toast('날짜를 확인해 주세요');
    try {
      must(await sb.from('overtime_requests').insert({ user_id: state.me.id, work_date: date, minutes, reason: f.reason.value.trim() || null }));
      toast(`${fmtMin(minutes)} 추가근무를 신청했어요`);
      state.otDate = null;
    } catch (e) { toast(e.message); }
    renderView();
  },
  async signup(f) {
    const body = { name: f.name.value.trim(), login_id: f.login_id.value.trim().toLowerCase(), password: f.password.value };
    if (body.password !== f.password2.value) return renderSignup('비밀번호가 서로 달라요.');
    try {
      const r = await fetch('/api/signup', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
      const j = await r.json().catch(() => ({}));
      if (!r.ok) return renderSignup(j.error || '신청에 실패했어요.');
      renderSignup('', true);
    } catch { renderSignup('네트워크 오류가 났어요. 다시 시도해 주세요.'); }
  },
  async leave(f) {
    const kind = state.leaveKind;
    const start = f.start.value; const end = kind === 'full' ? f.end.value : start;
    if (!start || end < start) return toast('날짜를 확인해 주세요');
    if (daysBetween(start, end) > 60) return toast('한 번에 60일까지 신청할 수 있어요');
    const myShifts = must(await sb.from('shifts').select('*').eq('user_id', state.me.id).gte('work_date', start).lte('work_date', end));
    const offs = [];
    for (let d = start; d <= end; d = addDays(d, 1)) if (effShift(state.me, d, myShifts).kind === 'off') offs.push(d);
    const days = requestDays(kind, start, end, offs);
    if (days <= 0) return toast('선택한 날이 모두 휴무예요');
    try {
      must(await sb.from('leave_requests').insert({ user_id: state.me.id, kind, start_date: start, end_date: end, days, reason: f.reason.value.trim() || null }));
      toast(`${num(days)}일 신청했어요. 원장님 승인을 기다려 주세요`);
    } catch (e) { toast(e.message); }
    renderView();
  },
  async att(f) {
    const id = f.id.value;
    const date = f.work_date.value;
    const note = f.note.value.trim();
    if (!note) return toast('수정 사유를 적어 주세요');
    const cin = f.in.value ? kstIso(date, f.in.value) : null;
    let cout = f.out.value ? kstIso(date, f.out.value) : null;
    if (cin && cout && cout <= cin) cout = kstIso(addDays(date, 1), f.out.value);
    const row = { clock_in: cin, clock_out: cout, edit_note: note, edited_by: state.me.id, edited_at: new Date().toISOString() };
    try {
      if (id) must(await sb.from('attendance').update(row).eq('id', id));
      else must(await sb.from('attendance').upsert({ ...row, user_id: f.user_id.value, work_date: date }, { onConflict: 'user_id,work_date' }));
      toast('저장했어요');
    } catch (e) { toast(e.message); }
    renderView();
  },
  async newUser(f) {
    const body = {
      name: f.name.value.trim(), login_id: f.login_id.value.trim().toLowerCase(), password: f.password.value,
      job: f.job.value.trim(), hire_date: f.hire_date.value || null, role: f.role.value, is_employee: f.is_employee.checked,
    };
    try {
      await api('/api/users', { method: 'POST', body: JSON.stringify(body) });
      await refreshBase();
      toast(`${body.name}님 계정을 만들었어요 (아이디 ${body.login_id})`);
    } catch (e) { toast(e.message); return; }
    renderView();
  },
  async leavePolicy(f) {
    const patch = {
      leave_mode: f.leave_mode.value || 'custom',
      custom_annual_days: Number(f.custom_annual_days.value || 0),
      custom_first_year_monthly: f.first_year.value === 'monthly',
      custom_first_year_upfront: f.first_year.value === 'upfront',
      custom_first_year_days: Number(f.custom_first_year_days.value || 0),
      custom_seniority: f.custom_seniority.checked,
      work_end: f.work_end.value || '18:00',
      work_start: f.work_start.value || '09:30',
      use_duty: f.use_duty.checked,
      updated_at: new Date().toISOString(),
    };
    try { must(await sb.from('settings').update(patch).eq('id', 1)); await refreshBase(); toast('연차 규정을 저장했어요'); } catch (e) { toast(e.message); }
    renderView();
  },
  async lunch(f) {
    const date = f.date.value;
    const amount = Math.round(Number(f.amount.value));
    if (!date || date > kstToday()) return toast('날짜를 확인해 주세요');
    if (!Number.isFinite(amount) || amount < 0 || amount > 1000000) return toast('금액을 확인해 주세요');
    const uid = state.lunchEdit?.user_id || state.me.id;
    try {
      if (state.lunchEdit && state.lunchEdit.spend_date !== date) {
        must(await sb.from('lunch_expenses').delete().eq('id', state.lunchEdit.id));
      }
      must(await sb.from('lunch_expenses').upsert(
        { user_id: uid, spend_date: date, amount, memo: f.memo.value.trim() || null, updated_at: new Date().toISOString() },
        { onConflict: 'user_id,spend_date' },
      ));
      const over = lunchSplit(amount, lunchSupport()).over;
      toast(over ? `저장했어요 · 본인 부담 ${won(over)}` : '저장했어요');
      state.lunchEdit = null;
    } catch (e) { toast(e.message); }
    renderView();
  },
  async lunchSupport(f) {
    const v = Math.round(Number(f.support.value));
    if (!Number.isFinite(v) || v < 0) return toast('금액을 확인해 주세요');
    try { must(await sb.from('settings').update({ lunch_support: v, updated_at: new Date().toISOString() }).eq('id', 1)); await refreshBase(); toast('지원 한도를 저장했어요'); } catch (e) { toast(e.message); }
    renderView();
  },
  async manualIp(f) { const ip = f.ip.value.trim(); if (ip) await saveIps([...(state.settings.allowed_ips || []), ip]); },
};

document.addEventListener('click', (e) => {
  const b = e.target.closest('[data-action]');
  if (!b || b.disabled) return;
  const fn = actions[b.dataset.action];
  if (fn) { e.preventDefault(); fn(b); }
});
document.addEventListener('submit', (e) => {
  const f = e.target.closest('[data-form]');
  if (!f) return;
  e.preventDefault();
  const fn = forms[f.dataset.form];
  if (fn) fn(f.elements, f);
});
document.addEventListener('change', (e) => {
  const el = e.target.closest('[data-change]');
  if (!el) return;
  if (el.dataset.change === 'logMonth') state.logMonth = el.value || null;
  if (el.dataset.change === 'logUser') state.logUser = el.value;
  if (el.dataset.change === 'lunchMonth') { state.lunchMonth = el.value || null; state.lunchEdit = null; }
  renderView();
});

boot();
