# AGENTS.md

このファイルは、このリポジトリで作業する **全てのAIコーディングツール共通** のルールです。
Claude Code、Cursor、GitHub Copilot、Codex など、使用するツールに関わらずここに書かれたルールに従ってください。
（ツール固有の設定ファイルがある場合は、このファイルを参照する形にしています。重複させず、ルールの変更は必ずこのファイルに対して行ってください。）

## プロジェクト概要

「我が家中央銀行」— 家庭内の家事・お手伝いをクエスト化し、独自通貨・銀行・ストアで報酬を与える家族向けアプリ。
詳細は [README.md](README.md) を参照。

## 技術スタック

- TypeScript（`strict: false`）
- Expo / React Native（Expo Router によるファイルベースルーティング）
- NativeWind（Tailwind CSS for RN）
- Zustand（状態管理）
- Supabase（DB / Auth / Realtime、直接呼び出し。TanStack Query 等は未導入）

## 開発フロー（必須・省略不可）

```
Issue作成 → ブランチ作成 → コード変更 → コミット → Push → PR作成 → CI確認 → CodeRabbitレビュー確認 → Approve/マージ
```

- **Issue を作らずに作業を始めない。** 何をするか宣言してから着手する。
- **`main` への直接 push は禁止。** 必ずブランチを切り、PR経由でマージする（ブランチ保護あり）。
- **PRタイトルは対応する Issue のタイトルに合わせる。**
- マージ後は該当ブランチを削除する。

### ブランチ名

```
{type}/#{Issue番号}-{内容（kebab-case）}
```

| type | 用途 |
| --- | --- |
| `feature` | 新機能・画面・ロジックの追加 |
| `fix` | バグ修正 |
| `chore` | 設定変更・依存更新・リファクタなど |

例: `feature/#5-add-login-screen`, `fix/#12-quest-approval-crash`

### コミットメッセージ

```
{種類}: {何をしたか}
```

種類: `feat` / `fix` / `chore` / `docs` / `style` / `refactor`

## PR前チェック（CIと同じ内容をローカルで先に確認する）

```bash
npx tsc --noEmit   # 型チェック（CIの Type Check ジョブと同一）
npm test           # テスト（現状プレースホルダーのみ。ロジックを追加したらテストも追加する）
```

- CI（Type Check / Test）が通ることを確認してから push する。
- CodeRabbit の自動レビューコメントを確認し、妥当な指摘は修正してから再度 push する。
- PRテンプレート（`.github/PULL_REQUEST_TEMPLATE.md`）の確認事項（動作確認、`.env.example` の更新有無）を必ず埋める。

## コーディング上のルール

- コミュニケーション・コメント・ドキュメントは日本語。
- `tsconfig.json` は `strict: false` スタート。無理に厳格化しない（明示的な指示がない限り）。
- 新しい画面は `app/` 配下にファイルを追加する（Expo Router のファイルベースルーティング）。
- 複数画面で使うUIパーツは `components/`、状態管理は `store/`、Supabase呼び出しは `lib/supabase.ts` 経由。
- `.env` はコミットしない。新しい環境変数を追加したら `.env.example` も更新する。
- タスクの範囲を超えたリファクタや抽象化を勝手に混ぜない（別Issueに切り出す）。

## ディレクトリ構造

```
my-home-bank/
├── app/          # 画面ファイル（Expo Router）
├── components/   # 複数画面で使い回すパーツ
├── lib/          # Supabase クライアントなど
├── store/        # Zustand（状態管理）
├── constants/    # 定数
├── types/        # 型定義
├── assets/       # 画像・フォントなど
└── docs/         # ドキュメント（開発ガイド等）
```

## 関連ドキュメント

- [CONTRIBUTING.md](CONTRIBUTING.md) — 開発フローの要約
- [docs/DEVELOPMENT.md](docs/DEVELOPMENT.md) — 環境構築を含む詳細な開発ガイド（初回セットアップ手順など）
