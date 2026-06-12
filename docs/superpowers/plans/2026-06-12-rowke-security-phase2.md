# rowke セキュリティ強化 第2弾 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 先生PINのサーバー照合化・Firebase書き込みの `/api/db` 集約・rowke専用Firebaseプロジェクトへの分離を行い、ブラウザからの直接書き込みを全面遮断する。

**Architecture:** 読み取りはクライアント直接（`.on()/.once()` 維持）、書き込みは新設の汎用エンドポイント `api/db.js`（firebase-admin、アクション別検証、先生系は `x-teacher-pin` ヘッダ照合）のみ。新Firebaseプロジェクトへ `migrate` アクションでデータ移行し、新プロジェクトのルールは `.read:true / .write:false`。

**Tech Stack:** Vercel Serverless Functions (Node), firebase-admin, Firebase RTDB, Vanilla JS（単一HTML）

**検証方針:** テストランナーなし。`node --check`＋本番/curl＋ブラウザ（プレビュー）での手動検証（このリポジトリの確立パターン）。

---

## 前提（ユーザー作業・Task 1 の前に完了していること）

> 実装開始時に未完了なら、コントローラーがユーザーに以下を案内して完了を待つこと。

1. Firebaseコンソールで新プロジェクト作成（名前例: `rowke-app`）
2. Realtime Database を **asia-southeast1** で作成し、ルールに以下を貼って公開:
   ```json
   { "rules": { "art": { ".read": true, ".write": false } } }
   ```
3. プロジェクト設定 → サービスアカウント → 「新しい秘密鍵の生成」でJSONをダウンロード
4. Vercel（art-feedbackプロジェクト）の環境変数に設定（Production と Preview 両方）:
   - `TEACHER_PIN` = 新しいPIN（ユーザーが決める。チャット・コードに書かない）
   - `FIREBASE_SERVICE_ACCOUNT` = サービスアカウントJSONの全文
   - `FIREBASE_DB_URL` = 新RTDBのURL（例 `https://rowke-app-default-rtdb.asia-southeast1.firebasedatabase.app`）
5. 新プロジェクトの **Webアプリ設定**（apiKey, authDomain, projectId, storageBucket, messagingSenderId, appId, databaseURL ＝公開情報）をチャットで共有（Task 5 で使用）

## File Structure

- Create: `art-feedback/api/db.js` … 汎用書き込みAPI（全アクション＋PIN照合＋migrate）
- Modify: `art-feedback/package.json` … `firebase-admin` 追加
- Modify: `art-feedback/index.html` … dbWriteラッパー、checkTeacherPwのサーバー化、書き込み約40箇所の置換、firebaseConfig差し替え
- Modify: `art-feedback/certificate.html` … firebaseConfig差し替え（読み取りのみなのでそれだけ）

## 展開順序（重要・読み書き不整合を作らないため）

1. **Task 1–2**: `api/db.js` だけを本番デプロイ → `migrate` 実行（この間ユーザーは旧DBで通常利用継続。クライアント未変更）
2. **Task 3–5**: クライアント改修（ローカル/プレビューで検証。本番デプロイしない）
3. **Task 6**: `migrate` 再実行（直前の差分を取り込み）→ 直後にクライアント込みで本番デプロイ → E2E
4. **Task 7**: 旧プロジェクト封鎖（ユーザー）＋ `migrate` アクション削除

---

### Task 1: `api/db.js` 実装＋デプロイ

**Files:**
- Modify: `art-feedback/package.json`
- Create: `art-feedback/api/db.js`

- [ ] **Step 1: package.json に firebase-admin を追加**

`art-feedback/package.json` を以下に置き換え:

```json
{
  "dependencies": {
    "@supabase/supabase-js": "^2.45.0",
    "firebase-admin": "^13.0.0"
  }
}
```

- [ ] **Step 2: `art-feedback/api/db.js` を新規作成**

