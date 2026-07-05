const { createClient } = require('@supabase/supabase-js');

// ── 簡易IPレート制限（ウォームインスタンス内で有効）──
const HITS = new Map();
function rateLimited(req, max, windowMs) {
  const ip = (req.headers['x-forwarded-for'] || '').split(',')[0].trim() || 'unknown';
  const now = Date.now();
  const arr = (HITS.get(ip) || []).filter(t => now - t < windowMs);
  arr.push(now);
  HITS.set(ip, arr);
  if (HITS.size > 5000) HITS.clear(); // メモリ暴走防止
  return arr.length > max;
}
function pinOk(req) {
  const pin = req.headers['x-teacher-pin'];
  return !!pin && !!process.env.TEACHER_PIN && pin === process.env.TEACHER_PIN;
}

module.exports = async (req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, DELETE, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, x-teacher-pin');
  if (req.method === 'OPTIONS') return res.status(200).end();

  const supabase = createClient(
    process.env.SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY
  );

  // GET: 会話履歴を取得
  if (req.method === 'GET') {
    const { studentName, isTeacher, limit = '30' } = req.query;

    // 先生一覧・全件取得は先生PIN必須。生徒本人分（studentName指定）はPIN不要だがレート制限。
    if (isTeacher === 'true' || !studentName) {
      if (!pinOk(req)) return res.status(403).json({ error: 'この操作は先生のみ行えます' });
    } else if (rateLimited(req, 40, 60000)) {
      return res.status(429).json({ error: 'アクセスが多すぎます。少し待ってください' });
    }

    let query = supabase
      .from('art_conversations')
      .select('*')
      .order('created_at', { ascending: false })
      .limit(parseInt(limit));

    if (studentName) query = query.eq('student_name', studentName);

    const { data, error } = await query;
    if (error) return res.status(500).json({ error: error.message });

    // 先生なら未読数も返す
    if (isTeacher === 'true') {
      const { data: unread } = await supabase
        .from('art_conversations')
        .select('student_name')
        .eq('read_by_teacher', false);

      const unreadByStudent = (unread || []).reduce((acc, row) => {
        acc[row.student_name] = (acc[row.student_name] || 0) + 1;
        return acc;
      }, {});

      return res.status(200).json({ conversations: data, unreadByStudent });
    }

    return res.status(200).json({ conversations: data });
  }

  // POST: 既読にする（先生のみ）
  if (req.method === 'POST') {
    if (!pinOk(req)) return res.status(403).json({ error: 'この操作は先生のみ行えます' });
    const { studentName } = req.body || {};
    let query = supabase
      .from('art_conversations')
      .update({ read_by_teacher: true })
      .eq('read_by_teacher', false);
    if (studentName) query = query.eq('student_name', studentName);
    const { error } = await query;
    if (error) return res.status(500).json({ error: error.message });
    return res.status(200).json({ ok: true });
  }

  // DELETE: 1件の会話を削除（先生のみ）
  if (req.method === 'DELETE') {
    if (!pinOk(req)) return res.status(403).json({ error: 'この操作は先生のみ行えます' });
    const { id } = req.body || {};
    if (!id) return res.status(400).json({ error: 'id is required' });
    const { error } = await supabase
      .from('art_conversations')
      .delete()
      .eq('id', id);
    if (error) return res.status(500).json({ error: error.message });
    return res.status(200).json({ ok: true });
  }

  return res.status(405).end();
};
