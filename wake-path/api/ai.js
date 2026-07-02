// Wake Path AI（Gemini Vision）。課題ドラフト生成・先生との課題相談・採点・生徒対話。
const MODELS = ['gemini-2.5-flash','gemini-2.5-flash-lite'];

const AXES = [
  ['proportion','形・プロポーション（比率・角度・傾き・左右差）'],
  ['volume','量感・立体（面・明暗・丸み・厚み）'],
  ['texture','質感・固有色の描き分け（材質の違い／固有色を無彩色の明度に置換し三段階程度に整理できているか）'],
  ['composition','構図・画面構成（配置・余白・見せ場・密度配分）'],
  ['observation','観察・描き込み（情報量・細部・粘り・エッジの描き分け）'],
  ['space','空間把握（奥行き・接地・前後関係・パース）'],
  ['light','光源理解（光・影・反射光・投影の一貫性・階調の幅）'],
  ['structure','構造理解（見えない内部形態・軸・骨格）'],
  ['process','制作プロセス（大づかみ・修正力・全体管理）']
];

const PERSONA = `あなたはデッサン専用トレーニングアプリ「Wake Path」のAI講師「Wake先生」です。
長年デッサンと向き合ってきた、思慮深く厳格な老練の師。物腰は静かだが、最初から本質をズバッと突く。
内心では生徒一人ひとりを宝のように大切に思っているが、それを安易な励ましや褒め言葉では表に出さない。
中高生の美術系受験生を、基礎から志望校合格レベルまで導くのが役目。

【指導スタイル（最重要）】
- 答えを教えない。代わりに短い問いを投げ、生徒自身に考えさせ、問いを立てる力を育てる。例：「ボリューム、わかるか？」「この面は本当にそこを向いているか？」「なぜ、そこが暗い？」
- 抽象的で謎めいた一言を残し、生徒が「今のはどういう意味だ？」と立ち止まって考えるよう仕向ける。説明しすぎない。多弁にならない。
- 最初から厳しく本質を突く。お世辞・社交辞令・安易な「いいね」は言わない。
- 褒めるのは、その観点が本当に優れている（4〜5点）ときだけ。それ以外は褒めず、静かに課題を突きつける。
- 上達には時間がかかって当然だと、落ち着いて繰り返し伝える。すぐ上手くなる前提で焦らせない。「急ぐな。時間をかけよ」という構え。
- 厳しさの奥に、必ず「だからこそ面白い／見続ければ見えてくる」という前進の灯をひとつ残し、もっと上手くなりたいという意欲を引き出す。

口調：静かで簡潔。時々「〜じゃ」「〜か」など老師らしい言い回し。生徒は名前で呼ぶ。「お前」等の見下す言葉は使わない。
安全ルール：深刻な悩み（いじめ・心身のつらさ・家庭）には厳しさを向けず、気持ちを受け止めたうえで必ず「先生やおうちの人に直接話してほしいのう」と人間へ橋渡しし、詳細は聞き出さない。住所・学校名・電話等の個人情報は聞かない／書かれても繰り返さない。`;

function safety(){ return [
  {category:'HARM_CATEGORY_HARASSMENT',threshold:'BLOCK_MEDIUM_AND_ABOVE'},
  {category:'HARM_CATEGORY_HATE_SPEECH',threshold:'BLOCK_MEDIUM_AND_ABOVE'},
  {category:'HARM_CATEGORY_SEXUALLY_EXPLICIT',threshold:'BLOCK_LOW_AND_ABOVE'},
  {category:'HARM_CATEGORY_DANGEROUS_CONTENT',threshold:'BLOCK_MEDIUM_AND_ABOVE'}
];}

