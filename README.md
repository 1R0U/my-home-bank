# 🏠 おうちギルド（OUCHI GUILD）

> 家族のクエストで ゴルをかせごう

家庭内の家事・お手伝いを「クエスト」にして、家族だけの通貨「ゴル（`gol`）」で報酬を払う家族向けアプリです。
稼いだゴルは銀行に預けたり、ストアで「ゲーム1時間延長券」のような家庭内の権利と交換したりできます。

リポジトリ名の `my-home-bank` は、旧名「我が家中央銀行」の名残です。

---

## 🌟 このアプリで届けたいこと

「宿題やった？」「お風呂掃除してよ！」という日常の小競り合いを、家族全員で遊ぶ経済ゲームに変えます。

1. **家事・お手伝いの自発化**: 命令や小言ではなく、子どもが自分からクエストを探して動くようにする
2. **生きた金融教育**: 貯金・ローンと利息・物価といった仕組みを、家庭内のやり取りで体験する
3. **家族の記録**: 「誰が・いつ・何に貢献したか」が履歴として残り、家族の成長記録になる

---

## 🛠 主な機能

画面は **大人用** と **子供用** に分かれます。子供は「我が家タウン」を歩いて建物から各機能へ入り、大人は下のタブから操作します。

### 実装済み

| 機能 | 内容 |
| --- | --- |
| タイトル・ログイン | タイトル画面 → Supabase Auth のログイン（メール / Google）。公開登録は新しい家族を作る親アカウントのみ |
| 家庭とギルド金庫 | 家族を作ると、家庭全体のゴルを保管する「ギルド金庫」が作られる。報酬や支払いは金庫との間でやり取りし、親は金庫にゴルを追加発行できる |
| クエスト | 親がクエストを登録 → 子が受注・完了申請 → 親が承認すると、ギルド金庫から報酬が支払われる |
| タスク報告 | クエストとは別に、子が自主的にやった家事を報告できる |
| ストア | 子がゴルで商品（家庭内の権利など）と交換する。在庫管理あり。子から親へ「この商品を置いてほしい」と申請もできる |
| 銀行 | お財布と預金の間で預入・引き出しができる |
| ローン | 子が借入を申請 → 親が承認すると、金庫から融資される。月利・返済期限・限度額つき |
| 履歴 | 取引の履歴と、収入・支出のグラフ |
| 我が家タウン（RPGハブ） | 3Dの町をキャラクターで歩き、建物から各機能へ入る。季節で見た目が変わる。子供のホーム画面 |
| キャラクター・着せ替え | キャラクターの種類と色を選び、帽子などを身に着けられる。庭に装飾を置ける |
| 設定 | 生年月日・性別などのプロフィール設定 |

### まだ無いもの・これから

- 預金利息の計算と付与（利率の設定値はあるが、付与の処理は未実装）
- 家族作成者以外が既存の家族に参加する流れ（子供アカウントの追加）
- 物価指数を使った、ストア価格の自動調整（物価指数の計算はDB側にあるが、画面・価格には未反映）
- 着せ替え品・装飾を買う仕組み（今は全員に配っている）

仕様が決まっていない点は [docs/domain-glossary.md](docs/domain-glossary.md) の「未確定・要確認の一覧」にまとめています。

---

## 🗄 データと運用の前提

- **1つの Supabase プロジェクトで複数の家庭を扱えます。** 共有データは `family_id`、個人データは `user_id` で家庭へ紐付け、RLS（Row Level Security）で家庭・本人の境界を強制します。
- ゴルの移動（報酬・購入・融資・返済など）は、DB側のRPC（Postgres関数）で行い、経済台帳に移動元・移動先とともに記録します。再送による二重計上は冪等キーで防ぎます。
- DBの構造は [supabase/migrations/](supabase/migrations/) のSQLで管理しています。管理画面から直接変更しないでください（[AGENTS.md](AGENTS.md) の「DBの構造変更」参照）。

「残高」「承認」などの言葉の意味は [docs/domain-glossary.md](docs/domain-glossary.md) にそろえています。

---

## 🧰 技術スタック

| カテゴリ | 採用技術 | 備考 |
| --- | --- | --- |
| 言語 | TypeScript | `strict: false` |
| モバイル | Expo / React Native | |
| ルーティング | Expo Router | `app/` 配下のファイルベースルーティング |
| スタイル | NativeWind | Tailwind CSS for React Native |
| 状態管理 | Zustand | |
| バックエンド | Supabase | PostgreSQL / Auth / Realtime / Storage。クライアントから直接呼び出す（TanStack Query 等は未導入） |
| 3D表示 | WebView + Babylon.js | 我が家タウンとタイトル画面の背景。`webview/rpg-hub/scene.ts` を esbuild でバンドルして渡す（[選定の経緯](docs/RPG_HUB_ENGINE_INVESTIGATION.md)） |
| テスト | `node --test` / Jest | ロジックは `tests/*.test.mjs`、画面の描画は `tests/*.render.test.tsx` |
| CI | GitHub Actions | 型チェック・テスト・DBマイグレーションの検証 |

---

## 🚀 開発セットアップ

