# Copilot Instructions

このリポジトリの開発ルールは **[AGENTS.md](../AGENTS.md)** に集約されています。作業前に必ず読んでください。

要点（詳細は AGENTS.md 参照）:

- Issue作成 → ブランチ作成 → コミット → PR → CI確認 → CodeRabbitレビュー確認 → マージ、の順で進める。
- `main` への直接pushは禁止。ブランチ名は `{feature|fix|chore}/#{Issue番号}-{内容}`。
- コミットメッセージは `{feat|fix|chore|docs|style|refactor}: {内容}`。
- PR前に `npx tsc --noEmit` と `npm test` をローカルで通す。
- コメント・ドキュメントは日本語。
