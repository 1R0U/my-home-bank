# 開発ガイド

このドキュメントを読めば、開発の始め方から PR のマージまで一通り進められます。

---

## 目次

1. [最初の1回だけやること（環境構築）](#1-最初の1回だけやること環境構築)
2. [毎回の開発フロー](#2-毎回の開発フロー)
3. [Git コマンド早見表](#3-git-コマンド早見表)
4. [ディレクトリ構造](#4-ディレクトリ構造)
5. [よくあるトラブル](#5-よくあるトラブル)

---

## 1. 最初の1回だけやること（環境構築）

### 1-1. Node.js をインストール

[https://nodejs.org](https://nodejs.org) から **LTS版（推奨版）** をダウンロードしてインストール。

インストール確認：

```bash
node -v   # v22.x.x と表示されればOK
npm -v    # 10.x.x と表示されればOK
```

### 1-2. Git をインストール

[https://git-scm.com](https://git-scm.com) からダウンロードしてインストール。

インストール確認：

```bash
git --version   # git version 2.x.x と表示されればOK
```

### 1-3. スマホに Expo Go をインストール

- iPhone: App Store で「Expo Go」を検索
- Android: Google Play で「Expo Go」を検索

### 1-4. リポジトリをクローン

```bash
git clone https://github.com/1R0U/my-home-bank.git
cd my-home-bank
```

### 1-5. 環境変数を設定

```bash
cp .env.example .env
```

`.env` をテキストエディタで開いて、Supabase の情報を貼り付ける：

```
EXPO_PUBLIC_SUPABASE_URL=https://xxxxxxxx.supabase.co    ← Supabase の URL
EXPO_PUBLIC_SUPABASE_ANON_KEY=xxxxxxxx                   ← Supabase の anon key
```

> **Supabase の情報の確認場所**
> Supabase ダッシュボード → プロジェクトを選択 → Project Settings → API

### 1-6. パッケージをインストール

```bash
npm install --legacy-peer-deps
```

`node_modules` というフォルダが作られる（数分かかることがある）。

### 1-7. 動作確認

```bash
npm start
```

ターミナルに QR コードが表示される。スマホの Expo Go で読み込むと画面が起動する。

---

## 2. 毎回の開発フロー

何かを作るときは必ずこの順番で進める。

```
Issue を作る → ブランチを切る → コードを書く → コミット → Push → PR を作る → CI確認 → レビュー確認 → マージ
```

### Step 1. Issue を作る

GitHub の [Issues タブ](https://github.com/1R0U/my-home-bank/issues) を開いて「New issue」をクリック。

テンプレートを選ぶ：

| テンプレート | 使いどき |
| --- | --- |
| Feature | 新しい画面や機能を作るとき |
| Fix | バグを直すとき |
| Chore | 設定変更やライブラリ追加など |

Issue を作ったら、番号（例：`#5`）をメモしておく。

---

### Step 2. ブランチを切る

main ブランチから新しいブランチを作って、そこで作業する。

```bash
# まず main を最新にする
git checkout main
git pull origin main

# ブランチを作って移動する
git checkout -b feature/#5-add-login-screen
```

**ブランチ名のルール：**

```
{種類}/#{Issue番号}-{内容をハイフンでつなぐ}
```

| 種類 | 使いどき |
| --- | --- |
| `feature` | 新機能 |
| `fix` | バグ修正 |
| `chore` | 設定・雑務 |

**例：**

```
feature/#5-add-login-screen
fix/#12-quest-approval-crash
chore/#3-setup-eslint
```

---

### Step 3. コードを書く

ファイルを編集する。開発サーバーを起動しておくとリアルタイムで確認できる：

```bash
npm start
```

> **保存するたびに自動でスマホの画面が更新される。**

---

### Step 4. コミットする

変更をひとまとまりにして保存する操作。

```bash
# 変更したファイルを確認
git status

# 変更をステージ（コミットの準備）
git add ファイル名
# または全部まとめてステージするとき
git add .

# コミット（変更内容のメモをつける）
git commit -m "feat: ログイン画面を追加"
```

**コミットメッセージの書き方：**

```
{種類}: {何をしたか}
```

| 種類 | 使いどき |
| --- | --- |
| `feat` | 新機能を追加 |
| `fix` | バグを修正 |
| `chore` | 設定変更・ライブラリ追加など |
| `docs` | ドキュメントの変更 |
| `style` | 見た目の調整 |
| `refactor` | 動作は変えずにコードを整理 |

---

### Step 5. GitHub に Push する

```bash
git push origin feature/#5-add-login-screen
```

初回だけ `-u` が必要な場合もある：

```bash
git push -u origin feature/#5-add-login-screen
```

---

### Step 6. PR（プルリクエスト）を作る

1. GitHub を開くと「Compare & pull request」というボタンが出ているのでクリック
2. タイトルと内容を書く（テンプレートが自動で入る）
3. 「Create pull request」をクリック

---

### Step 7. CI が通るのを待つ

PR を作ると自動で CI（テスト）が動く。

| チェック | 内容 |
| --- | --- |
| Type Check | TypeScript の型エラーがないか確認 |
| Test | テストが通るか確認 |

- ✅ 緑ならOK
- ❌ 赤なら失敗。ログを見てエラーを直してから再度 Push する

---

### Step 8. CodeRabbit のレビューを確認する

PR を作ると CodeRabbit が自動でコードレビューしてくれる。  
コメントを読んで、直した方がよさそうなところは修正する。

修正したら：

```bash
git add .
git commit -m "fix: CodeRabbitの指摘を修正"
git push origin feature/#5-add-login-screen
```

Push すると CI と CodeRabbit が再度動く。

---

### Step 9. Approve してマージする

CI が通って CodeRabbit のレビューを確認したら：

1. PR ページを開く
2. 「Files changed」タブでコードを確認
3. 「Review changes」→「Approve」→「Submit review」
4. 「Merge pull request」→「Confirm merge」

マージ後はブランチを削除してOK（「Delete branch」ボタンが出る）。

---

## 3. Git コマンド早見表

| やりたいこと | コマンド |
| --- | --- |
| 今の状態を確認 | `git status` |
| 変更内容を確認 | `git diff` |
| 変更をステージ | `git add ファイル名` |
| 全変更をステージ | `git add .` |
| コミット | `git commit -m "メッセージ"` |
| Push | `git push origin ブランチ名` |
| ブランチ一覧 | `git branch` |
| ブランチを作って移動 | `git checkout -b ブランチ名` |
| ブランチを移動 | `git checkout ブランチ名` |
| main を最新にする | `git checkout main && git pull origin main` |
| コミット履歴を見る | `git log --oneline` |

---

## 4. ディレクトリ構造

```
my-home-bank/
│
├── app/                    # 画面ファイル（Expo Router）
│   ├── _layout.tsx         # アプリ全体のレイアウト
│   └── index.tsx           # トップ画面
│
├── components/             # 複数の画面で使い回すパーツ
│
├── lib/
│   └── supabase.ts         # Supabase クライアント（DB接続）
│
├── store/
│   └── index.ts            # Zustand（アプリ全体の状態管理）
│
├── assets/                 # 画像・フォントなど
│
├── docs/                   # ドキュメント
│
├── .env                    # 秘密の環境変数（Git に上げない）
├── .env.example            # 環境変数のテンプレート（Git に上げる）
├── app.json                # Expo の設定
├── package.json            # 使うライブラリの一覧
└── tsconfig.json           # TypeScript の設定
```

**新しい画面を追加するときは `app/` の中にファイルを作る。**  
例：`app/quest.tsx` → アプリ内で `/quest` という URL でアクセスできる。

---

## 5. よくあるトラブル

### `npm install` でエラーが出る

```bash
npm install --legacy-peer-deps
```

`--legacy-peer-deps` をつけて実行する。

---

### Expo Go で QR コードを読んでも開かない

1. スマホとPCが同じ Wi-Fi に繋がっているか確認
2. ターミナルで `r` を押してリロード
3. それでもダメなら `npm start --tunnel` で試す

---

### `git push` で rejected（拒否）される

```
error: failed to push some refs
```

main に直接 Push しようとしている可能性がある。ブランチを切ったか確認：

```bash
git branch   # * の横にブランチ名があればOK
```

---

### 型エラーが出る

`tsconfig.json` の `"strict": false` になっているので、大きな型エラーは出にくい設定。  
それでもエラーが出るときはエラーメッセージをよく読んで、型を合わせる。

---

### CodeRabbit がレビューしてくれない

PR のコメント欄に以下を書くと手動でレビューをリクエストできる：

```
@coderabbitai review
```
