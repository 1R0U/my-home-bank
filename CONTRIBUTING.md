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