```js
// rowke 汎用書き込みAPI。クライアントからの直接書き込みはルールで遮断し、
// すべての書き込みをここに集約する。先生系アクションは x-teacher-pin を毎回照合。
const admin = require('firebase-admin');

function getDb() {
  if (!admin.apps.length) {
    admin.initializeApp({
      credential: admin.credential.cert(JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT)),
      databaseURL: process.env.FIREBASE_DB_URL
    });
  }
  return admin.database();
}

const sanitize = s => String(s || '').replace(/[.#$\[\]/]/g, '_');
const now = () => Date.now();

// PIN必須アクション
const TEACHER_ACTIONS = new Set([
  'teacherComment', 'editComment', 'deleteComment', 'editReply', 'deleteReply',
  'updateArtwork', 'deleteArtwork', 'saveAnalysis',
  'nextClassSet', 'nextClassDelete',
  'critiqueWorkAdd', 'critiqueWorkUpdate', 'critiqueWorkDelete',
  'critiqueSessionUpdate', 'critiqueSessionDelete',
  'contactRead', 'contactDelete', 'setStudentAvatar',
  'issueCertificate', 'migrate'
]);

function pinOk(req) {
  const pin = req.headers['x-teacher-pin'];
  return !!pin && !!process.env.TEACHER_PIN && pin === process.env.TEACHER_PIN;
}

// コメント/返信の親パスを組み立て（teacher返信 or 通常コメント返信）
function replyPath(artworkId, parent) {
  const base = 'art/artworks/' + sanitize(artworkId);
  if (parent === 'teacher') return base + '/teacherCommentReplies';
  return base + '/comments/' + sanitize(parent) + '/replies';
}

module.exports = async (req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, x-teacher-pin');
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const { action, payload = {} } = req.body || {};
  if (!action) return res.status(400).json({ error: 'action is required' });

  // PIN照合（verifyPin は payload で照合、先生系はヘッダで照合）
  if (action === 'verifyPin') {
    if (payload.pin && process.env.TEACHER_PIN && payload.pin === process.env.TEACHER_PIN) {
      return res.status(200).json({ ok: true });
    }
    return res.status(403).json({ error: 'PINが違います' });
  }
  const teacher = pinOk(req);
  if (TEACHER_ACTIONS.has(action) && !teacher) {
    return res.status(403).json({ error: 'この操作は先生のみ行えます' });
  }

  try {
    const db = getDb();
    const art = id => db.ref('art/artworks/' + sanitize(id));

    switch (action) {

      // ===== 誰でも =====
      case 'uploadArtwork': {
        const d = payload.data || {};
        const rec = {
          studentName: String(d.studentName || ''), age: String(d.age || ''),
          title: String(d.title || ''), artworkType: String(d.artworkType || 'drawing'),
          ts: now(), likes: 0
        };
        if (d.imageBase64) rec.imageBase64 = d.imageBase64;
        if (d.studentComment) rec.studentComment = d.studentComment;
        if (!rec.studentName || !rec.title) return res.status(400).json({ error: 'studentName/title required' });
        const ref = await db.ref('art/artworks').push(rec);
        return res.status(200).json({ ok: true, key: ref.key });
      }
      case 'postComment': { // 保護者コメント（roleは強制）
        const data = { role: 'parent', text: String(payload.text || ''), ts: now() };
        const imgs = Array.isArray(payload.images) ? payload.images : [];
        if (imgs.length === 1) data.imageBase64 = imgs[0];
        else if (imgs.length > 1) data.imageBase64s = imgs;
        if (!data.text && !imgs.length) return res.status(400).json({ error: 'empty' });
        await art(payload.artworkId).child('comments').push(data);
        return res.status(200).json({ ok: true });
      }
      case 'postReply': { // 返信。roleはPINの有無でサーバーが決定
        const data = { role: teacher ? 'teacher' : 'parent', text: String(payload.text || ''), ts: now() };
        if (!data.text) return res.status(400).json({ error: 'empty' });
        await db.ref(replyPath(payload.artworkId, payload.parent)).push(data);
        return res.status(200).json({ ok: true });
      }
      case 'like': {
        const likes = Math.max(0, parseInt(payload.likes, 10) || 0);
        await art(payload.artworkId).update({ likes });
        return res.status(200).json({ ok: true });
      }
      case 'setParentAvatar': {
        if (!/^data:image\//.test(payload.image || '')) return res.status(400).json({ error: 'invalid image' });
        await db.ref('art/avatars/parent_' + sanitize(payload.studentName)).set(payload.image);
        return res.status(200).json({ ok: true });
      }
      case 'contactSend': {
        await db.ref('art/messages').push({
          role: teacher ? 'teacher' : 'student',
          name: String(payload.name || ''), text: String(payload.text || ''),
          ts: now(), read: false
        });
        return res.status(200).json({ ok: true });
      }
      case 'wakeNotification': {
        await db.ref('art/wake_notifications').push({
          studentName: String(payload.studentName || ''), question: String(payload.question || ''),
          ts: now(), read: false
        });
        return res.status(200).json({ ok: true });
      }
      case 'critiqueCommentAdd': {
        await db.ref('art/critique/works/' + sanitize(payload.workKey) + '/comments').push({
          name: String(payload.name || ''), text: String(payload.text || ''), ts: now()
        });
        return res.status(200).json({ ok: true });
      }
      case 'critiqueCommentDelete': { // 先生 or 投稿者本人（名前一致）
        const ref = db.ref('art/critique/works/' + sanitize(payload.workKey) + '/comments/' + sanitize(payload.commentKey));
        if (!teacher) {
          const snap = await ref.once('value');
          if (!snap.val() || snap.val().name !== payload.name) {
            return res.status(403).json({ error: '削除できるのは先生か投稿者本人のみです' });
          }
        }
        await ref.remove();
        return res.status(200).json({ ok: true });
      }

      // ===== 先生のみ（TEACHER_ACTIONS で照合済み）=====
      case 'teacherComment': { // 先生コメントの新規/追記
        const update = { teacherCommentDate: now() };
        if (payload.text) update.teacherComment = String(payload.text);
        const imgs = Array.isArray(payload.images) ? payload.images : [];
        if (imgs.length) update.teacherCommentImages = imgs;
        await art(payload.artworkId).update(update);
        return res.status(200).json({ ok: true });
      }
      case 'editComment': {
        const id = payload.artworkId, t = payload.target;
        if (t === 'teacher') {
          const update = { teacherComment: String(payload.text || ''), teacherCommentDate: now() };
          if ('images' in payload) { update.teacherCommentImages = payload.images || null; update.teacherCommentImage = null; }
          await art(id).update(update);
        } else if (t === 'student') {
          await art(id).update({ studentComment: String(payload.text || '') });
        } else if (t === 'comment' && payload.key) {
          await art(id).child('comments/' + sanitize(payload.key)).update({ text: String(payload.text || ''), edited: true });
        } else return res.status(400).json({ error: 'bad target' });
        return res.status(200).json({ ok: true });
      }
      case 'deleteComment': {
        const id = payload.artworkId, t = payload.target;
        if (t === 'teacher') {
          await art(id).update({ teacherComment: null, teacherCommentDate: null, teacherCommentImage: null, teacherCommentImages: null });
        } else if (t === 'student') {
          await art(id).update({ studentComment: null });
        } else if (t === 'comment' && payload.key) {
          await art(id).child('comments/' + sanitize(payload.key)).remove();
        } else return res.status(400).json({ error: 'bad target' });
        return res.status(200).json({ ok: true });
      }
      case 'editReply': {
        await db.ref(replyPath(payload.artworkId, payload.parent) + '/' + sanitize(payload.key))
          .update({ text: String(payload.text || ''), edited: true });
        return res.status(200).json({ ok: true });
      }
      case 'deleteReply': {
        await db.ref(replyPath(payload.artworkId, payload.parent) + '/' + sanitize(payload.key)).remove();
        return res.status(200).json({ ok: true });
      }
      case 'updateArtwork': { // 汎用フィールド更新（先生のみ・ホワイトリスト）
        const allowed = ['title', 'age', 'artworkType', 'studentName'];
        const update = {};
        for (const k of allowed) if (k in (payload.update || {})) update[k] = payload.update[k];
        if (!Object.keys(update).length) return res.status(400).json({ error: 'no allowed fields' });
        await art(payload.artworkId).update(update);
        return res.status(200).json({ ok: true });
      }
      case 'deleteArtwork': {
        await art(payload.artworkId).remove();
        return res.status(200).json({ ok: true });
      }
      case 'saveAnalysis': {
        await art(payload.artworkId).child('analysis').set(payload.analysis || {});
        return res.status(200).json({ ok: true });
      }
      case 'nextClassSet': {
        const ref = payload.student
          ? db.ref('art/next_class_students/' + sanitize(payload.student))
          : db.ref('art/next_class');
        await ref.set(payload.data || {});
        return res.status(200).json({ ok: true });
      }
      case 'nextClassDelete': {
        const ref = payload.student
          ? db.ref('art/next_class_students/' + sanitize(payload.student))
          : db.ref('art/next_class');
        await ref.remove();
        return res.status(200).json({ ok: true });
      }
      case 'critiqueWorkAdd': {
        const ref = await db.ref('art/critique/works').push({
          studentName: String(payload.studentName || ''), image: payload.image || '', critique: '', comments: {}
        });
        return res.status(200).json({ ok: true, key: ref.key });
      }
      case 'critiqueWorkUpdate': {
        await db.ref('art/critique/works/' + sanitize(payload.workKey)).update({ critique: String(payload.critique || '') });
        return res.status(200).json({ ok: true });
      }
      case 'critiqueWorkDelete': {
        await db.ref('art/critique/works/' + sanitize(payload.workKey)).remove();
        return res.status(200).json({ ok: true });
      }
      case 'critiqueSessionUpdate': {
        await db.ref('art/critique').update(payload.update || {});
        return res.status(200).json({ ok: true });
      }
      case 'critiqueSessionDelete': {
        await db.ref('art/critique').remove();
        return res.status(200).json({ ok: true });
      }
      case 'contactRead': {
        await db.ref('art/messages/' + sanitize(payload.key)).update({ read: true });
        return res.status(200).json({ ok: true });
      }
      case 'contactDelete': {
        await db.ref('art/messages/' + sanitize(payload.key)).remove();
        return res.status(200).json({ ok: true });
      }
      case 'setStudentAvatar': {
        if (!/^data:image\//.test(payload.image || '')) return res.status(400).json({ error: 'invalid image' });
        await db.ref('art/avatars/' + sanitize(payload.studentName)).set(payload.image);
        return res.status(200).json({ ok: true });
      }
      case 'issueCertificate': {
        const p = payload;
        if (!p.studentName || !Array.isArray(p.artworkIds) || !p.artworkIds.length || !p.wakeMessage) {
          return res.status(400).json({ error: 'studentName/artworkIds/wakeMessage required' });
        }
        const year = new Date().getFullYear();
        const snap = await db.ref('art/certificates').once('value');
        const all = snap.val() || {};
        const seq = Object.keys(all).filter(k => k.startsWith(`ROWKE-${year}-`)).length + 1;
        const tokenId = `ROWKE-${year}-${String(seq).padStart(4, '0')}-${Math.random().toString(36).slice(2, 6)}`;
        const record = {
          token_id: tokenId, studentName: p.studentName, artworkIds: p.artworkIds,
          wakeMessage: p.wakeMessage, teacherMessage: p.teacherMessage || '',
          periodText: p.periodText || '', artworkCount: p.artworkCount || 0,
          issuedAt: now(), issuer: '先生', soulbound: true,
          metadata: {
            name: `rowke 修了証 — ${p.studentName}`,
            description: `${p.studentName}の航跡の証。Wake先生より。`,
            image: '',
            attributes: [
              { trait_type: 'period', value: p.periodText || '' },
              { trait_type: 'artworkCount', value: p.artworkCount || 0 },
              { trait_type: 'soulbound', value: 'true' }
            ]
          }
        };
        // ※将来の本物SBT mintはここに追加する
        await db.ref('art/certificates/' + tokenId).set(record);
        return res.status(200).json({ ok: true, tokenId });
      }

      // ===== 一時（移行完了後に削除）=====
      case 'migrate': {
        const OLD = 'https://family-compass-37891-default-rtdb.asia-southeast1.firebasedatabase.app/art.json';
        const r = await fetch(OLD);
        if (!r.ok) throw new Error('old DB read failed: ' + r.status);
        const data = await r.json();
        if (!data) return res.status(400).json({ error: 'old data empty' });
        await db.ref('art').set(data);
        const counts = {};
        for (const k of Object.keys(data)) counts[k] = typeof data[k] === 'object' ? Object.keys(data[k]).length : 1;
        return res.status(200).json({ ok: true, counts });
      }

      default:
        return res.status(400).json({ error: 'unknown action: ' + action });
    }
  } catch (err) {
    console.error('db api error:', action, err);
    return res.status(500).json({ error: err.message || 'Internal server error' });
  }
};
```

