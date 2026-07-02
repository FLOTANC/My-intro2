// Wake Path 書き込みAPI。dessin/ 配下のみ。先生系アクションは x-teacher-pin 照合。
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
const S = s => String(s || '').replace(/[.#$\[\]/]/g, '_');
const now = () => Date.now();
const AXES = ['proportion','volume','texture','composition','observation','space','light','structure','process'];

const TEACHER_ACTIONS = new Set([
  'saveStudent','deleteStudent',
  'assignmentDraftSave','assignmentChatAppend','assignmentPublish','assignmentDelete',
  'teacherReview'
]);
function pinOk(req){ const p=req.headers['x-teacher-pin']; return !!p && !!process.env.TEACHER_PIN && p===process.env.TEACHER_PIN; }
const todayStr = () => { const d=new Date(); return `${d.getFullYear()}-${d.getMonth()+1}-${d.getDate()}`; };

module.exports = async (req, res) => {
  res.setHeader('Access-Control-Allow-Origin','*');
  res.setHeader('Access-Control-Allow-Methods','POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers','Content-Type, x-teacher-pin');
  if (req.method==='OPTIONS') return res.status(200).end();
  if (req.method!=='POST') return res.status(405).json({error:'Method not allowed'});

  const { action, payload={} } = req.body || {};
  if (!action) return res.status(400).json({error:'action is required'});

  if (action==='verifyPin') {
    if (payload.pin && process.env.TEACHER_PIN && payload.pin===process.env.TEACHER_PIN) return res.status(200).json({ok:true});
    return res.status(403).json({error:'PINが違います'});
  }
  const teacher = pinOk(req);
  if (TEACHER_ACTIONS.has(action) && !teacher) return res.status(403).json({error:'この操作は先生のみ行えます'});

  try {
    const db = getDb();
    switch (action) {

      // ---- 先生：生徒管理 ----
      case 'saveStudent': {
        const p = payload;
        if (!p.name) return res.status(400).json({error:'name required'});
        const id = p.studentId || db.ref('dessin/students').push().key;
        const cur = (await db.ref('dessin/students/'+S(id)).once('value')).val() || {};
        const rec = {
          name: String(p.name), grade: String(p.grade||''),
          targetSchool: String(p.targetSchool||''), examDate: String(p.examDate||''),
          examInfo: String(p.examInfo||''), level: String(p.level||'初級'),
          passLine: Math.min(5, Math.max(1, parseFloat(p.passLine)||4.0)),
          createdAt: cur.createdAt || now(),
          streak: cur.streak || { count:0, lastSubmitDate:'' },
          badges: cur.badges || {}, bestScores: cur.bestScores || {}
        };
        await db.ref('dessin/students/'+S(id)).set(rec);
        return res.status(200).json({ok:true, studentId:id});
      }
      case 'deleteStudent': {
        await db.ref('dessin/students/'+S(payload.studentId)).remove();
        // 記録ごと削除（任意）：その生徒名の submissions / assignments も消す
        if (payload.purge && payload.studentName) {
          const name = payload.studentName;
          for (const node of ['submissions','assignments']) {
            const snap = await db.ref('dessin/'+node).once('value');
            const all = snap.val() || {};
            const updates = {};
            for (const [k,v] of Object.entries(all)) if (v && v.studentName === name) updates[k] = null;
            if (Object.keys(updates).length) await db.ref('dessin/'+node).update(updates);
          }
        }
        return res.status(200).json({ok:true});
      }

      // ---- 先生：課題づくり ----
      case 'assignmentDraftSave': {
        const p = payload;
        const id = p.assignmentId || db.ref('dessin/assignments').push().key;
        const cur = (await db.ref('dessin/assignments/'+S(id)).once('value')).val() || {};
        const rec = {
          studentName: String(p.studentName||cur.studentName||''),
          title: String(p.title||''), motif: String(p.motif||''), focus: String(p.focus||''),
          caution: String(p.caution||''),
          stage: String(p.stage||'基礎'), timeLimit: parseInt(p.timeLimit,10)||60,
          origin: p.origin || cur.origin || 'teacher',
          aiDraft: p.aiDraft || cur.aiDraft || null,
          teacherChat: cur.teacherChat || [],
          status: 'draft', ts: now()
        };
        await db.ref('dessin/assignments/'+S(id)).set(rec);
        return res.status(200).json({ok:true, assignmentId:id});
      }
      case 'assignmentChatAppend': {
        const ref = db.ref('dessin/assignments/'+S(payload.assignmentId)+'/teacherChat');
        await ref.push({ role:String(payload.role||'teacher'), text:String(payload.text||''), ts:now() });
        return res.status(200).json({ok:true});
      }
      case 'assignmentPublish': {
        await db.ref('dessin/assignments/'+S(payload.assignmentId)).update({ status:'published', ts:now() });
        return res.status(200).json({ok:true});
      }
      case 'assignmentDelete': {
        await db.ref('dessin/assignments/'+S(payload.assignmentId)).remove();
        return res.status(200).json({ok:true});
      }

      // ---- 生徒：提出（誰でも）----
      case 'submit': {
        const p = payload;
        if (!p.studentName || !/^data:image\//.test(p.imageBase64||'')) return res.status(400).json({error:'studentName/image required'});
        const rec = {
          studentName:String(p.studentName), assignmentId:String(p.assignmentId||''),
          assignment: p.assignment || {}, imageBase64:p.imageBase64,
          spentSec: parseInt(p.spentSec,10)||0, ts:now()
        };
        const ref = await db.ref('dessin/submissions').push(rec);
        const sId = p.studentId;
        if (sId) {
          const sref = db.ref('dessin/students/'+S(sId)+'/streak');
          const st = (await sref.once('value')).val() || { count:0, lastSubmitDate:'' };
          const today = todayStr();
          if (st.lastSubmitDate !== today) {
            const y = new Date(); y.setDate(y.getDate()-1);
            const yStr = `${y.getFullYear()}-${y.getMonth()+1}-${y.getDate()}`;
            st.count = (st.lastSubmitDate===yStr) ? (st.count||0)+1 : 1;
            st.lastSubmitDate = today;
            await sref.set(st);
          }
        }
        return res.status(200).json({ok:true, submissionId:ref.key});
      }
      case 'saveReview': {
        const p = payload;
        if (!p.submissionId || !p.aiReview) return res.status(400).json({error:'submissionId/aiReview required'});
        await db.ref('dessin/submissions/'+S(p.submissionId)+'/aiReview').set(p.aiReview);
        const updated = [];
        if (p.studentId && p.aiReview.scores) {
          const bref = db.ref('dessin/students/'+S(p.studentId)+'/bestScores');
          const best = (await bref.once('value')).val() || {};
          for (const k of AXES) {
            const v = p.aiReview.scores[k];
            if (typeof v==='number' && (!(k in best) || v>best[k])) { best[k]=v; updated.push(k); }
          }
          await bref.set(best);
        }
        return res.status(200).json({ok:true, bestUpdated:updated});
      }
      case 'updateSubmissionDate': {
        const ts=parseInt(payload.ts,10);
        if(!payload.submissionId || !ts) return res.status(400).json({error:'submissionId/ts required'});
        await db.ref('dessin/submissions/'+S(payload.submissionId)+'/ts').set(ts);
        return res.status(200).json({ok:true});
      }
      case 'deleteSubmission': {
        if(!payload.submissionId) return res.status(400).json({error:'submissionId required'});
        await db.ref('dessin/submissions/'+S(payload.submissionId)).remove();
        return res.status(200).json({ok:true});
      }
      case 'addReflection': {
        const text=String(payload.text||'').trim();
        if(!payload.submissionId || !text) return res.status(400).json({error:'submissionId/text required'});
        await db.ref('dessin/submissions/'+S(payload.submissionId)+'/reflections').push({ text:text.slice(0,2000), ts:now() });
        return res.status(200).json({ok:true});
      }
      case 'deleteReflection': {
        if(!payload.submissionId || !payload.reflectionId) return res.status(400).json({error:'submissionId/reflectionId required'});
        await db.ref('dessin/submissions/'+S(payload.submissionId)+'/reflections/'+S(payload.reflectionId)).remove();
        return res.status(200).json({ok:true});
      }
      case 'updateSubmissionMeta': {
        if(!payload.submissionId) return res.status(400).json({error:'submissionId required'});
        await db.ref('dessin/submissions/'+S(payload.submissionId)).update({
          genre:String(payload.genre||''), motif:String(payload.motif||'')
        });
        return res.status(200).json({ok:true});
      }
      case 'updateSubmissionTime': {
        const sec=parseInt(payload.spentSec,10);
        if(!payload.submissionId || isNaN(sec) || sec<0) return res.status(400).json({error:'submissionId/spentSec required'});
        await db.ref('dessin/submissions/'+S(payload.submissionId)+'/spentSec').set(sec);
        return res.status(200).json({ok:true});
      }
      case 'aiChatAppend': {
        await db.ref('dessin/submissions/'+S(payload.submissionId)+'/aiChat').push({
          q:String(payload.q||''), a:String(payload.a||''), ts:now()
        });
        return res.status(200).json({ok:true});
      }
      case 'awardBadge': {
        await db.ref('dessin/students/'+S(payload.studentId)+'/badges/'+S(payload.badgeKey)).set(now());
        return res.status(200).json({ok:true});
      }

      // ---- 先生：手描き添削 ----
      case 'teacherReview': {
        const p = payload;
        if (!/^data:image\//.test(p.annotatedImage||'')) return res.status(400).json({error:'invalid image'});
        await db.ref('dessin/submissions/'+S(p.submissionId)+'/teacherReview').set({
          annotatedImage:p.annotatedImage, comment:String(p.comment||''),
          refUrl:String(p.refUrl||''), refImage:(/^data:image\//.test(p.refImage||'')?p.refImage:''), ts:now()
        });
        return res.status(200).json({ok:true});
      }

      default: return res.status(400).json({error:'unknown action: '+action});
    }
  } catch (err) {
    console.error('db api error:', action, err);
    return res.status(500).json({error: err.message || 'Internal server error'});
  }
};
