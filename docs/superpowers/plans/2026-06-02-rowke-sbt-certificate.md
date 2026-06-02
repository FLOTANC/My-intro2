# rowke 修了証SBT（体験デモ版）Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** rowke（art-feedback アプリ）に、先生が生徒の修了証SBT（譲渡不可・体験デモ）を発行し、一意URLの証明書ページでPNG保存できる機能を追加する。

**Architecture:** 証明書データは既存の Firebase Realtime DB `art/certificates/{token_id}` に保存（作品は既存IDを参照）。Wake先生の祝福メッセージのみ新規 Vercel サーバーレス関数 `api/certificate.js` が Gemini で生成（Supabase には保存しない）。証明書ページは独立した `certificate.html` が Firebase から直接読み込み、素の Canvas API で PNG 化する。発行処理は `issueCertificate()` 1関数に集約し、将来の本物 mint に差し替え可能にする。

**Tech Stack:** Vanilla HTML/CSS/JS（単一ファイル）、Firebase Realtime DB（CDN、既存）、Vercel Serverless Functions、Google Gemini 2.5 Flash。新規ライブラリは追加しない。

**検証方針:** このリポジトリにテストランナーは存在せず、新規ライブラリ追加は禁止（CLAUDE.md）。したがって自動テストの代わりに、各タスクで「Vercel プレビュー deploy ＋ curl」「ブラウザ（プレビューサーバー）＋ DevTools コンソール」「Firebase コンソール目視」による具体的な手動検証を行う。

---

## File Structure

- **Create** `art-feedback/api/certificate.js`
  Wake先生の祝福メッセージを Gemini で生成する単機能エンドポイント（DB保存なし）。
- **Create** `art-feedback/certificate.html`
  一意URL（`?id=TOKEN_ID`）で証明書を表示し、素 Canvas で PNG ダウンロードする独立ページ。
- **Modify** `art-feedback/index.html`
  先生ビューに「修了証を発行」フロー、生徒/保護者ビューに「わたしの修了証」、
  `issueCertificate()`・token_id 生成・証明書発行 UI/ロジックを追加。

---

## データレコード形（全タスク共通の参照仕様）

`art/certificates/{token_id}` に保存する JSON：

```js
{
  token_id:    "ROWKE-2026-0001-a3f9",   // 一意ID
  studentName: "はなこ",
  artworkIds:  ["-Nxxxx1", "-Nxxxx2"],    // 既存 art/artworks のキー
  wakeMessage: "はなこへ。きみの……",        // Wake先生の言葉
  periodText:  "2025.4〜2026.3",
  artworkCount: 12,
  issuedAt:    1717300000000,             // Date.now()
  issuer:      "先生",
  soulbound:   true,
  metadata: {                              // ERC-721 互換（将来 mint 用）
    name: "rowke 修了証 — はなこ",
    description: "はなこの航跡の証。Wake先生より。",
    image: "",                             // 将来 PNG/IPFS URL を入れる想定。初版は空
    attributes: [
      { trait_type: "period",       value: "2025.4〜2026.3" },
      { trait_type: "artworkCount", value: 12 },
      { trait_type: "soulbound",    value: "true" }
    ]
  }
}
```

---

### Task 1: Wake先生の祝福メッセージ生成 API

**Files:**
- Create: `art-feedback/api/certificate.js`

- [ ] **Step 1: エンドポイントを作成**

`art-feedback/api/certificate.js` を新規作成：

```js
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

  try {
    const geminiRes = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${process.env.GEMINI_API_KEY}`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          system_instruction: { parts: [{ text: SYSTEM_PROMPT }] },
          contents: [{ role: 'user', parts: [{ text: userPrompt }] }],
          generationConfig: { temperature: 0.9, maxOutputTokens: 600 }
        })
      }
    );
    if (!geminiRes.ok) {
      const errBody = await geminiRes.json().catch(() => ({}));
      throw new Error(errBody.error?.message || `Gemini error ${geminiRes.status}`);
    }
    const data = await geminiRes.json();
    const message = data.candidates?.[0]?.content?.parts?.[0]?.text;
    if (!message) throw new Error('Gemini returned no message');
    return res.status(200).json({ message });
  } catch (err) {
    console.error('certificate message error:', err);
    return res.status(500).json({ error: err.message || 'Internal server error' });
  }
};
```

- [ ] **Step 2: プレビュー deploy して動作確認**

Run:
```bash
cd art-feedback && vercel --yes
```
表示された preview URL（例 `https://art-feedback-xxxx.vercel.app`）を控える。

- [ ] **Step 3: curl で生成を確認**

Run（`<PREVIEW_URL>` を Step 2 のURLに置換）:
```bash
curl -s -X POST <PREVIEW_URL>/api/certificate \
  -H 'Content-Type: application/json' \
  -d '{"studentName":"はなこ","titles":["うみのなかま"],"artworkCount":12,"periodText":"2025.4〜2026.3"}'
```
Expected: `{"message":"はなこへ。……"}` の形で、名前を呼びかける日本語メッセージが返る。
（`error` が返る場合は Vercel 環境変数 `GEMINI_API_KEY` が preview 環境に設定されているか確認）

