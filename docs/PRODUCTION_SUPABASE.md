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
- `pg_cron` はマイグレーションが有効にする。ただし `pg_cron` を使えない環境では、マイグレーションは注意（NOTICE）を出すだけで**成功してしまい、定期実行（自動積立・時刻のお知らせ）が入らない**。流したあと、SQL Editor で次の2つを順に確かめる

  ```sql
  -- (1) pg_cron が有効か。true でなければ NG
  select to_regclass('cron.job') is not null as pg_cron_enabled;
  ```

  ```sql
  -- (2) 定期実行が2つとも入っているか。1行でも出たら NG（出た名前が足りない）
  --     (1) が false のときは cron.job が無くてエラーになるので、流さない
  select name as missing_job
  from unnest(array['automatic-savings-hourly', 'scheduled-notifications-hourly']) as name
  where not exists (select 1 from cron.job where cron.job.jobname = name);
  ```

  **NG のときは、6.（アプリの接続先を本番に向ける）へ進まず、配布を止める。** 次のとおり直してから、(1)(2) をもう一度確かめる。
  1. Database → Extensions で `pg_cron` を有効にする（有効にできないプランなら、`pg_cron` を使えるプロジェクトであることを確かめる）
  2. 次の2つのファイルのうち、**末尾の `do $schedule$ … $schedule$;` のブロックだけ**を SQL Editor で流す。ファイル全体を流し直す必要はない（ほかの部分は `db push` で適用済み）。同じ名前の定期実行は上書きされるので、2回流しても二重にはならない
     - `supabase/migrations/20260928000100_schedule_automatic_savings.sql`（`automatic-savings-hourly`）
     - `supabase/migrations/20261010074018_schedule_time_based_notifications.sql`（`scheduled-notifications-hourly`）
  3. 直したことを [Issue #465](https://github.com/1R0U/my-home-bank/issues/465) に書き残す

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

1. **Sign In / Providers → Email**: 有効のまま。メール確認（Confirm email）は、**開発用にそろえるのではなく、次のどちらかに決めて [Issue #465](https://github.com/1R0U/my-home-bank/issues/465) に書き残す**。
   何もしないと、テスターはメールで登録できない。Supabase 標準のメール送信は Supabase 組織のメンバーのアドレスにしか届かず、送れる数も1時間に数通しかないため、確認メールがテスターに届かない
   - **A. テスト配布の間はメール確認をオフにする（手軽）**: Confirm email をオフにする。登録したらすぐログインできる。打てば誰でも登録できるので、配布先を限ったテストの間だけにする
   - **B. メール確認をオンのまま使う**: Authentication → Emails → **SMTP Settings** で自前の送信元（SendGrid・Resend など）を設定する。
     あわせて URL Configuration の **Site URL** を見直す。`lib/auth.ts` の `signUpWithEmail()` は `emailRedirectTo` を渡していないため、確認リンクの戻り先は Site URL（初期値 `http://localhost:3000`）になり、確認自体は済んでもテスターにはエラー画面が出る
2. **Sign In / Providers → Google**: [DEVELOPMENT.md の 7. Googleログインの設定](DEVELOPMENT.md#7-googleログインの設定) と同じ手順で設定する。
   Google Cloud Console の「承認済みのリダイレクト URI」には、**本番プロジェクトの**コールバック URL
   （`https://<ref>.supabase.co/auth/v1/callback`）を追加する（開発用の URL は残したままでよい）

   **OAuth 同意画面の公開ステータスも、次のどちらかに決めて [Issue #465](https://github.com/1R0U/my-home-bank/issues/465) に書き残す。**
   DEVELOPMENT.md の手順（外部・テストユーザー）のまま「テスト中」にしておくと、テストユーザーに登録した Google アカウントしかログインできず（上限100人）、
   登録していないテスターには `403 access_denied` が出る
   - **A. テスターの Google アカウントを、同意画面のテストユーザーに登録する**: 配布先が決まっている間はこれで足りる。テスターが増えるたびに足す
   - **B. 同意画面を「本番環境」に公開する**: 誰でもログインできる。Google の確認が求められることがあるので、時間に余裕を持って行う
3. **URL Configuration → Redirect URLs** に、アプリの独自スキームを追加する

   ```
   my-home-bank://auth/callback
   ```

   スキームはアプリの識別名（bundle ID / package、[#461](https://github.com/1R0U/my-home-bank/issues/461)）とは別物で、`app.json` の `scheme` で決まる

## 6. アプリの接続先を本番に向ける

Project Settings の **Project URL** と、**旧方式（Legacy API Keys）の `anon` `public` キー**（`eyJ` で始まる長い文字列）を、
`EXPO_PUBLIC_SUPABASE_URL` / `EXPO_PUBLIC_SUPABASE_ANON_KEY` として EAS の `production` 環境に登録する（手順は [DISTRIBUTION.md の「2. Supabase の接続先を EAS に登録する」](DISTRIBUTION.md#2-supabase-の接続先を-eas-に登録する)）。

- 新しく作ったプロジェクトでは、API Keys の画面で新方式の **Publishable key**（`sb_publishable_...`）が先に出ていることがある。**ここでは旧方式（Legacy API Keys）のタブの方を使う。**
  Edge Function（`child-code-login`・`create-child-account`）は、Supabase が自動で渡す旧方式のキー（`SUPABASE_ANON_KEY` / `SUPABASE_SERVICE_ROLE_KEY`）で動いており、開発用プロジェクトも旧方式なので、そろえておく
- 旧方式のキーが無効になっている・タブが見当たらないときは、新方式へ移す作業（アプリと Edge Function の両方）が要るので、**ここで止めて [Issue #465](https://github.com/1R0U/my-home-bank/issues/465) で相談する**。旧方式には将来廃止の予定があるため、移す作業は別の Issue で扱う
- 管理画面の表示は変わることがあるので、プロジェクトを作るときに画面と照らし合わせ、違っていたらこの手順書を直す

- 手元の `.env` は開発用のままにする（本番に向けると、開発中の操作が本番のデータに入る）
- **service_role キーはアプリにも EAS にも入れない**（Edge Function には Supabase が自動で渡す）

## 7. 記録する

[Issue #465](https://github.com/1R0U/my-home-bank/issues/465) に、次を書き残す。

- プロジェクト名と `<ref>`（キーやパスワードは書かない）
- `db push` で流した最後のマイグレーションのファイル名
- `verify_remote_schema.sql` が全行 OK だったこと
- Edge Function 2つのデプロイと、Auth の設定が済んだこと
- メール確認と Google の同意画面を、それぞれ A・B のどちらにしたか

## これ以降のマイグレーション

本番プロジェクトができたあとにマージされたマイグレーションは、`npx supabase@latest db push` で続きを流す（`link` 済みなら、それだけでよい）。
SQL Editor で流した場合は CLI の履歴に残らず、次の `db push` で同じファイルがもう一度流れてしまう。**流した直後に、CLI の履歴へ登録する。**

```bash
npx supabase@latest migration repair --status applied <番号>   # 例: 20261023113848（ファイル名の先頭の数字）
```

登録したら `npx supabase@latest db push --dry-run` で、そのファイルが一覧に出ないことを確かめる。どちらで流したかは Issue にも書き残す。
