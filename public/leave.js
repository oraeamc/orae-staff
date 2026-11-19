// 날짜·연차 계산 (화면과 테스트가 함께 씀)

export const DOW = ['일', '월', '화', '수', '목', '금', '토'];

export function kstToday(d = new Date()) {
  return d.toLocaleDateString('sv-SE', { timeZone: 'Asia/Seoul' });
}
function parseD(s) { const [y, m, d] = s.split('-').map(Number); return new Date(Date.UTC(y, m - 1, d)); }
function fmtD(dt) { return dt.toISOString().slice(0, 10); }
export function addDays(s, n) { const d = parseD(s); d.setUTCDate(d.getUTCDate() + n); return fmtD(d); }
export function dowOf(s) { return parseD(s).getUTCDay(); }
export function mondayOf(s) { const w = dowOf(s); return addDays(s, w === 0 ? -6 : 1 - w); }
export function md(s) { const d = parseD(s); return `${d.getUTCMonth() + 1}/${d.getUTCDate()} (${DOW[d.getUTCDay()]})`; }
export function addYears(s, n) {
  const [y, m, d] = s.split('-').map(Number);
  const dt = new Date(Date.UTC(y + n, m - 1, d));
  if (dt.getUTCDate() !== d) dt.setUTCDate(0); // 2/29 → 2/28
  return fmtD(dt);
}
export function fullMonths(from, to) {
  const [y1, m1, d1] = from.split('-').map(Number);
  const [y2, m2, d2] = to.split('-').map(Number);
  let m = (y2 - y1) * 12 + (m2 - m1);
  if (d2 < d1) m--;
  return Math.max(0, m);
}
export function daysBetween(a, b) { return Math.round((parseD(b) - parseD(a)) / 86400000) + 1; }

// 근로자 수(대표 제외, 재직 중)
export function employeeCount(profiles) {
  return profiles.filter((p) => p.is_employee && p.active && p.approved !== false).length;
}

// 실제 적용되는 규정: 근로자가 기준(기본 5명) 이상이면 원장 설정과 관계없이 법 기준
export function effectiveMode(settings, profiles) {
  return employeeCount(profiles) >= Number(settings.legal_threshold || 5) ? 'legal' : settings.leave_mode;
}

// 근로기준법 제60조 기준
export function legalDays(months) {
  const years = Math.floor(months / 12);
  if (years < 1) return Math.min(11, months);           // 1년 미만: 개근한 달마다 1일, 최대 11일
  return Math.min(25, 15 + Math.floor((years - 1) / 2)); // 1년 이상 15일, 3년차부터 2년마다 +1, 최대 25일
}

export function customDays(months, s) {
  const years = Math.floor(months / 12);
  if (years < 1) return s.custom_first_year_monthly ? Math.min(11, months) : 0;
  return Number(s.custom_annual_days || 0) + (s.custom_seniority ? Math.floor((years - 1) / 2) : 0);
}

// 한 직원의 이번 연차 기간(입사일 기준) 현황
export function leaveInfo(p, settings, profiles, approvedLeaves, today = kstToday()) {
  if (!p.hire_date || p.hire_date > today) return null;
  const mode = effectiveMode(settings, profiles);
  const months = fullMonths(p.hire_date, today);
  const years = Math.floor(months / 12);
  const start = addYears(p.hire_date, years);
  const end = addDays(addYears(p.hire_date, years + 1), -1);
  const base = mode === 'legal' ? legalDays(months) : customDays(months, settings);
  const granted = base + Number(p.leave_adjust || 0);
  const used = approvedLeaves
    .filter((l) => l.user_id === p.id && l.status === 'approved' && l.start_date >= start && l.start_date <= end)
    .reduce((a, l) => a + Number(l.days), 0);
  return { mode, months, years, start, end, granted, used, remain: granted - used };
}

// 신청 일수: 반차 0.5일, 연차는 기간 내 날짜 중 본인 '휴무'로 잡힌 날 제외
export function requestDays(kind, start, end, offDates = []) {
  if (kind === 'am' || kind === 'pm') return 0.5;
  let n = 0;
  for (let d = start; d <= end; d = addDays(d, 1)) if (!offDates.includes(d)) n++;
  return n;
}