- [ ] **Step 3: 構文チェック**

Run: `node --check art-feedback/api/db.js`
Expected: エラーなし

- [ ] **Step 4: コミット＋本番デプロイ**（クライアント未変更なので利用者影響なし）

```bash
cd "/Users/fujitatakako/デスクトップ/claude"
git add art-feedback/api/db.js art-feedback/package.json
git commit -m "feat: add consolidated write API with server-side PIN check"
cd art-feedback && vercel --prod --yes
```

- [ ] **Step 5: 本番で検証（PINはユーザーがVercelに設定済みの値。コマンドに書く場合は履歴に注意し、コントローラーはユーザーに「正しいPINでverifyPinが200になるか」だけ自身のブラウザ/curlで確認してもらってもよい）**

```bash
# 誤PIN → 403
curl -s -X POST https://art-feedback.vercel.app/api/db -H 'Content-Type: application/json' -d '{"action":"verifyPin","payload":{"pin":"0000"}}'
# PINなしで先生アクション → 403
curl -s -X POST https://art-feedback.vercel.app/api/db -H 'Content-Type: application/json' -d '{"action":"deleteArtwork","payload":{"artworkId":"x"}}'
# 不明アクション → 400
curl -s -X POST https://art-feedback.vercel.app/api/db -H 'Content-Type: application/json' -d '{"action":"nope"}'
```
Expected: 上から `{"error":"PINが違います"}` / `{"error":"この操作は先生のみ行えます"}` / `{"error":"unknown action: nope"}`

