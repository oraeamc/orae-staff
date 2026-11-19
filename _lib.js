import { createClient } from '@supabase/supabase-js';

// 서버 전용 관리자 클라이언트 (Vercel 환경변수에서 읽음 — 절대 화면 코드에 넣지 않음)
export const admin = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, {
  auth: { persistSession: false, autoRefreshToken: false },
});

// 요청 보낸 사람 확인
export async function authUser(req) {
  const h = req.headers.authorization || '';
  const token = h.startsWith('Bearer ') ? h.slice(7) : null;
  if (!token) return null;
  const { data, error } = await admin.auth.getUser(token);
  if (error || !data?.user) return null;
  return data.user;
}

export async function profileOf(id) {
  const { data } = await admin.from('profiles').select('*').eq('id', id).maybeSingle();
  return data;
}

// 접속한 인터넷 주소(공인 IP). Vercel이 직접 채우는 헤더라 직원이 위조할 수 없음.
export function clientIp(req) {
  const real = req.headers['x-real-ip'];
  const fwd = (req.headers['x-forwarded-for'] || '').split(',')[0];
  return String(real || fwd || '').trim();
}

// 등록된 주소와 비교. "2001:db8:1:2:*" 처럼 끝에 * 를 붙이면 앞부분만 맞으면 허용.
export function ipAllowed(ip, list) {
  if (!ip) return false;
  return (list || []).some((entry) => {
    const e = String(entry).trim();
    if (!e) return false;
    if (e.endsWith('*')) return ip.startsWith(e.slice(0, -1));
    return ip === e;
  });
}

// 한국 시간 기준 오늘 날짜 (YYYY-MM-DD)
export function kstDate(d = new Date()) {
  return d.toLocaleDateString('sv-SE', { timeZone: 'Asia/Seoul' });
}

export function readBody(req) {
  if (req.body && typeof req.body === 'object') return req.body;
  try { return JSON.parse(req.body || '{}'); } catch { return {}; }
}
