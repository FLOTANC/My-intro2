# rowke セキュリティ強化 第2弾 設計

作成日: 2026-06-12
対象: `art-feedback/`（rowke アプリ）

## 目的

1. 先生PINの照合をサーバー側に移す（現在はクライアントに `r1043` が直書きで、Git履歴にも残っている＝漏洩済み扱い）
2. Firebase Realtime DB への書き込みを Vercel API に集約し、ブラウザからの直接書き込みをルールで全面遮断する
3. rowke 専用の Firebase プロジェクトに分離する（family-compass との共用を解消し、被害波及を防ぐ）

## スコープ

### やること
- 新規エンドポイント `api/db.js`（汎用書き込みAPI、firebase-admin 使用）
- クライアント（index.html / certificate.html）の全書き込み約40箇所を `dbWrite(action, payload)` ラッパー経由に置換
- 先生PIN照合のサーバー化（`TEACHER_PIN` 環境変数）、`r1043` のコード削除
- 新 Firebase プロジェクトへのデータ移行（一時アクション `migrate` で実施、完了後削除）
- 新旧プロジェクトのルール設定

### やらないこと（YAGNI / 次回以降）
- 読み取りの閲覧制限（`.read` は引き続き `true`。次フェーズ）
- Firebase Auth の導入（クライアントへのSDK追加は CLAUDE.md のフロントエンド制約に抵触）
- `/api/chat` 等へのレート制限・Origin制限（別課題）

## 決定事項

- **先生PIN**: 新しいPINに変更。値は利用者が Vercel 環境変数 `TEACHER_PIN` に直接設定（チャット・コード・リポジトリに書かない）
- **旧データ**: 移行確認後も旧プロジェクトに残し、`/art` をルールで読み書き禁止にしてバックアップ化。削除は後日手動
- **アーキテクチャ**: 汎用1エンドポイント方式（案A）。機能別分割（案B）は Vercel Hobby の関数数制限と検証ロジック分散のため不採用。Firebase Auth（案C）はフロントの追加ライブラリ禁止に抵触するため不採用

## 全体像

```
[ブラウザ] ──読み取り──→ Firebase RTDB（新プロジェクト） ※ .read:true / .write:false
[ブラウザ] ──書き込み──→ Vercel /api/db ──(firebase-admin・ルール無視)──→ RTDB
[ブラウザ] ──AI──→ /api/chat, /api/certificate（既存のまま）
```

- 読み取りはクライアント直接のまま（リアルタイム監視 `.on()` を維持）
- 書き込みのみ全面的にAPI経由

## `/api/db` 設計

リクエスト: `POST /api/db` で `{ action, payload }`。先生専用アクションは `x-teacher-pin` ヘッダ必須（サーバーが `TEACHER_PIN` と毎回照合）。

### アクション一覧

| 区分 | アクション | 内容 | PIN |
|---|---|---|---|
| 認証 | `verifyPin` | PIN照合のみ（ログイン時） | —（payloadで照合） |
| 誰でも | `uploadArtwork` | `art/artworks` へ push | 不要 |
| 誰でも | `postComment` | コメント push。**role は 'parent' を強制**（PINがあれば teacherComment 更新を許可） | 役割で分岐 |
| 誰でも | `postReply` | 返信 push（role はPINの有無で決定） | 役割で分岐 |
| 誰でも | `like` | likes 更新（数値・0以上のみ） | 不要 |
| 誰でも | `setParentAvatar` | 保護者アバター | 不要 |
| 誰でも | `sendContact` | `art/messages` へ push（role強制） | 不要 |
| 誰でも | `wakeNotification` | `art/wake_notifications` へ push | 不要 |
| 誰でも | `postCritiqueComment` | 講評コメント push | 不要 |
| 先生 | `updateArtwork` / `deleteArtwork` | 作品の編集・削除 | 必須 |
| 先生 | `editComment` / `deleteComment` / `deleteReply` | コメント・返信の編集削除 | 必須 |
| 先生 | `saveAnalysis` | 成長分析の記録 | 必須 |
| 先生 | `saveNextClass` / `deleteNextClass` | 授業情報（共通・生徒別） | 必須 |
| 先生 | `critiqueWrite` / `critiqueDelete` | 講評の編集・削除・セッション管理 | 必須 |
| 先生 | `contactRead` / `contactDelete` | 連絡の既読・削除 | 必須 |
| 先生 | `setTeacherAvatar` / `setStudentAvatar` | 先生・生徒アバター | 必須 |
| 先生 | `issueCertificate` | 修了証発行（token_id採番含む。将来のSBT mintフックもここ） | 必須 |
| 一時 | `migrate` | 旧DBの `/art` をRESTで読み新DBへコピー。移行完了後にコードから削除 | 必須 |

