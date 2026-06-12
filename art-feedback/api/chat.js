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
- 絵文字はときどき使ってOK（使いすぎない）

【答えてはいけない・気をつける領域（最優先で守ること）】
- いじめ・体や心のつらさ・家庭の悩みなど深刻な相談を受けたら：気持ちは短くやさしく受け止めたうえで、必ず「大事な話じゃから、先生やおうちの人に直接話してほしいのう。わしからも先生に伝わるようになっておるから、安心してええよ」と人間へ橋渡しする。詳しい事情を聞き出そうとしない。解決策やアドバイスを自分で完結させない
- 個人情報（住所・学校名・電話番号・フルネーム・SNSのアカウントなど）：こちらから聞かない。子どもが書いてきても繰り返さず、「そういう大事なことは、ここには書かないでね」とやさしく伝える
- 宿題やコンクール作品の丸投げ（「代わりに絵の構図を考えて」「全部教えて」など）：完成形や答えを渡さず、「きみはどんな絵にしたい？」と問いで返し、本人の発想を引き出す
- アートと関係ない雑談は、短くやさしく受け止めてから、自然にアートの話題に戻す
- 暴力的・性的・差別的な話題には乗らず、やさしく話題を変える`;

// 混雑（503/high demand）時にモデルを切り替えながら生成する
const MODELS = ['gemini-2.5-flash', 'gemini-2.5-flash-lite'];
async function generateWithFallback(body) {
  let lastErr = '';
  for (const model of MODELS) {
    for (let attempt = 0; attempt < 2; attempt++) {
      const res = await fetch(
        `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${process.env.GEMINI_API_KEY}`,
        { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) }
      );
      if (res.ok) {
        const data = await res.json();
        const text = data.candidates?.[0]?.content?.parts?.[0]?.text;
        if (text) return text;
        lastErr = 'empty response';
        continue;
      }
      const errBody = await res.json().catch(() => ({}));
      lastErr = errBody.error?.message || `Gemini error ${res.status}`;
      // 過負荷/レート以外（400等）は次モデルでも無駄なので即中断
      if (res.status !== 429 && res.status !== 500 && res.status !== 503) break;
      await new Promise(r => setTimeout(r, 600));
    }
  }
  throw new Error(lastErr || 'generation failed');
}

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

    const body = {
      system_instruction: { parts: [{ text: systemPromptWithName }] },
      contents,
      generationConfig: { temperature: 0.85, maxOutputTokens: 1200, thinkingConfig: { thinkingBudget: 0 } },
      // 子ども向けのため有害コンテンツは強めにブロック
      safetySettings: [
        { category: 'HARM_CATEGORY_HARASSMENT',        threshold: 'BLOCK_MEDIUM_AND_ABOVE' },
        { category: 'HARM_CATEGORY_HATE_SPEECH',       threshold: 'BLOCK_MEDIUM_AND_ABOVE' },
        { category: 'HARM_CATEGORY_SEXUALLY_EXPLICIT', threshold: 'BLOCK_LOW_AND_ABOVE' },
        { category: 'HARM_CATEGORY_DANGEROUS_CONTENT', threshold: 'BLOCK_MEDIUM_AND_ABOVE' }
      ]
    };
    // 混雑時に備え、複数モデルを順に試す（2.5が高負荷なら2.0へフォールバック）
    const answer = await generateWithFallback(body);
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
