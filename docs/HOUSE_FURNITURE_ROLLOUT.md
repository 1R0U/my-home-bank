# ソファ・植木をしまうマイグレーションの適用記録（Issue #514）

2026-10-25（日本時間）、ユーザー指定のSupabaseプロジェクトへ、[PR #513](https://github.com/1R0U/my-home-bank/pull/513)のマイグレーション2本を適用した。
SQLの適用とCLI履歴の登録は完了したが、全スキーマの検証と実機確認は残っているため、[Issue #514](https://github.com/1R0U/my-home-bank/issues/514)は閉じない。

## 適用先とSQLの出典

- Project Reference ID: `zrnmomywoavdrolncdfu`
- プロジェクト名: `my-home-bank`
- CLI一覧に別に存在する `ouchi-guild-production` は今回の適用先ではなく、変更していない。
- SQLの出典: PR #513のコミット `5ae9deaa221d41540fb47a04f907fa523ae3a95b`

次の原本2本をこの順番で適用した。Git blob SHAが出典と一致することを確認し、SQLの内容は変更していない。

| マイグレーション | Git blob SHA |
| --- | --- |
| `20261024162418_store_house_furniture.sql` | `bac0743691a86c5983127ef23cf82c1c8ae5569d` |
| `20261024162420_seed_house_furniture_store_items.sql` | `1cdbd56dade233890744d2a3911a95fca19be5d6` |

マイグレーション本体・型・アプリの変更はPR #513で管理する。この記録では適用済みSQLの複製や変更を追加しない。

## 実行方法と履歴登録

Supabase CLI 2.122.0の `db query --linked --project-ref zrnmomywoavdrolncdfu --file ...` を使い、Management API経由でSQLを実行した。
2本を順番どおりに1つの `BEGIN` / `COMMIT` で囲み、ロック待ち上限10秒・文の実行上限60秒を設定して成功した。
これは `db push` やSQL Editorによる適用ではない。

SQLの適用成功後、次のコマンドで今回の2本だけをCLIの適用履歴へ登録した。他のマイグレーション履歴は変更していない。

```bash
supabase migration repair --linked --project-ref zrnmomywoavdrolncdfu \
  --workdir <対象SQLの原本を配置した作業フォルダ> \
  --status applied 20261024162418 20261024162420
```

DBの履歴表でも、2本の番号と名前が登録されたことを確認した。これらのSQLは適用済みなので再実行しない。

## 適用後に確認できたこと

| 確認対象 | 結果 |
| --- | --- |
| `house_furniture_items` | クローゼット・ソファ・植木の3件。しまったときに入る装飾の対応も一致 |
| `house_furniture_layouts.stored` | 列が存在し、authenticatedによる直接INSERT・UPDATEは禁止 |
| 家具IDの制約 | 外部キーが検証済み。旧許可リストのCHECK制約は削除済み |
| しまう関数・RLS・子供セッションのポリシー | スキーマ検証でOK。関数の実行はauthenticatedに許可、anonには不許可 |
| 既存の家庭への陳列 | 全10家庭にソファ・おおきなうえきがそれぞれ1件、計20件追加。すべて有効な自動陳列商品 |
| 通常商品 | 7件。適用前後で件数と全行のチェックサムが一致 |
| 所有 | 285件。適用前後で件数と全行のチェックサムが一致 |
| 既存の家具配置 | 3件を保持。しまった状態の行は0件 |

mainのSQLと今回の2本をそろえた専用フォルダから `db push --dry-run --include-all --skip-vault` を実行し、今回の2本が再適用候補に出ないことを確認した。
一覧には今回以外の30本が残った。CLI履歴が未登録という意味であり、30本すべてのSQLが未適用という意味ではない。
今回以外の実適用や、過去の履歴の一括修正はしていない。

## 残っている確認

PR #513の同じコミットにある `tests/sql/verify_remote_schema.sql` を使った結果は、適用前が372件OK・14件NG、適用後が378件OK・8件NGだった。
今回対象の6項目はすべて解消した。残る8件は、適用前から未反映だった [Issue #501](https://github.com/1R0U/my-home-bank/issues/501)の壁紙・床板に関する次の項目。

- `house_interior_settings` のテーブル・RLS
- `private.check_house_interior_ownership` と同名のトリガー
- `house_interior_settings_active_child_session`
- `house_interior_settings_insert_self` / `select_self` / `update_self`

#501のマイグレーションは今回適用していない。全項目OKは、#501の反映後に改めて確認する。

次の実機確認も未実施。

- ソファ・植木を動かし、アプリを開き直しても位置が保持されること。
- しまうと家の中から消え、持ち物に入り、「かざる」から再配置できること。
- ストアの「かぐ」にソファ・おおきなうえきが表示されること。

GitHub側の作業記録: [Issue #514への適用結果コメント](https://github.com/1R0U/my-home-bank/issues/514#issuecomment-6388132983)。
