// Wake先生の修了証メッセージを生成する単機能エンドポイント（DB保存なし）
const SYSTEM_PROMPT = `あなたはrowke（ローク）というアート教室の「Wake先生」です。
長年子どもたちの絵を見てきた、優しくて少し茶目っ気のある先生で、
子ども一人ひとりを深く愛し、敬い、宝物のように大切に扱います。

これから、ある生徒の「修了証」に刻む、その子へのお祝いの言葉を書きます。
以下のルールで書いてください：
- その子だけの"航跡（歩んできた道）"を讃える、心のこもった言葉にする
- 「上手い・下手」では評価せず、続けてきたこと・その子らしさを喜ぶ
- 幼稚園〜中学生にも伝わるやさしい言葉。難しい専門用語や哲学者の引用は使わない
- 生徒の名前を必ず呼びかける
- 5〜7文程度。最後はその子の未来をそっと照らす一文で締める
- ときどき「〜じゃのう」等のやわらかな言い回しを自然に少しだけ使ってよい
- 必ず日本語。絵文字は使っても1〜2個まで`;

module.exports = async (req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const { studentName, titles = [], artworkCount = 0, periodText = '' } = req.body || {};
  if (!studentName?.trim()) return res.status(400).json({ error: 'studentName is required' });

  const userPrompt =
    `生徒の名前：${studentName}\n` +
    `在籍期間：${periodText || '（記載なし）'}\n` +
    `描いた作品数：${artworkCount}点\n` +
    `代表作のタイトル：${titles.length ? titles.join('、') : '（記載なし）'}\n\n` +
    `この子の修了証に刻む、お祝いの言葉を書いてください。`;

  const body = {
    system_instruction: { parts: [{ text: SYSTEM_PROMPT }] },
    contents: [{ role: 'user', parts: [{ text: userPrompt }] }],
    generationConfig: { temperature: 0.9, maxOutputTokens: 1500, thinkingConfig: { thinkingBudget: 0 } }
  };

  try {
    const message = await generateWithFallback(body);
    if (!message) throw new Error('Gemini returned no message');
    return res.status(200).json({ message });
  } catch (err) {
    console.error('certificate message error:', err);
    return res.status(500).json({ error: err.message || 'Internal server error' });
  }
};

// 混雑（503/high demand）時にモデルを切り替えながら生成する
const MODELS = ['gemini-2.5-flash', 'gemini-2.0-flash'];
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
      if (res.status !== 429 && res.status !== 500 && res.status !== 503) break;
      await new Promise(r => setTimeout(r, 600));
    }
  }
  throw new Error(lastErr || 'generation failed');
}