### サーバー側の強制事項
- パスはすべてサーバー側で組み立てる（クライアントから生パスを受け取らない）
- PINなしリクエストは teacher 系フィールド（teacherComment 等）に書けない
- 不明なアクションは 400

## クライアント変更

- `dbWrite(action, payload)` ラッパーを追加（fetch で `/api/db` を呼ぶ。先生PINは localStorage に保持しヘッダ送信）
- 約40箇所の `db.ref(...).set/update/push/remove` をラッパー呼び出しに置換（読み取り `.once/.on` は変更しない）
- `checkTeacherPw()` は `verifyPin` アクションでサーバー照合。成功時にPINを localStorage（`rowke_teacher_pin`）へ保存。`btoa('r1043')` 比較は削除
- `issueCertificate()` はAPI呼び出しに置換（採番・保存はサーバー）
- `firebaseConfig` を新プロジェクトのWeb設定に差し替え（index.html / certificate.html の2箇所）

## Firebase ルール

新プロジェクト:
```json
{ "rules": { "art": { ".read": true, ".write": false } } }
```

旧プロジェクト（移行確認後、既存ルールに追記）:
```json
"art": { ".read": false, ".write": false }
```

## 環境変数（Vercel・利用者が直接設定）

- `FIREBASE_SERVICE_ACCOUNT` … 新プロジェクトのサービスアカウントJSON（全文）
- `FIREBASE_DB_URL` … 新プロジェクトのRTDB URL
- `TEACHER_PIN` … 新しい先生PIN

## 移行手順（役割分担）

1. 【利用者】Firebaseコンソールで新プロジェクト作成＋Realtime Database作成（asia-southeast1、上記ルールを設定）
2. 【利用者】サービスアカウント鍵を生成し、Vercel に環境変数3つを設定
3. 【利用者→AI】新プロジェクトのWeb設定（apiKey等＝公開情報）を共有
4. 【AI】`/api/db` 実装＋クライアント置換＋設定差し替え＋プレビュー検証
5. 【AI】`migrate` アクションでデータ移行＋件数照合（artworks / certificates 等のキー数一致）
6. 【AI】本番デプロイ＋E2E確認
7. 【利用者】旧プロジェクトの `/art` ルール封鎖（AIが貼り付け内容を提供）
8. 【AI】`migrate` アクションをコードから削除

ダウンタイムは切替デプロイの数十秒のみ。

## エラー処理

- API失敗時はクライアントで `alert` 表示（既存パターン踏襲）。書き込み失敗でも読み取り・表示は影響なし
- `/api/db` は try/catch で 500 と `{error}` を返す。PIN不一致は 403

## 検証（受け入れ基準）

- 先生/生徒の両ロールで全書き込み操作が動作（投稿・コメント・返信・いいね・削除・分析・授業編集・講評・連絡・修了証発行・アバター）
- **ブラウザコンソールから `firebase.database().ref('art/x').set(...)` が PERMISSION_DENIED になる**（本丸）
- PINなし／誤PINで先生系アクションが 403
- 旧→新でデータ件数が一致し、アプリ表示・修了証ページ・PNG保存が正常
- 旧プロジェクトの `/art` がREST経由で読めなくなっている
- コード・リポジトリ内に PIN 文字列が存在しない

## 制約の扱い

- `firebase-admin` をサーバー側依存として package.json に追加する。CLAUDE.md の「新しいJSライブラリ禁止」はフロントエンド（単一HTML・CDN）の規約であり、サーバー側は既に `@supabase/supabase-js` を使用しているため整合と判断
