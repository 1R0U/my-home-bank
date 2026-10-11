# 種類別の色保存を本番へ反映する（Issue #383）

PR #382のアプリは、色を `character_palettes` へ利用者とキャラクターの種類ごとに保存する。
本番DBへの適用と確認はIssue #383で行う。種類の選択と旧色列は `character_appearances` に残す。

## 適用前の確認

- 対象プロジェクトと稼働DBの適用履歴を確認する。
- `character_palettes` と同名の既存テーブル・ポリシーがある場合は、構造と適用履歴を照合する。
  適用済み・適用状況不明のSQLを改名したり、作成SQLを重ねて実行したりしない。
- 旧アプリによる色の編集を止めてから切り替える。補完SQLは既存の新形式カエル行を上書きしないため、
  一度移した利用者が旧アプリで色を選び直しても、再実行ではその変更を取り込まない。

## SQLの実行順

Supabase SQL Editorなどで、次のファイルを順番に実行する。各ファイルを `BEGIN;` と `COMMIT;` で
囲み、1ファイルを1トランザクションとして適用する。失敗したら `ROLLBACK;` し、原因を確認する。

1. `supabase/migrations/20261008094946_create_character_palettes.sql`
   - テーブル、種類・色形式の制約、本人用のRLSと権限を追加する。
   - 初回だけ実行する。ポリシー作成を含むため、再適用はできない。
2. `supabase/migrations/20261008094954_backfill_frog_character_palettes.sql`
   - 旧形式で色がある行をカエル用としてコピーする。全枠未設定の行は既定色のままにする。
   - 現在の種類がねこなどでも、旧色の移行先はカエル。
   - 既存の新形式カエル行は上書きしない。何度実行してもよい。

PR #382のマージ後にも2を再実行し、未移行の利用者を補完する。

SQL Editorからの実行は、Supabase CLIのマイグレーション履歴に自動記録されない。
各ファイルの適用結果をIssue #383に残し、CLIも使う場合は実際のDBと履歴を照合して整合を取る。
履歴だけが不足している場合も、適用済みであることを確認してから修復する
（[Supabase公式の説明](https://supabase.com/docs/guides/deployment/database-migrations)）。

## 反映の確認

PR #382の `tests/sql/verify_remote_schema.sql` を実行し、全行が `OK` であることを確認する。
特に `character_palettes` のテーブル・RLS・本人用SELECT/INSERT/UPDATEポリシーを確認する。

次の読み取りSQLは、旧色がある利用者について、カエル用の行が不足していないことを確認する。
`missing_frog_rows` が0であれば移行対象を取りこぼしていない。移行後に利用者が選び直した色は、
旧列との一致を求めない。

```sql
select count(*) as missing_frog_rows
from public.character_appearances a
where (a.accent_color is not null or a.hair_color is not null or a.skin_color is not null)
  and not exists (
    select 1 from public.character_palettes p
    where p.user_id = a.user_id and p.character_type = 'frog'
  );
```

実機では更衣室でカエルとねこの色を別々に保存し、種類を戻すとそれぞれの保存色へ戻ること、
「もとのいろ」でその種類のパーツ本来の色へ戻ることを確認する。

本番DBにテストデータを書き込む `tests/sql/assertions.sql` は実行しない。
これはCIの一時DBで、移行・再実行・制約・本人だけのアクセスを検証するためのファイルである。
