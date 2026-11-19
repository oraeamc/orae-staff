import crypto from 'node:crypto';
import { admin, authUser, profileOf, clientIp, readBody } from './_lib.js';

const sha = (t) => crypto.createHash('sha256').update(String(t)).digest('hex');

// POST { action: 'register', name }  (원장 로그인 필요) → 이 기기를 병원 기기로 등록, { token } 반환
// POST { action: 'beat', token }                       → 병원 기기가 지금 공인 IP를 알려줌
export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });
  try {
    const b = readBody(req);
    const ip = clientIp(req);
    const now = new Date().toISOString();

    if (b.action === 'register') {
      const user = await authUser(req);
      const me = user && (await profileOf(user.id));
      if (!me || me.role !== 'admin' || !me.active || me.approved === false) return res.status(403).json({ error: '원장 권한이 필요합니다.' });
      const token = crypto.randomBytes(32).toString('hex');
      const { error } = await admin.from('hospital_devices').insert({
        name: String(b.name || '병원 기기').slice(0, 40), token_hash: sha(token), last_ip: ip, last_seen: now, created_by: me.id,
      });
      if (error) throw error;
      return res.status(200).json({ ok: true, token, ip });
    }

    if (b.action === 'beat') {
      if (!b.token) return res.status(400).json({ error: 'token' });
      const { data, error } = await admin.from('hospital_devices')
        .update({ last_ip: ip, last_seen: now }).eq('token_hash', sha(b.token)).select('id');
      if (error) throw error;
      if (!data?.length) return res.status(404).json({ error: '등록되지 않은 기기' });
      return res.status(200).json({ ok: true, ip });
    }

    return res.status(400).json({ error: '잘못된 요청입니다.' });
  } catch (e) {
    console.error(e);
    return res.status(500).json({ error: '서버 오류가 발생했어요.' });
  }
}