---

### Task 2: データ移行（1回目）

- [ ] **Step 1: migrate 実行**（PINヘッダ必須。実PINはユーザーから受け取らずに、ユーザーに以下のコマンド（PIN部分だけ自分で埋める）を実行してもらうか、コントローラーが一時的に受け取り実行後すぐ破棄）

```bash
curl -s -X POST https://art-feedback.vercel.app/api/db \
  -H 'Content-Type: application/json' -H 'x-teacher-pin: <PIN>' \
  -d '{"action":"migrate"}'
```
Expected: `{"ok":true,"counts":{"artworks":6,"avatars":...,"certificates":...}}`（件数が返る）

- [ ] **Step 2: 新DBの読み取り確認＋旧DBとの件数照合**

```bash
curl -s "<FIREBASE_DB_URL>/art/artworks.json?shallow=true"   # 新
curl -s "https://family-compass-37891-default-rtdb.asia-southeast1.firebasedatabase.app/art/artworks.json?shallow=true"  # 旧
```
Expected: キー集合が一致。また新DBへの**書き込み**がRESTで拒否されること:
```bash
curl -s -X PUT "<FIREBASE_DB_URL>/art/test.json" -d '"x"'
```
Expected: `{"error":"Permission denied"}`

---

### Task 3: クライアント基盤（dbWrite ラッパー＋PINサーバー化）

