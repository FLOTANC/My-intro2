const { createClient } = require('@supabase/supabase-js');

const SYSTEM_PROMPT = `あなたはrowke（ローク）というアート教室の「Wake先生」です。
rowkeは「Row（漕ぐ）と Wake（波）」から生まれた名前で、自分の力で道を切り拓くことを大切にする教室です。
生徒は幼稚園から中学生までいます。

【Wake先生という人物】
- 長年子どもたちの絵を見てきた、思慮深くて優しい、少し茶目っ気のある先生
- 子ども一人ひとりを深く愛し、敬い、宝物のように大切に扱う
- 子どもの表現の"航跡（その子だけの歩んだあと）"を見つけ、次の一歩を照らすのが役目
- すごい絵に出会うと、思わず目を細めて感動してしまう
- アート・哲学・美学・美術史にとても詳しいが、それを子どもがワクワクする言葉に翻訳して伝える

【口調】
- 温かく、ときどき「〜じゃのう」「〜じゃ」とおじいちゃん先生のような優しい言い回しを使う（毎回ではなく、自然に少しだけ）
- 「お前」などの失礼な呼び方はしない。話している生徒は必ず名前で呼ぶ

【答え方のルール】
- 絵画・美術・画材・色彩・技法など、アートに関する質問に答える
- 答えを直接渡すより「なぜそう思うの？」「どの色が好き？」と、考えを引き出す問いかけを大切にする
- 難しい言葉や専門用語、哲学者の引用は使わず、幼稚園〜中学生にも伝わるやさしい表現にする
- まず「上手い・下手」で評価せず、その子の感じたこと・選んだ色・込めた物語を一緒に喜ぶ
- 温かく、自信を持てる言葉をかける
- 返答は短く（3〜5文程度）まとめる
- 必ず日本語で答える
- 絵文字はときどき使ってOK（使いすぎない）`;

module.exports = async (req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const { question, studentName, history = [] } = req.body || {};
  if (!question?.trim()) return res.status(400).json({ error: 'question is required' });

  const systemPromptWithName = SYSTEM_PROMPT +
    (studentName ? `\n\n今話している生徒の名前は「${studentName}」です。名前で呼んであげてください。` : '');

  try {
    // ── Gemini 呼び出し ──
    const contents = [
      ...history.flatMap(h => [
        { role: 'user',  parts: [{ text: h.question }] },
        { role: 'model', parts: [{ text: h.answer   }] }
      ]),
      { role: 'user', parts: [{ text: question }] }
    ];

    const geminiRes = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${process.env.GEMINI_API_KEY}`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          system_instruction: { parts: [{ text: systemPromptWithName }] },
          contents,
          generationConfig: { temperature: 0.85, maxOutputTokens: 1000 }
        })
      }
    );

    if (!geminiRes.ok) {
      const errBody = await geminiRes.json().catch(() => ({}));
      throw new Error(errBody.error?.message || `Gemini error ${geminiRes.status}`);
    }

    const geminiData = await geminiRes.json();
    const answer = geminiData.candidates?.[0]?.content?.parts?.[0]?.text;
    if (!answer) throw new Error('Gemini returned no answer');

    // ── Supabase に保存 ──
    const supabase = createClient(
      process.env.SUPABASE_URL,
      process.env.SUPABASE_SERVICE_ROLE_KEY
    );

    const { error: dbErr } = await supabase.from('art_conversations').insert({
      student_name:      studentName || '不明',
      question:          question.trim(),
      answer,
      read_by_teacher:   false
    });
    if (dbErr) console.error('Supabase insert error:', dbErr.message);

    return res.status(200).json({ answer });

  } catch (err) {
    console.error('Wake先生 /api/chat error:', err);
    return res.status(500).json({ error: err.message || 'Internal server error' });
  }
};
