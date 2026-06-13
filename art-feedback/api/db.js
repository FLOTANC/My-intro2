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
