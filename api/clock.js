import { admin, authUser, profileOf, clientIp, ipAllowed, allowedIps, kstDate, readBody } from './_lib.js';

// GET  /api/clock  → 지금 병원 네트워크인지 확인 { ip, allowed }
// POST /api/clock  { action: 'in' | 'out' } → 출근/퇴근 기록
export default async function handler(req, res) {
  try {
    const user = await authUser(req);
    if (!user) return res.status(401).json({ error: '로그인이 필요합니다.' });
    const prof = await profileOf(user.id);
    if (!prof || !prof.active) return res.status(403).json({ error: '사용할 수 없는 계정입니다.' });

    const ip = clientIp(req);
    const allowed = ipAllowed(ip, await allowedIps());

    if (req.method === 'GET') return res.status(200).json({ ip, allowed });
    if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

    if (!allowed) {
      return res.status(403).json({ error: '병원 Wi-Fi에 연결된 상태에서만 출퇴근할 수 있어요.', ip });
    }

    const { action } = readBody(req);
    const now = new Date().toISOString();

    if (action === 'in') {
      const date = kstDate();
      const { data: ex } = await admin.from('attendance').select('*')
        .eq('user_id', user.id).eq('work_date', date).maybeSingle();
      if (ex?.clock_in) return res.status(409).json({ error: '오늘은 이미 출근 기록이 있어요.' });
      const { data, error } = await admin.from('attendance')
        .upsert({ user_id: user.id, work_date: date, clock_in: now, in_ip: ip }, { onConflict: 'user_id,work_date' })
        .select().single();
      if (error) throw error;
      return res.status(200).json({ ok: true, record: data });
    }

    if (action === 'out') {
      // 야간 당직처럼 날짜를 넘기는 근무도 처리: 최근 30시간 안의 퇴근 안 한 기록을 닫음
      const since = new Date(Date.now() - 30 * 3600 * 1000).toISOString();
      const { data: open } = await admin.from('attendance').select('*')
        .eq('user_id', user.id).is('clock_out', null).not('clock_in', 'is', null)
        .gte('clock_in', since).order('clock_in', { ascending: false }).limit(1).maybeSingle();
      if (!open) return res.status(409).json({ error: '퇴근할 출근 기록이 없어요.' });
      const { data, error } = await admin.from('attendance')
        .update({ clock_out: now, out_ip: ip }).eq('id', open.id).select().single();
      if (error) throw error;
      return res.status(200).json({ ok: true, record: data });
    }

    return res.status(400).json({ error: '잘못된 요청입니다.' });
  } catch (e) {
    console.error(e);
    return res.status(500).json({ error: '서버 오류가 발생했어요. 잠시 후 다시 시도해 주세요.' });
  }
}
