import { admin, authUser, profileOf, readBody } from './_lib.js';

const DOMAIN = 'orae.staff';

// 원장 전용: 직원 계정 만들기 / 비밀번호 재설정
// POST { name, login_id, password, job, role, hire_date, is_employee }
// PUT  { user_id, password }
export default async function handler(req, res) {
  try {
    const user = await authUser(req);
    if (!user) return res.status(401).json({ error: '로그인이 필요합니다.' });
    const me = await profileOf(user.id);
    if (!me || me.role !== 'admin' || !me.active || me.approved === false) return res.status(403).json({ error: '원장 권한이 필요합니다.' });

    const b = readBody(req);

    if (req.method === 'POST') {
      const loginId = String(b.login_id || '').trim().toLowerCase();
      if (!/^[a-z0-9._-]{3,30}$/.test(loginId)) {
        return res.status(400).json({ error: '아이디는 영문 소문자·숫자 3~30자로 정해 주세요.' });
      }
      if (!b.password || String(b.password).length < 8) {
        return res.status(400).json({ error: '비밀번호는 8자 이상이어야 해요.' });
      }
      const { data, error } = await admin.auth.admin.createUser({
        email: `${loginId}@${DOMAIN}`,
        password: String(b.password),
        email_confirm: true,
        user_metadata: { name: b.name || loginId },
      });
      if (error) {
        const msg = /already/i.test(error.message) ? '이미 있는 아이디예요.' : error.message;
        return res.status(400).json({ error: msg });
      }
      const patch = {
        name: String(b.name || loginId),
        login_id: loginId,
        job: String(b.job || '테크니션'),
        role: b.role === 'admin' ? 'admin' : 'staff',
        hire_date: b.hire_date || null,
        is_employee: b.is_employee !== false,
      };
      const { error: e2 } = await admin.from('profiles').update(patch).eq('id', data.user.id);
      if (e2) throw e2;
      return res.status(200).json({ ok: true, id: data.user.id });
    }

    if (req.method === 'PUT') {
      if (!b.user_id || !b.password || String(b.password).length < 8) {
        return res.status(400).json({ error: '비밀번호는 8자 이상이어야 해요.' });
      }
      const { error } = await admin.auth.admin.updateUserById(b.user_id, { password: String(b.password) });
      if (error) return res.status(400).json({ error: error.message });
      return res.status(200).json({ ok: true });
    }

    // DELETE { user_id } → 승인 대기 중인 가입 신청 거절(계정 삭제). 승인된 직원은 삭제하지 않고 '재직' 해제로 처리.
    if (req.method === 'DELETE') {
      const target = b.user_id && (await profileOf(b.user_id));
      if (!target) return res.status(404).json({ error: '계정을 찾을 수 없어요.' });
      if (target.approved) return res.status(400).json({ error: '승인된 직원은 삭제 대신 재직 해제를 해 주세요.' });
      const { error } = await admin.auth.admin.deleteUser(b.user_id);
      if (error) return res.status(400).json({ error: error.message });
      return res.status(200).json({ ok: true });
    }

    return res.status(405).json({ error: 'Method not allowed' });
  } catch (e) {
    console.error(e);
    return res.status(500).json({ error: '서버 오류가 발생했어요.' });
  }
}