**Files:**
- Modify: `art-feedback/index.html`

- [ ] **Step 1: dbWrite ラッパーを追加**（`function requireTeacher()` 定義の直後に挿入）

```js
  // 書き込みはすべて /api/db 経由（直接書き込みはルールで遮断済み）
  function teacherPin() { try { return localStorage.getItem('rowke_teacher_pin') || ''; } catch(e) { return ''; } }
  async function dbWrite(action, payload) {
    const headers = { 'Content-Type': 'application/json' };
    const pin = teacherPin();
    if (pin) headers['x-teacher-pin'] = pin;
    const res = await fetch('/api/db', { method: 'POST', headers, body: JSON.stringify({ action, payload }) });
    const data = await res.json().catch(() => ({}));
    if (!res.ok || data.error) throw new Error(data.error || ('HTTP ' + res.status));
    return data;
  }
  // エラーをalertに変換するfire-and-forget版（既存の .then() なし呼び出しの置換に使う）
  function dbWriteSafe(action, payload) {
    return dbWrite(action, payload).catch(e => alert('保存に失敗しました：' + e.message));
  }
```

- [ ] **Step 2: checkTeacherPw をサーバー照合に置換**

旧:
```js
  function checkTeacherPw() {
    const val = document.getElementById('teacher-pw-input').value;
    if (btoa(val) === btoa('r1043')) {
      setViewer('teacher', null);
    } else {
```
新:
```js
  async function checkTeacherPw() {
    const val = document.getElementById('teacher-pw-input').value;
    let ok = false;
    try {
      const res = await fetch('/api/db', { method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'verifyPin', payload: { pin: val } }) });
      ok = res.ok;
    } catch (e) { ok = false; }
    if (ok) {
      try { localStorage.setItem('rowke_teacher_pin', val); } catch(e) {}
      setViewer('teacher', null);
    } else {
```
（else節以降の既存コードは変更なし）。また `changeViewer()` に `localStorage.removeItem('rowke_teacher_pin');` を追加（身元切替時にPIN破棄）。

