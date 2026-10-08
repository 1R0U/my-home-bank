# 開発フロー

## 1. Issue を立てる

作業前に必ず Issue を作成して、何をやるか宣言する。
テンプレートは3種類：

| テンプレート | 用途 |
| --- | --- |
| Feature | 新機能・画面・ロジックの追加 |
| Fix | バグ修正 |
| Chore | 設定変更・依存更新・リファクタなど |

## 2. ブランチを切る

Issue 番号を含む名前でブランチを作る。

```
{type}/#{issue番号}-{内容（kebab-case）}
```

| type | 使いどき |
| --- | --- |
| `feature` | 新機能 |
| `fix` | バグ修正 |
| `chore` | 設定・雑務 |

**例**

```
feature/#5-add-login-screen
fix/#12-quest-approval-crash
chore/#3-setup-eslint
```

## 3. PR を出して main にマージ

- main への直接 push は禁止（ブランチ保護）
- PR タイトルは Issue のタイトルに合わせる
- マージ後はブランチを削除する
- DB変更は `npm run migration:new -- 説明のsnake_case` で作成し、`npm run migration:check` で確認する。日時番号の手入力・コピーは禁止。
- CIでは追加SQLを最新mainだけと照合し、番号の重複と、mainの最大番号以下の追加を拒否する。同じパス・同じ内容でmainへ取り込み済みのSQLは対象外。マージ直前に最新mainを取り込み、**Migration Check / Type Check / Test / DB Migration** の成功を確認する。mainの更新後はCIを再実行する。確認手順と重複・適用順違反時の対応は [開発ガイド](docs/DEVELOPMENT.md#マイグレーションを作成する) を参照。
