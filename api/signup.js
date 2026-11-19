import { admin, clientIp, ipAllowed, allowedIps, readBody } from './_lib.js';

const DOMAIN = 'orae.staff';

// POST { name, login_id, password } → 가입 신청 (병원 Wi-Fi에서만, 원장 승인 전까지 사용 불가)
export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });
  try {
    const ip = clientIp(req);
    if (!ipAllowed(ip, await allowedIps())) {
      return res.status(403).json({ error: '가입 신청은 병원 Wi-Fi에 연결된 상태에서만 할 수 있어요.' });
    }
    const b = readBody(req);
    const name = String(b.name || '').trim().slice(0, 30);
    const loginId = String(b.login_id || '').trim().toLowerCase();
    if (!name) return res.status(400).json({ error: '이름을 입력해 주세요.' });
    if (!/^[a-z0-9._-]{3,30}$/.test(loginId)) return res.status(400).json({ error: '아이디는 영문 소문자·숫자 3~30자로 정해 주세요.' });
    if (!b.password || String(b.password).length < 8) return res.status(400).json({ error: '비밀번호는 8자 이상이어야 해요.' });

    const { error } = await admin.auth.admin.createUser({
      email: `${loginId}@${DOMAIN}`,
      password: String(b.password),
      email_confirm: true,
      user_metadata: { name, self_signup: 'true' },
    });
    if (error) {
      const msg = /already/i.test(error.message) ? '이미 있는 아이디예요. 다른 아이디를 써 주세요.' : error.message;
      return res.status(400).json({ error: msg });
    }
    return res.status(200).json({ ok: true });
  } catch (e) {
    console.error(e);
    return res.status(500).json({ error: '서버 오류가 발생했어요.' });
  }
}