- [ ] **Step 3: 構文チェック＋コミット**

```bash
cd "/Users/fujitatakako/デスクトップ/claude/art-feedback"
node -e "const fs=require('fs');const h=fs.readFileSync('index.html','utf8');const b=[...h.matchAll(/<script>([\\s\\S]*?)<\\/script>/g)];let ok=1;b.forEach((m,i)=>{try{new Function(m[1])}catch(e){console.log(i,e.message);ok=0}});console.log(ok?'JS OK':'ERR')"
cd "/Users/fujitatakako/デスクトップ/claude"
git add art-feedback/index.html && git commit -m "feat: add dbWrite wrapper and server-side PIN verification"
```

---

### Task 4: クライアント書き込み置換（全約40箇所）

**Files:**
- Modify: `art-feedback/index.html`（読み取り `.on()/.once()` は触らない）

置換マッピング（行番号は2026-06-12時点の目安。実行時はパターンで検索すること）:

| 現在のコード | 置換後 |
|---|---|
| `db.ref('art/avatars/'+key).set(b64)`（uploadStudentAvatar内） | `dbWriteSafe('setStudentAvatar', { studentName, image: b64 })` |
| `db.ref('art/avatars/'+key).set(b64)`（uploadRoleAvatar親側） | `dbWriteSafe('setParentAvatar', { studentName, image: b64 })` |
| saveEdit: teacher/student/commentの3分岐 update | `dbWriteSafe('editComment', { artworkId: currentArtworkId, target, key: editInfo.key, text: newText, ...(画像があれば images) })` ※target は 'teacher'/'student'/'comment' |
| postComment: teacher分岐 update | `dbWriteSafe('teacherComment', { artworkId: currentArtworkId, text, images: imgs })` |
| postComment: parent分岐 push | `dbWriteSafe('postComment', { artworkId: currentArtworkId, text, images: imgs })` |
| toggleLike update | `dbWriteSafe('like', { artworkId: currentArtworkId, likes: Math.max(0,newLikes) })` |
| uploadArtwork push(...).then(閉じ処理) | `dbWrite('uploadArtwork', { data }).then(() => { ...既存の閉じ処理... }).catch(e => alert('アップロードに失敗しました：' + e.message))` |
| deleteStudentComment update({studentComment:null}) | `dbWrite('deleteComment', { artworkId: currentArtworkId, target:'student' }).then(()=>renderComments(artworks[currentArtworkId]))`（catchでalert） |
| deleteTeacherComment update(null群) | `dbWrite('deleteComment', { artworkId: currentArtworkId, target:'teacher' }).then(...)` 同上 |
| deleteParentComment remove | `dbWrite('deleteComment', { artworkId: currentArtworkId, target:'comment', key }).then(...)` |
| saveReply 編集（既存replyKeyあり update） | `dbWriteSafe('editReply', { artworkId: currentArtworkId, parent: (teacher返信なら 'teacher' そうでなければ replyParent.key), key: replyKey, text })` |
| saveReply 新規（push） | `dbWriteSafe('postReply', { artworkId: currentArtworkId, parent: 同上, text })` |
| deleteReply remove | `dbWrite('deleteReply', { artworkId: currentArtworkId, parent: 同上, key: replyKey }).then(...)` |
| deleteArtwork remove().then(...) | `dbWrite('deleteArtwork', { artworkId: currentArtworkId }).then(() => { currentArtworkId=null; switchTab('artworks'); }).catch(...)` |
| confirmDeleteArtwork remove | `dbWriteSafe('deleteArtwork', { artworkId: id })` |
| saveAnalysis analysis set | `dbWriteSafe('saveAnalysis', { artworkId: currentArtworkId, analysis })` |
| next_class / next_class_students の set | `dbWriteSafe('nextClassSet', { student: currentNextStudent または null, data })` |
| next_class / next_class_students の remove | `dbWriteSafe('nextClassDelete', { student: ... })` |
| critique works/key update({critique}) | `dbWriteSafe('critiqueWorkUpdate', { workKey: currentCWKey, critique: text })` |
| critique works/key/comments push | `dbWriteSafe('critiqueCommentAdd', { workKey, name, text })` |
| critique comments remove().then(...) | `dbWrite('critiqueCommentDelete', { workKey, commentKey, name: viewer?.name }).then(...)` |
| critique works/key remove | `dbWriteSafe('critiqueWorkDelete', { workKey: currentCWKey })` |
| critique update({title...}) | `dbWriteSafe('critiqueSessionUpdate', { update: {...同じオブジェクト} })` |
| critique remove | `dbWriteSafe('critiqueSessionDelete', {})` |
| critique works push（作品追加） | `dbWriteSafe('critiqueWorkAdd', { studentName: name, image: pendingCWImg||'' })` |
| messages push | `dbWriteSafe('contactSend', { name, text })` |
| messages/key update({read:true}) | `dbWriteSafe('contactRead', { key })` |
| messages/key remove | `dbWriteSafe('contactDelete', { key })` |
| wake_notifications push | `dbWriteSafe('wakeNotification', { studentName: viewer.name \|\| viewer.role, question })` |
| issueCertificate（generateTokenId＋set 全体） | 関数本体を `const r = await dbWrite('issueCertificate', { studentName, artworkIds, wakeMessage, teacherMessage, periodText, artworkCount }); return r.tokenId;` に置換。`generateTokenId()` 関数は削除 |

