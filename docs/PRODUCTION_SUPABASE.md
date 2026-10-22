# テスター配布用の本番 Supabase を用意する

テスターに配るアプリは、開発用とは別の Supabase プロジェクト（本番）につなぐ（[Issue #465](https://github.com/1R0U/my-home-bank/issues/465)）。
テスターが使い始めてから接続先を変えると、それまでの家族・ゴル・履歴が置き去りになるため、**最初の配布より前に済ませる。**

作業はすべて、Supabase プロジェクトの権限がある人が行う。
**管理画面（Table Editor）からテーブルを直接変更しない。** 構造はマイグレーションだけで作る（AGENTS.md の「DBの構造変更」）。

## 1. プロジェクトを作る

1. [Supabase ダッシュボード](https://supabase.com/dashboard) で **New project** を押す
2. 名前は開発用と見分けがつくもの（例: `ouchi-guild-production`）。リージョンは **Northeast Asia (Tokyo)**
3. データベースのパスワードは、パスワード管理ツールに保存しておく（`db push` で使う）
4. できたら、Project Settings → General の **Reference ID**（`abcdefghijklmnop` のような英字）を控える。以下 `<ref>` と書く

## 2. マイグレーションを全部流す

新しい空のプロジェクトには、`supabase/migrations/` の SQL をファイル名の順にすべて流す。
**Supabase CLI の `db push` を使う。** 1ファイル1トランザクションで順に流し、適用の履歴（`supabase_migrations.schema_migrations`）も残るので、
SQL Editor に1本ずつ貼るより取りこぼしがない。

```bash
git checkout main && git pull origin main
npx supabase@latest login
npx supabase@latest link --project-ref <ref>   # データベースのパスワードを聞かれる
npx supabase@latest db push --dry-run          # 流すファイルの一覧が出る（まだ何も変わらない）
npx supabase@latest db push                    # 実際に流す
```

- 途中でエラーが出たら、そこで止まる（それより前のファイルは適用済みとして履歴に残る）。直してから、もう一度 `db push` すると続きから流れる
- `pg_cron` はマイグレーションが有効にする。流したあと、定期実行が入っていることを SQL Editor で確かめる

  ```sql
  select jobname, schedule from cron.job order by jobname;
  -- automatic-savings-hourly / scheduled-notifications-hourly が出ればよい
  ```

## 3. 反映を確かめる

SQL Editor で [`tests/sql/verify_remote_schema.sql`](../tests/sql/verify_remote_schema.sql) を実行し、**全行が `OK`** になることを確かめる。
特に `認証設定: PostgRESTの子供セッション検査`（`pgrst.db_pre_request=public.check_child_session`）と、
`ストレージ: store-item-images（バケット）` の行を見る（どちらもマイグレーションが作る）。

## 4. Edge Function をデプロイする

```bash
npx supabase@latest functions deploy child-code-login
npx supabase@latest functions deploy create-child-account
```

`child-code-login` は、ログイン前の子供が呼ぶため JWT を検証しない（`supabase/config.toml` の `verify_jwt = false`）。
デプロイ後、ダッシュボードの Edge Functions に2つ並び、`child-code-login` の「Verify JWT」がオフになっていることを確かめる。
`SUPABASE_URL` などは Supabase が自動で渡すので、シークレットの登録は要らない（[`docs/CHILD_LOGIN.md`](CHILD_LOGIN.md)）。

## 5. ログインの設定（Authentication）

1. **Sign In / Providers → Email**: 有効のまま。メール確認（Confirm email）は開発用プロジェクトと同じ設定にそろえる
2. **Sign In / Providers → Google**: [DEVELOPMENT.md の 7. Googleログインの設定](DEVELOPMENT.md#7-googleログインの設定) と同じ手順で設定する。
   Google Cloud Console の「承認済みのリダイレクト URI」には、**本番プロジェクトの**コールバック URL
   （`https://<ref>.supabase.co/auth/v1/callback`）を追加する（開発用の URL は残したままでよい）
3. **URL Configuration → Redirect URLs** に、アプリの独自スキームを追加する

   ```
   my-home-bank://auth/callback
   ```

   スキームはアプリの識別名（bundle ID / package、[#461](https://github.com/1R0U/my-home-bank/issues/461)）とは別物で、`app.json` の `scheme` で決まる

## 6. アプリの接続先を本番に向ける

Project Settings → API の **Project URL** と **anon public** キーを、EAS の `production` 環境に登録する（手順は [DISTRIBUTION.md の「2. Supabase の接続先を EAS に登録する」](DISTRIBUTION.md#2-supabase-の接続先を-eas-に登録する)）。

- 手元の `.env` は開発用のままにする（本番に向けると、開発中の操作が本番のデータに入る）
- **service_role キーはアプリにも EAS にも入れない**（Edge Function には Supabase が自動で渡す）

## 7. 記録する

[Issue #465](https://github.com/1R0U/my-home-bank/issues/465) に、次を書き残す。

- プロジェクト名と `<ref>`（キーやパスワードは書かない）
- `db push` で流した最後のマイグレーションのファイル名
- `verify_remote_schema.sql` が全行 OK だったこと
- Edge Function 2つのデプロイと、Auth の設定が済んだこと

## これ以降のマイグレーション

本番プロジェクトができたあとにマージされたマイグレーションは、`npx supabase@latest db push` で続きを流す（`link` 済みなら、それだけでよい）。
SQL Editor で流した場合は CLI の履歴に残らないため、どちらで流したかを Issue に書き、次に `db push` するときに二重に流さないよう注意する。
