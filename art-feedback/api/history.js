const { createClient } = require('@supabase/supabase-js');

module.exports = async (req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(200).end();

  const supabase = createClient(
    process.env.SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY
  );

  // GET: 会話履歴を取得
  if (req.method === 'GET') {
    const { studentName, isTeacher, limit = '30' } = req.query;

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

  // POST: 既読にする
  if (req.method === 'POST') {
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

  return res.status(405).end();
};
