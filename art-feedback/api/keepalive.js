// Supabase 無料プランの「7日間無活動で自動一時停止」を防ぐためのキープアライブ。
// Vercel Cron から1日1回呼ばれ、DBに超軽量クエリ（行を返さない件数HEAD）を投げるだけ。
// 既存の会話データには一切書き込まない（読み取りのみ）。
const { createClient } = require('@supabase/supabase-js');

module.exports = async (req, res) => {
  // Vercel Cron は Authorization: Bearer <CRON_SECRET> を付与する。
  // CRON_SECRET を設定している場合のみ照合（未設定でも動作する）。
  const secret = process.env.CRON_SECRET;
  if (secret && req.headers.authorization !== `Bearer ${secret}`) {
    return res.status(401).json({ error: 'Unauthorized' });
  }

  try {
    const supabase = createClient(
      process.env.SUPABASE_URL,
      process.env.SUPABASE_SERVICE_ROLE_KEY
    );

    // head:true で行本体は取得せず、件数だけ問い合わせる最軽量のアクセス。
    const { error } = await supabase
      .from('art_conversations')
      .select('*', { count: 'exact', head: true });

    if (error) {
      console.error('keepalive query error:', error.message);
      return res.status(500).json({ ok: false, error: error.message });
    }

    return res.status(200).json({ ok: true, pingedAt: new Date().toISOString() });
  } catch (err) {
    console.error('keepalive error:', err.message);
    return res.status(500).json({ ok: false, error: err.message });
  }
};