必要なもの: Node.js 22.13 以上 / npm / スマホの Expo Go / Supabase プロジェクト

```bash
git clone https://github.com/1R0U/my-home-bank.git
cd my-home-bank

cp .env.example .env
# .env に Supabase の Project URL と anon key を記入（Project Settings > API）

npm install   # postinstall で RPGハブのシーンもバンドルされる
npm start
```

表示された QR コードを Expo Go で読み込むとスマホで確認できます。
初回の詳しい手順・Development Build・Googleログインの設定は [docs/DEVELOPMENT.md](docs/DEVELOPMENT.md) を参照してください。

### よく使うコマンド

| コマンド | 内容 |
| --- | --- |
| `npm start` | 開発サーバーを起動（タイトル画面 → ログイン） |
| `npm run start:parent` | 大人ホームの開発プレビュー（認証なし・モックデータ） |
| `npm run start:child` | 子供ホームの開発プレビュー（認証なし・モックデータ） |
| `npx tsc --noEmit` | 型チェック |
| `npm test` | テスト（ロジック + 画面の描画） |
| `npm run build:scene` | 我が家タウンの3Dシーンをバンドル |

`start:parent` / `start:child` は開発ビルド限定（`__DEV__`）のプレビューです。Supabaseの実データは読み書きしません。実データを確認するときは、`npm start` のログイン画面の「新しいアカウントを登録」から親アカウントを作ってください（初回ログイン時に家族とギルド金庫が自動作成されます）。

Supabase Dashboard からテストユーザーを作る場合は、User Metadata に `name` と `role: "parent"` を必ず設定してください。メタデータがないと、プロフィール不整合を防ぐDBトリガーにより作成に失敗します。

### Edge Function のデプロイ

Authアカウントの作成など、管理者権限が要る処理は `supabase/functions/` の Edge Function に置いています。変更したら Supabase CLI でデプロイします。

子供アカウントは公開登録できません。親でログインし、設定画面の「家族の子供」から追加して、子供ごとのログインコードを発行します。子供の端末ではログイン画面の「こどもはこちら」から8文字のコードを入力します。有効期限は10分、使用は1回だけです。再発行すると前のコードは使えません。入り直しても同じアカウントとデータを使い、新しい端末でログインすると以前の端末は使えなくなります（[Issue #264](https://github.com/1R0U/my-home-bank/issues/264)）。本番へ反映する順番と確認手順は [子供のコードログイン](docs/CHILD_LOGIN.md) を参照してください。

```bash
npx supabase login
npx supabase link --project-ref <プロジェクトID>
npx supabase functions deploy create-child-account
npx supabase functions deploy child-code-login
```

| 関数 | 役割 |
| --- | --- |
| `create-child-account` | 親が自分の家族へ子供アカウントを追加する（[Issue #264](https://github.com/1R0U/my-home-bank/issues/264)） |
| `child-code-login` | 親が発行したコードを既存の子供セッションへ交換し、以前の端末を失効する。ログイン前に呼ぶためJWT検証を無効にし、DB側でコード検証と試行制限を行う |

- `SUPABASE_URL` / `SUPABASE_ANON_KEY` / `SUPABASE_SERVICE_ROLE_KEY` は Supabase が関数へ自動で渡します。`.env` に service role キーを置く必要はありません（アプリへ入れてはいけません）。
- Edge Function は Deno で動くため、`tsconfig.json` の型チェック対象から外しています。本体の処理は `handler.ts` に分け、`npm test` から検証しています。

---

## 📁 ディレクトリ構成

```
my-home-bank/
├── app/          # 画面（Expo Router）。(adult)/ は大人用タブ
├── components/   # 画面の中身と、複数画面で使うパーツ
├── lib/          # Supabase 呼び出し・ロジック（rpg-hub/ は我が家タウン）
├── store/        # Zustand（状態管理）
├── constants/    # 定数・モックデータ
├── types/        # 型定義
├── webview/      # 我が家タウンの3Dシーン（Babylon.js）
├── supabase/     # DBマイグレーション
├── tests/        # テスト（sql/ はDB検証用）
├── scripts/      # シーンのバンドルなど
├── assets/       # 音声など
└── docs/         # ドキュメント
```

---

## 🤝 開発に参加するとき

Issue作成 → ブランチ作成 → PR → CI・CodeRabbitレビュー → マージ の流れで進めます。`main` への直接 push はできません。

- [AGENTS.md](AGENTS.md) — 作業ルール（AIツール共通）
- [CONTRIBUTING.md](CONTRIBUTING.md) — 開発フローの要約
- [docs/DEVELOPMENT.md](docs/DEVELOPMENT.md) — 環境構築を含む詳細な開発ガイド
- [docs/domain-glossary.md](docs/domain-glossary.md) — 用語集
- [docs/RPG_HUB_ARCHITECTURE.md](docs/RPG_HUB_ARCHITECTURE.md) — 我が家タウンの構成

---

## 📝 開発者メッセージ

このアプリの競合は、家計簿アプリやタスク管理アプリではありません。
**「ゲームの電源を切って、現実の人生を攻略したくなるような体験」** を作ることが、このリポジトリのゴールです。