- [ ] **Step 4: 不正入力の確認**

Run:
```bash
curl -s -X POST <PREVIEW_URL>/api/certificate -H 'Content-Type: application/json' -d '{}'
```
Expected: HTTP 400 相当、`{"error":"studentName is required"}`

- [ ] **Step 5: Commit**

```bash
cd "/Users/fujitatakako/デスクトップ/claude"
git add art-feedback/api/certificate.js
git commit -m "feat: add Wake先生 certificate message API"
```

---

### Task 2: token_id 生成と issueCertificate() ロジック

**Files:**
- Modify: `art-feedback/index.html`（`db` 定義より後ろのスクリプト領域に関数を追加。
  目印として `function goBack()`（現状 1765 行付近）の直後に挿入する）

- [ ] **Step 1: ユーティリティ関数を追加**

`art-feedback/index.html` の `function goBack() { switchTab('artworks'); }` の直後に、次のブロックを挿入：

```js
  // ===== 修了証（SBT 体験デモ） =====
  // その生徒の作品キー一覧（新しい順）
  function studentArtworkEntries(studentName) {
    return Object.entries(artworks)
      .filter(([, a]) => (a.studentName || '') === studentName)
      .sort((x, y) => (y[1].ts || 0) - (x[1].ts || 0));
  }

  // 在籍期間テキストを作品の最古〜最新 ts から作る（例 "2025.4〜2026.3"）
  function defaultPeriodText(studentName) {
    const entries = studentArtworkEntries(studentName);
    if (!entries.length) return '';
    const tss = entries.map(([, a]) => a.ts || 0).filter(Boolean);
    if (!tss.length) return '';
    const fmt = ms => { const d = new Date(ms); return `${d.getFullYear()}.${d.getMonth() + 1}`; };
    const min = fmt(Math.min(...tss)), max = fmt(Math.max(...tss));
    return min === max ? min : `${min}〜${max}`;
  }

  // 一意 token_id を生成: ROWKE-{年}-{4桁連番}-{4桁hash}
  async function generateTokenId() {
    const year = new Date().getFullYear();
    const snap = await db.ref('art/certificates').once('value');
    const all = snap.val() || {};
    const seq = Object.keys(all).filter(k => k.startsWith(`ROWKE-${year}-`)).length + 1;
    const hash = Math.random().toString(36).slice(2, 6);
    return `ROWKE-${year}-${String(seq).padStart(4, '0')}-${hash}`;
  }

  // 証明書を発行して Firebase に保存。保存した token_id を返す。
  // ※将来の本物 SBT 化は、この関数内に mint 処理を足すだけで済むよう集約している。
  async function issueCertificate({ studentName, artworkIds, wakeMessage, periodText, artworkCount }) {
    const tokenId = await generateTokenId();
    const viewer = getViewer();
    const record = {
      token_id: tokenId,
      studentName,
      artworkIds,
      wakeMessage,
      periodText,
      artworkCount,
      issuedAt: Date.now(),
      issuer: (viewer && viewer.role === 'teacher') ? '先生' : (viewer?.name || 'unknown'),
      soulbound: true,
      metadata: {
        name: `rowke 修了証 — ${studentName}`,
        description: `${studentName}の航跡の証。Wake先生より。`,
        image: '',
        attributes: [
          { trait_type: 'period',       value: periodText || '' },
          { trait_type: 'artworkCount', value: artworkCount },
          { trait_type: 'soulbound',    value: 'true' }
        ]
      }
    };
    await db.ref('art/certificates/' + tokenId).set(record);
    return tokenId;
  }

  // 証明書ページの URL を組み立てる
  function certificateUrl(tokenId) {
    return location.origin + '/certificate.html?id=' + encodeURIComponent(tokenId);
  }
```

- [ ] **Step 2: 構文エラーがないことを確認**

Run:
```bash
cd "/Users/fujitatakako/デスクトップ/claude/art-feedback"
node --check <(sed -n '/<script>/,/<\/script>/p' index.html | sed '1d;$d') 2>&1 | head -5 || echo "（複数scriptのため node --check は参考。次の手順でブラウザ確認する）"
```
注: 単一HTML内に複数 `<script>` があるため上記は完全ではない。確実な確認は Step 3 のブラウザ読み込み。

- [ ] **Step 3: ブラウザでコンソールエラーがないことを確認**

プレビューサーバーで `art-feedback/index.html` を開き、DevTools コンソールに赤いエラーが出ていないことを確認する（既存機能が壊れていない）。
さらにコンソールで次を実行し、関数が定義済みであることを確認：
```js
typeof issueCertificate === 'function' && typeof generateTokenId === 'function' && typeof defaultPeriodText === 'function'
```
Expected: `true`

- [ ] **Step 4: Commit**

```bash
cd "/Users/fujitatakako/デスクトップ/claude"
git add art-feedback/index.html
git commit -m "feat: add certificate token_id and issueCertificate logic"
```

---

### Task 3: 先生ビューに「修了証を発行」画面を追加（UI のみ）

