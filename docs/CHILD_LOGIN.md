# 子供のコードログイン（Issue #264）

親の設定画面「家族の子供」で子供を追加し、その子供のログインコードを発行する。
子供専用の端末で、ログイン画面の「こどもはこちら」から8文字のコードを入力する。
コードは10分間・1回だけ有効。再発行は30秒間隔で、前のコードは無効になる。
メール・パスワードを子供に用意させず、入り直す場合も既存の同じアカウントを使う。

## 本番への反映

1. `20261010065947_support_child_login_codes.sql` を1トランザクションで適用する。
   適用済みのSQLは再実行しない。SQL Editorを使った場合は、実DBを確認したうえで
   CLIのmigration履歴との整合も確認する。
2. `tests/sql/verify_remote_schema.sql` を実行し、全行がOKになることを確認する。
   特にPostgRESTの `pgrst.db_pre_request=public.check_child_session` を確認する。
3. `npx supabase functions deploy child-code-login` を実行する。
   `supabase/config.toml` でこの関数だけ `verify_jwt = false` としている。
   ログイン前の子供が呼ぶための設定であり、コードの検証・試行制限・消費はDBで行う。
   既存の `create-child-account` もデプロイ済みであることを確認する。
4. DBとEdge Functionの反映を確認してからアプリを切り替える。

`SUPABASE_URL` / `SUPABASE_ANON_KEY` / `SUPABASE_SERVICE_ROLE_KEY` はEdge Functionへ
Supabaseが自動で渡す。新しいアプリ用の環境変数は不要で、管理者キーをアプリへ入れない。

既存の別用途のPostgRESTフックがある場合、マイグレーションは上書きせず停止する。
担当者が `check_child_session` を既存フックへ統合する方法を確認してから反映する。
ロール全体と接続先DB単位の両方の設定を検査し、空のDB単位設定でフックが無効になることも防ぐ。

## セキュリティ上の境界

- 発行RPCはログイン中の本人をDBで確認し、同じ家庭の親だけに許可する。
  子供・別家庭・親アカウントを対象とする発行は拒否する。
- コードは暗号学的な乱数40ビットから、見分けやすい英数字8文字にする。
  DBにはSHA-256を保存する。発行後の再取得APIや永続保存は用意しない。
- コードの消費と子供ごとのログイン予約はDBで直列化する。
  使用済み・期限切れ・不一致を区別して返さず、送信元ごと毎分10回と全体毎分3,000回で制限する。
  送信元上限で拒否した要求は全体枠を消費せず、同一送信元の連打で他の家庭を止めない。
- Edge Functionだけが管理者RPCを呼び、内部用Magic Linkを作ってその場で検証する。
  メールは送信しない。新しいセッションの利用者IDが予約した子供と一致することを確認する。
- 新しいログインではSupabase Authの `signOut(jwt, 'others')` で他の端末の更新トークンを失効する。
  [Supabaseの仕様](https://supabase.com/docs/guides/auth/signout)では古いアクセストークンは期限まで残るため、
  新しい `session_id` をDBに登録し、PostgRESTの入口とrestrictive RLSの両方でも拒否する。
  フックだけではStorageやRealtimeを守れないため、RLSの検査も必要。
- 今後アプリが読み書きできるテーブルを追加するときは、既存の許可ポリシーに加え
  `current_child_session_is_valid()` を使うrestrictiveポリシーとスキーマ検証も追加する。
- DBを復元可能な状態で仮切替してから他端末のAuthを失効する。仮切替失敗時はAuthを失効せず、
  Auth失効が失敗した場合はDBの旧セッションを復元して新しいセッションを破棄する。
  仮切替中は旧端末も利用できる。[Authのセッション管理](https://supabase.com/docs/guides/auth/sessions)に従い、
  旧 `session_id` が `auth.sessions` に残っている場合だけ許可し、Auth失効後は直ちに拒否する。
  Auth失効成功後の予約の後始末が失敗しても、新端末のログインは成功させる。
  通信断でAuth側の処理が実行されたか分からない場合、完全な復元は保証できないため新しいコードで入り直す。
  失敗したコードは使い直させない。
  通信切断などで後始末できなかった予約は2分で失効する。通常の外部通信は45秒で打ち切り、
  復元・破棄は別の通信期限で各10秒まで試みる。
- 管理者RPCはアプリ・匿名利用者から呼べない。内部メール・コード・トークンをログへ出さない。
  成功応答は `Cache-Control: no-store` とし、アプリはセッションを既存のAuthストレージへ保存する。
  内部メールは画面に表示しない。ただしAuthのJWT・利用者情報には含まれるため、秘密情報としては扱わない。

## 実機確認

1. 親が子供を追加してコードを発行し、子供端末Aからログインできること。
2. 同じコードの再使用、期限切れ、再発行前のコードが拒否されること。
3. 子供の残高や見た目を確認し、親が新しいコードを出して端末Bで入り直す。
   同じID・残高・見た目を保持し、端末AのAPI操作とトークン更新が拒否されること。
   端末Aは復帰時または前面で30秒以内の確認でログイン画面へ戻る。
4. アプリ再起動で有効なセッションを復元できること。通信断だけではログアウトしないこと。
5. 親は同じ家庭の子供の取引・口座だけを参照でき、別の親や別家庭のものを読めないこと。

ローカル・CIはハンドラー、クライアント、画面、SQLを検証する。
CIのDBは素のPostgreSQLなので、実際のSupabase AuthのMagic Link交換・旧端末の
更新トークン失効・PostgRESTフックの実行には上記の実機確認が必要。
`tests/sql/child_login_assertions.sql` はテストデータを書き込むため、本番では実行しない。

## 送信元の信頼条件

送信元キーはSupabaseホスト環境のCloudflare入口が設定する `CF-Connecting-IP` とする。
[Cloudflareの仕様](https://developers.cloudflare.com/fundamentals/reference/http-headers/)では、
`X-Forwarded-For` が既にある場合は追記されるため、先頭の利用者指定値を信用できない。
`CF-Connecting-IP` はCloudflareへ接続した送信元を示す単一の値で、異なるゾーンのWorker経由でも
利用者指定のIPにはならない。同一ゾーンのWorkerはこの値を変更できるため、独自Workerで中継しない。
[Supabase公式のIP制限例](https://supabase.com/docs/guides/database/debugging-performance#production-use-with-pre-request-protection)
も `cf-connecting-ip` を使っている。Edgeへの伝達・直接アクセスの遮断は本番経路で確認する。

`X-Forwarded-For` の上書きは保証として扱わず、先頭・末尾とも送信元キーに使わない。
CFヘッダーの欠落・不正値は共通 `unknown` バケットへまとめる。ローカル・自己ホスト・独自プロキシでは、
信用する入口がこのヘッダーを上書きし、入口を迂回できない構成にしてから利用する。
本番反映前に同じ送信元から異なる偽のXFF・CFヘッダー付きで要求し、入口がCF値を上書きすることと、
11回目以降が429になっても別送信元の正常なコードでログインできることを確認する。
この実環境の確認はまだ行っていない。IPやコードをアプリのログへ出して確認しない。