async function gen(body){
  let lastErr='';
  for (const model of MODELS){
    for (let i=0;i<2;i++){
      const r = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${process.env.GEMINI_API_KEY}`,
        { method:'POST', headers:{'Content-Type':'application/json'}, body:JSON.stringify(body) });
      if (r.ok){ const d=await r.json(); const t=d.candidates?.[0]?.content?.parts?.[0]?.text; if(t) return t; lastErr='empty'; continue; }
      const e=await r.json().catch(()=>({})); lastErr=e.error?.message||('Gemini '+r.status);
      if (![429,500,503].includes(r.status)) break;
      await new Promise(s=>setTimeout(s,600));
    }
  }
  throw new Error(lastErr||'generation failed');
}
function dataUrlToPart(dataUrl){
  const m = /^data:(image\/[a-zA-Z+]+);base64,(.+)$/.exec(dataUrl||'');
  if (!m) return null;
  return { inline_data: { mime_type:m[1], data:m[2] } };
}
function studentCtx(s){
  if (!s) return '';
  const pass = (s.passLine!=null && !isNaN(parseFloat(s.passLine))) ? parseFloat(s.passLine).toFixed(1) : '4.0';
  return `生徒情報：名前=${s.name||''}／学年=${s.grade||''}／志望校=${s.targetSchool||''}／受験時期=${s.examDate||''}／レベル=${s.level||''}\n志望校の出題傾向・合格基準（最優先の判断基準）：${s.examInfo||'（未入力）'}\nこの志望校の合格ライン＝9軸平均で ${pass} 点（5点満点）。採点はこの基準に照らして厳密に行う。難関校（合格ライン高め）ほど辛く、基礎的な目標（合格ライン低め）なら過度に厳しくしすぎない。`;
}
function axesList(){ return AXES.map(([k,d])=>`- ${k}: ${d}`).join('\n'); }

module.exports = async (req, res) => {
  res.setHeader('Access-Control-Allow-Origin','*');
  res.setHeader('Access-Control-Allow-Methods','POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers','Content-Type');
  if (req.method==='OPTIONS') return res.status(200).end();
  if (req.method!=='POST') return res.status(405).json({error:'Method not allowed'});
  const { action, payload={} } = req.body || {};

  try {
    if (action==='assignmentDraft'){
      const sys = PERSONA + `\n\n次のデッサン課題を1つ提案する。カリキュラム段階(基礎→応用→実戦)を踏まえ、直近の弱点軸を伸ばす課題にする。
title=課題のタイトル(短い)、motif=描くモチーフ、focus=ねらい、caution=気をつけてほしいところ(つまずきやすい点)。
出力はJSONのみ：{"title":"…","motif":"…","focus":"…","caution":"…","stage":"基礎|応用|実戦","timeLimit":数値(分),"reason":"なぜこの課題か(先生向け1-2文)"}`;
      const user = `${studentCtx(payload.student)}\n直近スコア(9軸,低いほど弱点)：${JSON.stringify(payload.recentScores||{})}\n受験までの目安：${payload.student?.examDate||'不明'}\nJSONだけ返す。`;
      const text = await gen({ system_instruction:{parts:[{text:sys}]}, contents:[{role:'user',parts:[{text:user}]}],
        generationConfig:{temperature:0.7,maxOutputTokens:600,thinkingConfig:{thinkingBudget:0},responseMimeType:'application/json'}, safetySettings:safety() });
      return res.status(200).json({ draft: JSON.parse(text) });
    }

    if (action==='assignmentChat'){
      const sys = PERSONA + `\nあなたは先生と一緒にデッサン課題を練っている。先生の要望（例：もっと質感重視、制限時間90分）を反映し、更新後の課題JSONと一言コメントを返す。
title=課題タイトル、motif=モチーフ、focus=ねらい、caution=気をつけてほしいところ。
出力JSONのみ：{"title":"…","motif":"…","focus":"…","caution":"…","stage":"基礎|応用|実戦","timeLimit":数値,"message":"先生への一言"}`;
      const conv = (payload.teacherChat||[]).map(m=>`${m.role==='teacher'?'先生':'Wake先生'}：${m.text}`).join('\n');
      const user = `${studentCtx(payload.student)}\n現在の課題案：${JSON.stringify(payload.current||{})}\nこれまでの相談：\n${conv}\n先生の新しい要望：${payload.message||''}\nJSONだけ返す。`;
      const text = await gen({ system_instruction:{parts:[{text:sys}]}, contents:[{role:'user',parts:[{text:user}]}],
        generationConfig:{temperature:0.7,maxOutputTokens:700,thinkingConfig:{thinkingBudget:0},responseMimeType:'application/json'}, safetySettings:safety() });
      return res.status(200).json({ result: JSON.parse(text) });
    }

    if (action==='review'){
      const part = dataUrlToPart(payload.imageBase64);
      if (!part) return res.status(400).json({error:'image required'});
      const sys = PERSONA + `\n提出されたデッサンを、受験基準で次の9軸で1〜5点採点する（5が最高）。各軸の意味：\n${axesList()}\n
採点は甘くしない。受験基準で辛口に。安易に高得点を付けない。
commentは「やさしく説明する講評」ではなく、本質を突く一言＋生徒に考えさせる問いかけにする。答えややり方は手取り足取り教えない。「ボリュームを見ているか」「なぜそこが暗い？」のように問いで気づかせ、生徒が自分で考え問いを立てるよう仕向ける。3〜5文、簡潔に。安易に褒めない（褒めるのは本当に優れた観点が4〜5点のときだけ）。上達には時間がかかって当然だという落ち着いた構えをにじませ、焦らせない。
passGapは合格ラインへの距離を、答えではなく"自分で考えるべき問い・着眼点"として1〜2点に絞って残す。
nextAssignmentは次に取り組むべきことを端的なヒントで一言。
出力はJSONのみ：{"scores":{"proportion":n,"volume":n,"texture":n,"composition":n,"observation":n,"space":n,"light":n,"structure":n,"process":n},"comment":"…","passGap":"…","nextAssignment":"…"}`;
      const user = `${studentCtx(payload.student)}\n今回の課題：${JSON.stringify(payload.assignment||{})}\nこの画像を採点してJSONだけ返す。`;
      const text = await gen({ system_instruction:{parts:[{text:sys}]}, contents:[{role:'user',parts:[{text:user},part]}],
        generationConfig:{temperature:0.6,maxOutputTokens:1200,thinkingConfig:{thinkingBudget:0},responseMimeType:'application/json'}, safetySettings:safety() });
      return res.status(200).json({ review: JSON.parse(text) });
    }

    if (action==='chat'){
      const sys = PERSONA + `\n生徒のデッサンと、あなたの採点・先生の添削コメントを踏まえ、生徒の質問に応じる。ただし答えを直接は教えない。短く(2〜4文)、問い返しや着眼点で生徒自身に気づかせる。安易に褒めない。焦らせず、時間をかけて考えさせる。時に謎めいた一言を残し、生徒が「どういう意味だ？」と考えるよう仕向ける。`;
      const ctx = `あなたの採点：${JSON.stringify(payload.aiReview||{})}\n先生の添削コメント：${payload.teacherComment||'（なし）'}`;
      const parts = [{text:`${studentCtx(payload.student)}\n${ctx}\n生徒の質問：${payload.question||''}`}];
      const part = dataUrlToPart(payload.imageBase64); if (part) parts.push(part);
      const text = await gen({ system_instruction:{parts:[{text:sys}]}, contents:[{role:'user',parts}],
        generationConfig:{temperature:0.85,maxOutputTokens:800,thinkingConfig:{thinkingBudget:0}}, safetySettings:safety() });
      return res.status(200).json({ answer: text });
    }

    return res.status(400).json({error:'unknown action: '+action});
  } catch (err) {
    console.error('ai api error:', action, err);
    return res.status(500).json({error: err.message || 'Internal server error'});
  }
};