**Files:**
- Modify: `art-feedback/index.html`
  - 先生ビュー `#wake-teacher-view`（1351 行付近）の中、`#wake-teacher-list` の直前にボタンを追加
  - 新しい発行画面 `#screen-cert-issue` を `<!-- ===== WAKE先生 ===== -->` ブロックの直後に追加
  - 発行画面用の最小スタイルを Wake先生スタイル領域（`.wake-en { ... }` の直後）に追加

- [ ] **Step 1: 発行画面のスタイルを追加**

`.wake-en { ... }` 定義の直後に追加：

```css
    /* ── 修了証 発行画面 ── */
    .cert-issue-wrap { padding:20px; display:flex; flex-direction:column; gap:18px; }
    .cert-issue-wrap h2 { font-size:18px; font-weight:700; }
    .cert-field-label { font-size:13px; font-weight:600; color:var(--muted); margin-bottom:6px; }
    .cert-student-select, .cert-period-input, .cert-msg-area {
      width:100%; padding:12px 14px; border:1px solid var(--rule); border-radius:12px;
      font-size:14px; font-family:inherit; background:var(--card); color:var(--text);
    }
    .cert-msg-area { min-height:120px; line-height:1.6; resize:vertical; }
    .cert-artwork-pick { display:grid; grid-template-columns:repeat(3,1fr); gap:10px; }
    .cert-artwork-cell { border:2px solid var(--rule); border-radius:12px; overflow:hidden; cursor:pointer; position:relative; }
    .cert-artwork-cell.selected { border-color:var(--navy); }
    .cert-artwork-cell img { width:100%; aspect-ratio:1/1; object-fit:cover; display:block; }
    .cert-artwork-cell .cert-check { position:absolute; top:6px; right:6px; width:22px; height:22px;
      border-radius:50%; background:var(--navy); color:#fff; display:none; align-items:center; justify-content:center; font-size:13px; }
    .cert-artwork-cell.selected .cert-check { display:flex; }
    .cert-issue-actions { display:flex; gap:10px; }
    .cert-issue-result { padding:14px; border:1px solid var(--rule); border-radius:12px; background:var(--card); font-size:13px; word-break:break-all; }
    .cert-issue-result a { color:var(--navy); font-weight:600; }
```

- [ ] **Step 2: 先生ビューに導線ボタンを追加**

`#wake-teacher-view` 内、`<div id="wake-teacher-list" class="wake-teacher-list"></div>` の直前に追加：

```html
      <div style="padding:0 20px 12px;">
        <button class="btn-primary" style="width:100%;padding:12px;font-size:14px;"
          onclick="openCertIssue()">🏅 修了証を発行する</button>
      </div>
```

- [ ] **Step 3: 発行画面の本体を追加**

`<!-- ===== WAKE先生 ===== -->` 〜 その `#screen-wake` 終了 `</div>` の直後（次の screen が始まる前）に、新しい screen を追加：

```html
<!-- ===== 修了証 発行 ===== -->
<div id="screen-cert-issue" class="screen">
  <div class="topbar">
    <div class="topbar-back" onclick="switchTab('wake')">‹</div>
    <div class="topbar-title">修了証を発行</div>
  </div>
  <div class="cert-issue-wrap">
    <div>
      <div class="cert-field-label">生徒を選ぶ</div>
      <select id="cert-student" class="cert-student-select" onchange="onCertStudentChange()">
        <option value="">— 生徒を選択 —</option>
      </select>
    </div>
    <div id="cert-artwork-section" style="display:none;">
      <div class="cert-field-label">代表作品を選ぶ（タップで選択／複数可）</div>
      <div id="cert-artwork-pick" class="cert-artwork-pick"></div>
    </div>
    <div id="cert-detail-section" style="display:none;">
      <div>
        <div class="cert-field-label">在籍期間</div>
        <input id="cert-period" class="cert-period-input" type="text" placeholder="例：2025.4〜2026.3">
      </div>
      <div style="margin-top:14px;">
        <div class="cert-field-label">Wake先生の言葉</div>
        <textarea id="cert-message" class="cert-msg-area" placeholder="「Wake先生の言葉を生成」を押すか、直接入力してください"></textarea>
        <button class="btn-secondary" style="margin-top:8px;padding:10px 14px;font-size:13px;"
          onclick="generateWakeMessage()">✨ Wake先生の言葉を生成</button>
      </div>
      <div class="cert-issue-actions" style="margin-top:18px;">
        <button class="btn-primary" style="flex:1;padding:14px;font-size:15px;" onclick="submitCertificate()">発行する</button>
      </div>
    </div>
    <div id="cert-issue-result" class="cert-issue-result" style="display:none;"></div>
  </div>
</div>
```

- [ ] **Step 4: ブラウザで画面遷移だけ確認**

プレビューで先生として Wake先生タブを開き、「🏅 修了証を発行する」ボタンが表示されることを確認。
（クリック時の `openCertIssue` は次タスクで実装するため、この時点ではコンソールに「未定義」エラーが出てよい。ボタンの表示と画面 `#screen-cert-issue` の存在のみ確認する。）
コンソールで確認：
```js
!!document.getElementById('screen-cert-issue') && !!document.getElementById('cert-student')
```
Expected: `true`