- [ ] **Step 1: 上記マッピングどおり全箇所を置換**（grep `db.ref(` の書き込み系が `migrate` 用を除き0件になるまで）
- [ ] **Step 2: 確認**

Run: `grep -n "db\.ref(" art-feedback/index.html | grep -v "once\|\.on("`
Expected: 0件

- [ ] **Step 3: 構文チェック＋コミット**

```bash
git add art-feedback/index.html && git commit -m "feat: route all client writes through /api/db"
```

---

### Task 5: firebaseConfig 差し替え（index.html / certificate.html）

> ユーザーから共有された新プロジェクトのWeb設定を使用（公開情報）。

- [ ] **Step 1:** `index.html` の `const firebaseConfig = {...}` を新プロジェクトの値に置換
- [ ] **Step 2:** `certificate.html` の同ブロックも置換
- [ ] **Step 3:** コミット `git commit -m "feat: switch client reads to dedicated rowke Firebase project"`（**まだデプロイしない**）

---

### Task 6: 移行再実行→本番切替→E2E

- [ ] **Step 1: migrate 再実行**（Task 2 Step 1 と同じコマンド。直前までの旧DB差分を取り込む）
- [ ] **Step 2: 本番デプロイ** `cd art-feedback && vercel --prod --yes`
- [ ] **Step 3: E2E（ブラウザ・プレビュー/本番）**
  - 生徒: 作品アップロード／コメント／いいね／返信／連絡送信／Wake通知 が動く
  - 先生（新PINでログイン）: 先生コメント・編集・削除／作品削除／分析記録／授業編集／講評操作／連絡既読・削除／生徒アバター／**修了証発行→証明書ページ→PNG** が動く
  - 誤PINで先生ログイン不可
  - **ブラウザコンソールで `firebase.database().ref('art/hack_test').set('x')` → PERMISSION_DENIED**（本丸）
  - 旧PIN文字列がコードに無い: `grep -rn "r1043" art-feedback/` → 0件

---

### Task 7: 後始末

- [ ] **Step 1（ユーザー作業）:** 旧プロジェクト（family-compass）のRTDBルールで、既存ルールに `"art": { ".read": false, ".write": false }` を追加して公開
- [ ] **Step 2: 旧 /art が読めないことを確認**

```bash
curl -s "https://family-compass-37891-default-rtdb.asia-southeast1.firebasedatabase.app/art/artworks.json?shallow=true"
```
Expected: `{"error":"Permission denied"}`

- [ ] **Step 3: `migrate` アクションを api/db.js から削除**（caseブロックと `TEACHER_ACTIONS` の `'migrate'` を除去）し、`node --check` → コミット → 本番デプロイ
- [ ] **Step 4: 最終確認** — アプリの表示・書き込み・修了証が引き続き正常
