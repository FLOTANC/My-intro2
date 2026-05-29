# rowke（ローク）

絵画教室の先生・生徒・保護者をつなぐ作品フィードバックアプリ。

🔗 https://art-feedback.vercel.app

---

## 機能

- 🖼️ **3Dギャラリー** — 生徒の作品を立体的に展示
- 📝 **講評** — 先生が作品にコメントを投稿
- 📅 **授業情報** — 次回の持ち物・画材・課題の意図を共有
- 📈 **成長記録** — レーダーチャートで技術の伸びを可視化
- 📬 **連絡** — 欠席・遅刻・相談をワンタップで先生に通知
- 🤖 **Wake先生（AIアシスタント）** — 美術・アートの疑問に答えるAI先生

---

## Wake先生について

**Wake先生**は、rowkeのAIアシスタントです。

- 絵画・色彩・技法・画材など、アートに関する質問に答えます
- 幼稚園〜中学生が対話できるやさしい言葉で返答します
- 答えを直接渡すより「なぜそう思うの？」と考えを引き出す問いかけを大切にします
- 生徒の質問履歴は先生が確認できます（Supabaseに保存）
- 生徒が質問するとFirebaseで先生に通知されます

### 使用技術
- AI: Google Gemini 2.5 Flash API
- DB: Supabase（会話履歴）
- 通知: Firebase Realtime Database
- サーバー: Vercel Serverless Functions（`/api/chat`, `/api/history`）

---

## 技術スタック

| 項目 | 内容 |
|---|---|
| フロントエンド | HTML / CSS / Vanilla JS（単一ファイル） |
| 3Dレンダリング | Three.js r128 |
| アニメーション | GSAP |
| リアルタイムDB | Firebase Realtime Database |
| AI | Google Gemini 2.5 Flash |
| 会話履歴DB | Supabase（PostgreSQL） |
| ホスティング | Vercel |

---

## 名前の由来

**rowke** は「Row（漕ぐ）」と「Wake（波）」から生まれた造語。  
船が進んだあとに波の跡が残るように、アートを通じて自分だけの道を切り拓いてほしいという想いを込めています。