- [ ] **Step 5: Commit**

```bash
cd "/Users/fujitatakako/デスクトップ/claude"
git add art-feedback/index.html
git commit -m "feat: add certificate issue screen UI"
```

---

### Task 4: 発行フローの配線（生徒選択→作品選択→生成→発行）

**Files:**
- Modify: `art-feedback/index.html`
  - Task 2 で追加したブロックの末尾（`certificateUrl` 関数の直後）に発行フロー関数群を追加
  - `switchTab()`（1715 行付近）の screen 初期化分岐に `cert-issue` を追加

- [ ] **Step 1: 発行フロー関数群を追加**

Task 2 で追加した `function certificateUrl(...) { ... }` の直後に挿入：

```js
  let _certSelectedArtworkIds = [];

  function openCertIssue() {
    _certSelectedArtworkIds = [];
    // 生徒名一覧（作品から重複なく）
    const names = [...new Set(Object.values(artworks).map(a => a.studentName).filter(Boolean))].sort();
    const sel = document.getElementById('cert-student');
    sel.innerHTML = '<option value="">— 生徒を選択 —</option>' +
      names.map(n => `<option value="${n.replace(/"/g, '&quot;')}">${n}</option>`).join('');
    document.getElementById('cert-artwork-section').style.display = 'none';
    document.getElementById('cert-detail-section').style.display = 'none';
    document.getElementById('cert-issue-result').style.display = 'none';
    document.getElementById('cert-message').value = '';
    document.getElementById('cert-period').value = '';
    switchTab('cert-issue');
  }

  function onCertStudentChange() {
    const name = document.getElementById('cert-student').value;
    _certSelectedArtworkIds = [];
    const artSec = document.getElementById('cert-artwork-section');
    const detSec = document.getElementById('cert-detail-section');
    if (!name) { artSec.style.display = 'none'; detSec.style.display = 'none'; return; }

    const entries = studentArtworkEntries(name);
    if (!entries.length) {
      alert('この生徒の作品がまだありません。作品が1点以上ないと発行できません。');
      artSec.style.display = 'none'; detSec.style.display = 'none';
      return;
    }
    // 作品サムネイル（画像があるものだけ）を描画
    const pick = document.getElementById('cert-artwork-pick');
    pick.innerHTML = entries.map(([id, a]) => {
      const img = a.imageBase64 ? `<img src="${a.imageBase64}" alt="">`
                                : `<div style="aspect-ratio:1/1;display:flex;align-items:center;justify-content:center;font-size:28px;">🎨</div>`;
      return `<div class="cert-artwork-cell" data-id="${id}" onclick="toggleCertArtwork('${id}')">${img}<div class="cert-check">✓</div></div>`;
    }).join('');
    artSec.style.display = 'block';
    detSec.style.display = 'block';
    // 在籍期間の初期値を自動補完
    document.getElementById('cert-period').value = defaultPeriodText(name);
  }

  function toggleCertArtwork(id) {
    const cell = document.querySelector(`.cert-artwork-cell[data-id="${id}"]`);
    const i = _certSelectedArtworkIds.indexOf(id);
    if (i >= 0) { _certSelectedArtworkIds.splice(i, 1); cell.classList.remove('selected'); }
    else { _certSelectedArtworkIds.push(id); cell.classList.add('selected'); }
  }

  async function generateWakeMessage() {
    const name = document.getElementById('cert-student').value;
    if (!name) { alert('先に生徒を選んでください'); return; }
    const entries = studentArtworkEntries(name);
    const titles = _certSelectedArtworkIds.length
      ? _certSelectedArtworkIds.map(id => artworks[id]?.title).filter(Boolean)
      : entries.slice(0, 3).map(([, a]) => a.title).filter(Boolean);
    const area = document.getElementById('cert-message');
    area.value = '生成中…';
    try {
      const res = await fetch('/api/certificate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          studentName: name,
          titles,
          artworkCount: entries.length,
          periodText: document.getElementById('cert-period').value
        })
      });
      const { message, error } = await res.json();
      if (error) throw new Error(error);
      area.value = message;
    } catch (e) {
      area.value = '';
      alert('メッセージ生成に失敗しました。直接入力してください。\n' + e.message);
    }
  }

  async function submitCertificate() {
    const name = document.getElementById('cert-student').value;
    const wakeMessage = document.getElementById('cert-message').value.trim();
    const periodText = document.getElementById('cert-period').value.trim();
    if (!name) { alert('生徒を選んでください'); return; }
    if (!_certSelectedArtworkIds.length) { alert('代表作品を1点以上選んでください'); return; }
    if (!wakeMessage) { alert('Wake先生の言葉を入力または生成してください'); return; }
    try {
      const tokenId = await issueCertificate({
        studentName: name,
        artworkIds: _certSelectedArtworkIds.slice(),
        wakeMessage,
        periodText,
        artworkCount: studentArtworkEntries(name).length
      });
      const url = certificateUrl(tokenId);
      const result = document.getElementById('cert-issue-result');
      result.style.display = 'block';
      result.innerHTML =
        `🏅 発行しました！<br>Token ID: <b>${tokenId}</b><br>` +
        `証明書ページ: <a href="${url}" target="_blank" rel="noopener">${url}</a><br>` +
        `<button class="btn-secondary" style="margin-top:8px;padding:8px 12px;font-size:13px;" ` +
        `onclick="navigator.clipboard.writeText('${url}').then(()=>alert('URLをコピーしました'))">URLをコピー</button>`;
    } catch (e) {
      alert('発行に失敗しました：' + e.message);
    }
  }
