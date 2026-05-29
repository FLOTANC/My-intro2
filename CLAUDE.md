# CLAUDE.md — AI作業指示書

このファイルはAIエージェント（Claude Code等）向けの作業指示です。

## プロジェクト概要

FLOTANのポートフォリオサイト＋jibot.md連携スクリプトのリポジトリ。

- `index.html` — ポートフォリオ本体（単一HTMLファイル、CSS・JSをインライン記述）
- `jibot-handshake/` — jibot.md との x402 ハンドシェイクスクリプト（Node.js）
- デプロイ先：Vercel

## 技術スタック

- フロントエンド：HTML / CSS / JavaScript（バンドラーなし、単一ファイル構成）
- フォント：Google Fonts（Poppins、Inter）
- jibot連携：`@x402/axios`、`@x402/evm`、`viem`（Node.js ESM）

## 作業ルール

### デザイン・スタイル
- カラーパレットは `:root` の CSS 変数を使うこと（直接カラーコードを埋めない）
- 主要カラー：`--purple: #9333ea`、`--pink: #f472b6`、`--mint: #34d399`
- 背景色：`--bg: #0d0820`（ダークテーマ固定）

### コード変更
- `index.html` はすべてのCSS・JSがインラインのため、変更箇所のセクションを必ず特定してから編集する
- アニメーションやレイアウト変更は視覚的な影響範囲が広いため、変更前に対象セクションをコメントで確認すること
- 新しいJSライブラリは追加しない（CDNリンクも含む）

### jibot-handshake
- `WALLET_PRIVATE_KEY` と `WALLET_ADDRESS` は環境変数で管理（コードに直接書かない）
- `.gitignore` に `.env` が含まれていないため、秘密鍵を含むファイルは絶対にコミットしない

### コミット
- コミットメッセージは英語で簡潔に記述する
- セクション単位の変更ごとにコミットを分ける

## 禁止事項

- `avatar.png` の削除・変更
- `.vercel/` ディレクトリの変更
- 秘密鍵・ウォレットアドレスのハードコード
- `jibot-handshake/node_modules/` のコミット
