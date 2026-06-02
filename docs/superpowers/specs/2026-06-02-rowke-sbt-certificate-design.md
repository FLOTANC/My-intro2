# rowke 修了証・成長記録 SBT（体験デモ版）設計

作成日: 2026-06-02
対象: `art-feedback/`（rowke アプリ）

## 目的

子どもの修了証・成長記録を SBT（譲渡不可トークン）として発行する機能を追加する。
「その子の作品・成長の断片が刻まれた、世界に一枚の証明書 ＝ 親御さんの宝物」を実現する。

体験デモ版として作る（ブロックチェーンには接続しない）が、後から本物の
オンチェーン SBT に差し替え可能な構造にしておく。

## スコープ

### やること
- 先生が生徒の修了証を発行する機能（先生ビュー内）
- 一意トークンID付き証明書を Firebase に保存
- 専用ページ（一意URL）での証明書表示
- 素の Canvas API による PNG ダウンロード
- 生徒・保護者ビューでの自分の修了証の閲覧

### やらないこと（YAGNI）
- 実ブロックチェーンへの mint（ウォレット接続・ガス代・IPFS）
- 生徒・保護者自身による発行（将来検討）
- 証明書の編集・失効機能（初版では発行のみ）

## 既存システムの前提

- **作品**: Firebase Realtime DB `art/artworks/{id}`
  - フィールド: `studentName` / `title` / `artworkType` / `ts`(日時) /
    `imageBase64`(画像) / `likes` / `comments` 等
- **会話**: Supabase `art_conversations`（Wake先生チャット履歴）
- **AI**: `api/chat.js` 経由で Google Gemini 2.5 Flash（Wake先生人格プロンプト入り）
- **Firebase 設定**: クライアント側に埋め込み済み（既存）
- フロント構成: 単一 `index.html`（インライン CSS/JS）＋ `/api/*` サーバーレス

## データ構造

Firebase Realtime DB `art/certificates/{token_id}` に保存。
（既存作品と同じ Firebase に置くことで、証明書ページが API なしで直接読める）

| フィールド | 型 | 内容 |
|---|---|---|
| `token_id` | string | 一意ID。`ROWKE-2026-0001` 形式の連番＋ランダム hash |
| `studentName` | string | 生徒名 |
| `artworkIds` | string[] | 代表作品の Firebase ID（既存 `art/artworks` を参照。画像は重複保存しない） |
| `wakeMessage` | string | Wake先生の言葉（発行時に Gemini 生成、手直し可） |
| `periodText` | string | 在籍期間（例 `2025.4〜2026.3`） |
| `artworkCount` | number | 作品数（その生徒の作品を自動集計） |
| `issuedAt` | number | 発行日時（epoch ms） |
| `issuer` | string | 発行者（先生名） |
| `soulbound` | boolean | `true` 固定（譲渡不可の明示） |
| `metadata` | object | ERC-721 互換 JSON（将来 mint 用。name/description/image/attributes） |

### token_id 生成規則
- `ROWKE-{年}-{4桁連番}` ＋ 短いランダム hash（推測困難化のため）
- 例: `ROWKE-2026-0001-a3f9`

## 画面・操作フロー

### 先生ビュー：「🏅 修了証を発行」（先生のみ表示）
1. 生徒を選択（既存の生徒リストから）
2. その生徒の作品一覧から **代表作品を選ぶ**（1〜数点）
3. **在籍期間**を入力（作品の最古〜最新 `ts` から初期値を自動補完）
4. 「**Wake先生の言葉を生成**」→ `api/chat.js` を利用し、その子の作品・成長を
   踏まえた祝福メッセージを生成（テキストエリアで手直し可）
5. プレビュー表示
6. 「**発行する**」→ `issueCertificate()` で Firebase に保存
7. 発行後、**証明書URL** を表示（コピー／シェア）

### 生徒・保護者ビュー
- 自分（その生徒）の修了証があれば「🏅 わたしの修了証」として表示・閲覧

## 証明書ページ

- **別ファイル `certificate.html?id=TOKEN_ID`**（アプリ本体と分離）
  - 理由: URL 共有・OGP 表示・印刷向き。Firebase から `token_id` で直接読込（API なし）
- **デザイン**: rowke の世界観（海・青、航跡モチーフ）の縦長 1 枚絵
  - 教室名 / 生徒名 / 代表作品 / Wake先生の言葉 / 在籍記録 /
    **Token ID・発行日・「Soulbound（譲渡不可）」バッジ**
- 存在しない `token_id` の場合はエラーメッセージ表示

## PNG 保存

- 新規ライブラリは追加しない（CLAUDE.md 遵守）。html2canvas 等は使わない。
- **素の Canvas API で証明書を直接描画**して PNG 化する
  - 背景グラデーション、作品画像（`drawImage`）、テキスト折返しを手書き
  - `canvas.toDataURL('image/png')` → `<a download>` でダウンロード
- メリット: 依存ゼロ・きれいな固定レイアウト PNG
- デメリット: 描画コードがやや多い（許容）

## 将来の本物 SBT 差し替え設計

- 発行処理を **`issueCertificate()` 1 関数に集約**。初版は Firebase 保存のみ。
- `metadata` を ERC-721 互換 JSON で保持しておく。
- 将来この関数内に「ウォレットへ mint」処理を足すだけで本物の SBT に昇格できる。

## エラーハンドリング

- 生徒に作品が 1 点もない場合: 発行不可（代表作品が選べないため）の旨を表示
- Wake先生の言葉生成失敗時: 手入力にフォールバック（空のテキストエリアで続行可）
- 証明書ページで `token_id` 不正・未存在: 「証明書が見つかりません」表示

## セキュリティ・制約（CLAUDE.md 遵守）

- 新規 JS ライブラリ／CDN は追加しない（PNG は素 Canvas）
- 秘密情報はコードに書かず環境変数（既存の Supabase / Gemini 鍵を流用）
- 既存の単一 HTML ＋ `/api/*` パターンに合わせる
- `wake-sensei.png` など既存アセットは変更しない

## 受け入れ基準

- 先生が生徒を選び、代表作品・期間・Wake先生の言葉を含む証明書を発行できる
- 発行された証明書が一意 URL で表示できる
- 証明書ページから PNG をダウンロードできる
- 生徒・保護者ビューで自分の修了証を閲覧できる
- 証明書データが ERC-721 互換 metadata を含んで保存されている