```

- [ ] **Step 2: switchTab に cert-issue 初期化を追加**

`switchTab()` 内の screen 初期化分岐（`if (name === 'wake') initWake();` の行）の直後に追加：

```js
    if (name === 'cert-issue') { /* openCertIssue() で初期化済み */ }
```

（※ `cert-issue` は `openCertIssue()` 経由でのみ開くため初期化処理は不要だが、想定外の直接遷移でも screen は表示される。明示のためコメント分岐を置く。）

- [ ] **Step 3: プレビュー deploy**

Run:
```bash
cd "/Users/fujitatakako/デスクトップ/claude/art-feedback" && vercel --yes
```
preview URL を控える（API も同じデプロイで動く）。

- [ ] **Step 4: ブラウザで発行フローを通しで確認**

preview URL を開き、先生として Wake先生タブ →「🏅 修了証を発行する」：
1. 生徒を選ぶ → その子の作品サムネイルが出る／在籍期間が自動入力される
2. 作品を1点タップ → 枠が選択色になり ✓ が出る
3. 「✨ Wake先生の言葉を生成」→ 数秒後にメッセージが入る（名前呼びかけ・日本語）
4. 「発行する」→ Token ID と証明書URLが表示される
5. 「URLをコピー」→ コピー成功 alert

Expected: 上記すべて成功。コンソールに赤エラーなし。

- [ ] **Step 5: Firebase 保存を確認**

Firebase コンソール（Realtime Database）で `art/certificates/{発行した token_id}` を開き、
`studentName` / `artworkIds` / `wakeMessage` / `periodText` / `artworkCount` / `soulbound:true` /
`metadata.attributes` が保存されていることを目視確認する。

- [ ] **Step 6: 作品なし生徒のガードを確認**

作品が無い生徒名がドロップダウンに出ないこと（＝作品から生成しているため出ない）を確認。
※将来 studentName を別ソースから足す場合に備え、`onCertStudentChange` 内の「作品なし」alert が機能することはコードレビューで担保。

- [ ] **Step 7: Commit**

```bash
cd "/Users/fujitatakako/デスクトップ/claude"
git add art-feedback/index.html
git commit -m "feat: wire certificate issue flow (select/generate/issue)"
```

---

### Task 5: 証明書ページ `certificate.html`（表示）

**Files:**
- Create: `art-feedback/certificate.html`

- [ ] **Step 1: 証明書表示ページを作成**

`art-feedback/certificate.html` を新規作成：

```html
<!DOCTYPE html>
<html lang="ja">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>rowke 修了証</title>
  <meta property="og:title" content="rowke 修了証">
  <meta property="og:description" content="子どもの航跡の証 — Wake先生より">
  <meta property="og:type" content="website">
  <style>
    * { margin:0; padding:0; box-sizing:border-box; }
    body { font-family:'Hiragino Sans','Yu Gothic',sans-serif; background:#04141f; color:#eaf7fa;
      min-height:100vh; display:flex; flex-direction:column; align-items:center; padding:24px 16px; }
    .cert-card { width:100%; max-width:420px; background:linear-gradient(160deg,#072a3f,#0e3a52);
      border:1px solid rgba(52,200,214,.3); border-radius:20px; padding:30px 24px; text-align:center;
      box-shadow:0 18px 50px rgba(0,0,0,.5); }
    .cert-kicker { font-size:12px; letter-spacing:.25em; color:#34c8d6; text-transform:uppercase; }
    .cert-school { font-size:14px; color:#9fe7e0; margin-top:4px; }
    .cert-name { font-size:30px; font-weight:800; margin:18px 0 4px;
      background:linear-gradient(120deg,#9fe7e0,#34c8d6,#ffd98a); -webkit-background-clip:text; background-clip:text; color:transparent; }
    .cert-name .en { font-family:'Times New Roman',Times,serif; }
    .cert-artworks { display:flex; gap:8px; justify-content:center; flex-wrap:wrap; margin:18px 0; }
    .cert-artworks img { width:120px; height:120px; object-fit:cover; border-radius:12px; border:1px solid rgba(52,200,214,.3); }
    .cert-message { font-size:14px; line-height:1.9; color:#eaf7fa; text-align:left;
      background:rgba(52,200,214,.06); border:1px solid rgba(52,200,214,.18); border-radius:14px; padding:16px; margin:16px 0; white-space:pre-wrap; }
    .cert-record { font-size:13px; color:#8fc4d2; line-height:1.8; }
    .cert-badges { display:flex; gap:8px; justify-content:center; flex-wrap:wrap; margin-top:16px; }
    .cert-badge { font-size:11px; padding:5px 10px; border-radius:999px; border:1px solid rgba(52,200,214,.35); color:#9fe7e0; }
    .cert-badge.soul { background:rgba(255,217,138,.12); border-color:#ffd98a; color:#ffd98a; }
    .cert-token { font-size:11px; color:#5f8fa0; margin-top:12px; word-break:break-all; }
    .cert-actions { margin-top:22px; }
    .cert-dl { font-size:14px; font-weight:700; padding:12px 22px; border-radius:999px; border:none; cursor:pointer;
      background:linear-gradient(135deg,#34c8d6,#0e6e8e); color:#04141f; }
    .cert-loading, .cert-error { margin-top:40px; color:#8fc4d2; font-size:14px; }
  </style>
</head>
<body>
  <div id="cert-root"><div class="cert-loading">証明書を読み込み中…</div></div>
  <canvas id="cert-canvas" width="840" height="1188" style="display:none;"></canvas>

  <script src="https://www.gstatic.com/firebasejs/10.14.1/firebase-app-compat.js"></script>
  <script src="https://www.gstatic.com/firebasejs/10.14.1/firebase-database-compat.js"></script>
  <script>
    const firebaseConfig = {
      apiKey: "AIzaSyCio3NPmFHG9HEuNkCS4QnSNGlbeM_ZLCs",
      authDomain: "family-compass-37891.firebaseapp.com",
      projectId: "family-compass-37891",
      storageBucket: "family-compass-37891.firebasestorage.app",
      messagingSenderId: "832790097576",
      appId: "1:832790097576:web:7451a91920051c1c769c9d",
      databaseURL: "https://family-compass-37891-default-rtdb.asia-southeast1.firebasedatabase.app"
    };
    firebase.initializeApp(firebaseConfig);
    const db = firebase.database();

    const tokenId = new URLSearchParams(location.search).get('id');
    const root = document.getElementById('cert-root');

    function esc(s) { return (s || '').replace(/[&<>"]/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c])); }

    async function load() {
      if (!tokenId) { root.innerHTML = '<div class="cert-error">証明書IDが指定されていません。</div>'; return; }
      const snap = await db.ref('art/certificates/' + tokenId).once('value');
      const cert = snap.val();
      if (!cert) { root.innerHTML = '<div class="cert-error">証明書が見つかりませんでした。</div>'; return; }

      // 作品画像を取得（base64）
      const imgs = [];
      for (const id of (cert.artworkIds || [])) {
        const aSnap = await db.ref('art/artworks/' + id + '/imageBase64').once('value');
        const b64 = aSnap.val();
        if (b64) imgs.push(b64);
      }
      window._certData = { cert, imgs };

      const issued = new Date(cert.issuedAt);
      const issuedText = `${issued.getFullYear()}年${issued.getMonth() + 1}月${issued.getDate()}日`;
      root.innerHTML = `
        <div class="cert-card">
          <div class="cert-kicker">Certificate</div>
          <div class="cert-school">子どもアート教室 <span style="font-family:'Times New Roman',serif">rowke</span></div>
          <div class="cert-name">${esc(cert.studentName)}</div>
          <div class="cert-artworks">${imgs.map(b => `<img src="${b}" alt="">`).join('')}</div>
          <div class="cert-message">${esc(cert.wakeMessage)}</div>
          <div class="cert-record">
            在籍期間：${esc(cert.periodText) || '—'}　／　作品数：${cert.artworkCount || 0}点<br>
            発行日：${issuedText}　／　発行：${esc(cert.issuer)}
          </div>
          <div class="cert-badges">
            <span class="cert-badge soul">Soulbound（譲渡不可）</span>
            <span class="cert-badge"><span style="font-family:'Times New Roman',serif">Wake</span>先生 認定</span>
          </div>
          <div class="cert-token">Token ID: ${esc(cert.token_id)}</div>
          <div class="cert-actions"><button class="cert-dl" onclick="downloadPng()">画像で保存（PNG）</button></div>
        </div>`;
    }

    function downloadPng() { alert('PNG保存は次のステップで実装します'); } // Task 6 で置換

    load().catch(e => { root.innerHTML = '<div class="cert-error">読み込みエラー：' + esc(e.message) + '</div>'; });
  </script>
</body>
</html>
```

- [ ] **Step 2: プレビュー deploy**

Run:
```bash
cd "/Users/fujitatakako/デスクトップ/claude/art-feedback" && vercel --yes
```
preview URL を控える。

- [ ] **Step 3: 既存の証明書を表示確認**

Task 4 で発行した token_id を使い、ブラウザで開く：
`<PREVIEW_URL>/certificate.html?id=<TOKEN_ID>`

Expected:
- 生徒名・代表作品の画像・Wake先生の言葉・在籍記録・発行日が表示される
- 「Soulbound（譲渡不可）」バッジと Token ID が表示される
- 「画像で保存（PNG）」ボタン（押すと暫定 alert）

- [ ] **Step 4: 異常系を確認**

- `<PREVIEW_URL>/certificate.html`（id なし）→「証明書IDが指定されていません。」
- `<PREVIEW_URL>/certificate.html?id=NOPE` →「証明書が見つかりませんでした。」

- [ ] **Step 5: Commit**

```bash
cd "/Users/fujitatakako/デスクトップ/claude"
git add art-feedback/certificate.html
git commit -m "feat: add certificate display page"
```

---

### Task 6: 証明書ページの PNG ダウンロード（素 Canvas）

**Files:**
- Modify: `art-feedback/certificate.html`（`downloadPng()` の暫定実装を置換）

- [ ] **Step 1: downloadPng を素 Canvas 実装に置換**

`certificate.html` 内の
`function downloadPng() { alert('PNG保存は次のステップで実装します'); }`
を、次の実装に置き換える：

```js
    // 画像を読み込んで Image を返す
    function loadImg(src) {
      return new Promise((resolve, reject) => {
        const im = new Image();
        im.onload = () => resolve(im);
        im.onerror = reject;
        im.src = src;
      });
    }

    // テキストを折り返して描画し、次の y を返す
    function drawWrapped(ctx, text, x, y, maxW, lineH) {
      const paragraphs = (text || '').split('\n');
      for (const para of paragraphs) {
        let line = '';
        for (const ch of para) {
          if (ctx.measureText(line + ch).width > maxW && line) {
            ctx.fillText(line, x, y); y += lineH; line = ch;
          } else { line += ch; }
        }
        if (line) { ctx.fillText(line, x, y); y += lineH; }
      }
      return y;
    }

    async function downloadPng() {
      const data = window._certData;
      if (!data) return;
      const { cert, imgs } = data;
      const cv = document.getElementById('cert-canvas');
      const W = cv.width, H = cv.height;
      const ctx = cv.getContext('2d');

      // 背景グラデーション
      const g = ctx.createLinearGradient(0, 0, W, H);
      g.addColorStop(0, '#072a3f'); g.addColorStop(1, '#0e3a52');
      ctx.fillStyle = '#04141f'; ctx.fillRect(0, 0, W, H);
      ctx.fillStyle = g;
      ctx.fillRect(40, 40, W - 80, H - 80);
      ctx.strokeStyle = 'rgba(52,200,214,.4)'; ctx.lineWidth = 2;
      ctx.strokeRect(40, 40, W - 80, H - 80);

      ctx.textAlign = 'center';
      ctx.fillStyle = '#34c8d6'; ctx.font = '20px sans-serif';
      ctx.fillText('CERTIFICATE', W / 2, 110);
      ctx.fillStyle = '#9fe7e0'; ctx.font = '24px serif';
      ctx.fillText('子どもアート教室 rowke', W / 2, 150);

      // 生徒名
      ctx.fillStyle = '#9fe7e0'; ctx.font = 'bold 56px sans-serif';
      ctx.fillText(cert.studentName, W / 2, 230);

      // 代表作品（最大2点を中央に並べる）
      let y = 270;
      const shown = imgs.slice(0, 2);
      if (shown.length) {
        const imEls = await Promise.all(shown.map(loadImg));
        const size = 220, gap = 24;
        const totalW = imEls.length * size + (imEls.length - 1) * gap;
        let ix = (W - totalW) / 2;
        for (const im of imEls) {
          ctx.drawImage(im, ix, y, size, size);
          ctx.strokeStyle = 'rgba(52,200,214,.3)'; ctx.lineWidth = 2;
          ctx.strokeRect(ix, y, size, size);
          ix += size + gap;
        }
        y += size + 40;
      }

      // Wake先生の言葉（左寄せ折返し）
      ctx.textAlign = 'left'; ctx.fillStyle = '#eaf7fa'; ctx.font = '22px sans-serif';
      y = drawWrapped(ctx, cert.wakeMessage, 90, y + 10, W - 180, 36) + 20;

      // 在籍記録
      ctx.textAlign = 'center'; ctx.fillStyle = '#8fc4d2'; ctx.font = '20px sans-serif';
      const issued = new Date(cert.issuedAt);
      ctx.fillText(`在籍期間：${cert.periodText || '—'} ／ 作品数：${cert.artworkCount || 0}点`, W / 2, y);
      y += 32;
      ctx.fillText(`発行日：${issued.getFullYear()}年${issued.getMonth() + 1}月${issued.getDate()}日 ／ 発行：${cert.issuer}`, W / 2, y);
      y += 44;

      // Soulbound バッジ
      ctx.fillStyle = '#ffd98a'; ctx.font = 'bold 20px sans-serif';
      ctx.fillText('● Soulbound（譲渡不可）／ Wake先生 認定 ●', W / 2, y);
      y += 36;

      // Token ID
      ctx.fillStyle = '#5f8fa0'; ctx.font = '16px monospace';
      ctx.fillText('Token ID: ' + cert.token_id, W / 2, y);

      // ダウンロード
      const a = document.createElement('a');
      a.href = cv.toDataURL('image/png');
      a.download = `rowke-certificate-${cert.token_id}.png`;
      a.click();
    }
```

- [ ] **Step 2: プレビュー deploy**

Run:
```bash
cd "/Users/fujitatakako/デスクトップ/claude/art-feedback" && vercel --yes
```

- [ ] **Step 3: PNG ダウンロードを確認**

`<PREVIEW_URL>/certificate.html?id=<TOKEN_ID>` を開き「画像で保存（PNG）」をクリック。
Expected:
- `rowke-certificate-<TOKEN_ID>.png` がダウンロードされる
- 画像に：生徒名・代表作品画像・Wake先生の言葉（折返し）・在籍記録・Soulbound 表記・Token ID が含まれる
- 文字が枠からはみ出していない（長文メッセージでもカード内に収まる）

- [ ] **Step 4: 長文メッセージで崩れないか確認**

Firebase で対象 cert の `wakeMessage` を一時的に長め（10文程度）に書き換えて再度 PNG 保存し、テキストがはみ出さないことを確認。確認後、元に戻す。
（崩れる場合は canvas の `H`(縦) を増やすか lineH を調整。）

- [ ] **Step 5: Commit**

```bash
cd "/Users/fujitatakako/デスクトップ/claude"
git add art-feedback/certificate.html
git commit -m "feat: add native-canvas PNG export to certificate page"
```

---

### Task 7: 生徒・保護者ビューに「わたしの修了証」

**Files:**
- Modify: `art-feedback/index.html`
  - 生徒ビュー `#wake-student-view` のヘッダー（`.wake-header`、1327 行付近）の直後に表示枠を追加
  - `initWake()` 内の生徒分岐に「自分の修了証を読み込む」呼び出しを追加
  - Task 4 の関数群の末尾に `loadMyCertificates()` を追加

- [ ] **Step 1: 生徒ビューに表示枠を追加**

`#wake-student-view` 内、`<div class="wake-header" ...> ... </div>`（閉じ `</div>` まで）の直後に追加：

```html
    <div id="my-certificates" style="padding:0 20px 8px; display:none;"></div>
```

- [ ] **Step 2: loadMyCertificates() を追加**

Task 4 の関数群の末尾（`submitCertificate` 関数の閉じ `}` の直後）に追加：

```js
  async function loadMyCertificates() {
    const viewer = getViewer();
    const box = document.getElementById('my-certificates');
    if (!viewer || viewer.role === 'teacher' || !viewer.name) { box.style.display = 'none'; return; }
    const snap = await db.ref('art/certificates').once('value');
    const all = snap.val() || {};
    const mine = Object.values(all).filter(c => c.studentName === viewer.name);
    if (!mine.length) { box.style.display = 'none'; return; }
    box.style.display = 'block';
    box.innerHTML = mine.map(c => {
      const url = certificateUrl(c.token_id);
      return `<a href="${url}" target="_blank" rel="noopener"
        style="display:block; padding:12px 14px; margin-bottom:8px; border:1px solid var(--rule); border-radius:12px;
        background:var(--card); color:var(--text); text-decoration:none; font-size:14px;">
        🏅 わたしの修了証（${c.periodText || ''}）を見る →</a>`;
    }).join('');
  }
```

- [ ] **Step 3: initWake の生徒分岐から呼び出す**

`initWake()` 内、生徒分岐の `if (_wakeHistory.length === 0) loadStudentHistory(viewer.name);` の直後に追加：

```js
      loadMyCertificates();
```

- [ ] **Step 4: プレビュー deploy**

Run:
```bash
cd "/Users/fujitatakako/デスクトップ/claude/art-feedback" && vercel --yes
```

- [ ] **Step 5: 生徒ビューで確認**

preview URL で、Task 4 で証明書を発行した生徒の名前で生徒としてログイン（識別切り替え）し、Wake先生タブを開く。
Expected:
- 上部に「🏅 わたしの修了証（…）を見る →」リンクが表示される
- クリックすると証明書ページが開く
- 証明書を持たない生徒では何も表示されない（枠は非表示）

- [ ] **Step 6: Commit**

```bash
cd "/Users/fujitatakako/デスクトップ/claude"
git add art-feedback/index.html
git commit -m "feat: show my certificates in student/parent view"
```

---

### Task 8: 本番デプロイ

- [ ] **Step 1: 本番 deploy**

Run:
```bash
cd "/Users/fujitatakako/デスクトップ/claude/art-feedback" && vercel --prod --yes
```
Expected: `READY`。

- [ ] **Step 2: 本番で通し確認**

https://art-feedback.vercel.app で、先生として1件発行 → 証明書URL表示 → 証明書ページ表示 → PNG保存 → 生徒ビューで「わたしの修了証」表示、までを通しで確認。

- [ ] **Step 3: 最終確認（環境変数）**

本番 preview/production の Vercel 環境変数に `GEMINI_API_KEY`・`SUPABASE_URL`・`SUPABASE_SERVICE_ROLE_KEY` が設定済みであることを確認（既存機能で設定済みのはず。`/api/certificate` は GEMINI のみ使用）。
