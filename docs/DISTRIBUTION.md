# テスターへの配布と更新の配信

テスター（家族）へアプリを配る手順と、配った後にコード部分の修正を入れ直しなしで届ける手順をまとめる（[Issue #462](https://github.com/1R0U/my-home-bank/issues/462)・[#463](https://github.com/1R0U/my-home-bank/issues/463)・[#464](https://github.com/1R0U/my-home-bank/issues/464)）。

開発用のビルド（Development Build）は [DEVELOPMENT.md](DEVELOPMENT.md#5-development-build開発ビルド) を参照。

---

## 全体の流れ

```
最初の1回: 準備（EASプロジェクトの紐付け・環境変数・トークン）
   ↓
ビルドして配る（ネイティブ側が変わったときだけ。eas build）
   ↓
修正を配信する（JS・画像だけの変更。Actions のボタン → internal で確認 → production）
```

| 変わったもの | 届け方 |
| --- | --- |
| 画面・ロジック・画像など（JS側だけ） | 更新の配信（入れ直し不要） |
| ライブラリの追加・`app.json` のプラグインや権限など（土台側） | ビルドし直して配り直す |

どちらに当たるかは自分で判断しなくてよい。`runtimeVersion` を `fingerprint` にしているため、土台が変わった版には古い版向けの更新が届かない（届けると落ちるため）。土台を変えたのに更新だけ配信しても、テスターの端末には何も起きない。そのときはビルドし直す。

---

## ビルドプロファイルと配信先

`eas.json` のプロファイルごとに、配り先と配信先（channel）を決めている。配信先はビルド時にアプリへ焼き込まれ、後から変えられない。

| プロファイル | 配り先 | 作り | 配信先（channel） |
| --- | --- | --- | --- |
| `production` | iOSの親（TestFlight） | App Store Connect へ提出する通常ビルド | `production` |
| `preview` | Android全員・iOSの子供 | `distribution: internal`。Android はリンクから直接インストール（APK）、iOS は登録した端末だけに入る | `production` |
| `preview-internal` | 開発者の端末 | `preview` と同じ作り | `internal` |
| `development` / `development-simulator` | 開発者 | 開発ビルド（更新を自動では受け取らない） | なし |

- **TestFlight は利用規約で13歳未満が使えない。** 12歳以下の子の iPhone は `preview`（端末を登録して直接インストール）で配る。
- ビルド番号は EAS 側で自動的に上がる（`cli.appVersionSource: remote` と `autoIncrement`）。`app.json` の `version`（表示上のバージョン）は手で上げる。
- 更新はアプリを開いたときに裏で取得され、**次に開いたときに反映される**（expo-updates の既定の動作のまま）。

---

## 最初の1回だけやること

### 1. EASプロジェクトに紐付け、更新の配信を有効にする

```bash
npx eas-cli@latest login
npx eas-cli@latest init              # app.json に extra.eas.projectId が入る
npx eas-cli@latest update:configure   # app.json に updates.url が入る
```

`app.json` の変更（`extra.eas.projectId` と `updates.url`）はコミットする。これがないとビルドに更新の取得先が入らず、以降の修正は入れ直してもらうしかなくなる。**最初に配るビルドより前に済ませる。**

> `update:configure` は、`channel` のない `eas.json` のプロファイル（`development` など）にプロファイル名と同じ channel を書き足すことがある。開発ビルドは更新を自動では受け取らないので害はないが、差分を見てからコミットする。`runtimeVersion` が `fingerprint` 以外に書き換わっていたら戻す。

### 2. Supabase の接続先を EAS に登録する

> 本番の Supabase プロジェクトがまだ無ければ、先に [PRODUCTION_SUPABASE.md](PRODUCTION_SUPABASE.md) の手順で用意する（[#465](https://github.com/1R0U/my-home-bank/issues/465)）。

`.env` はコミットしないため、クラウドのビルド・更新の配信では読めない。EAS の環境変数（`production` 環境）に登録する。ビルド・更新の配信はどちらも `production` 環境を読む。

```bash
npx eas-cli@latest env:set --environment production --name EXPO_PUBLIC_SUPABASE_URL --value "https://xxxx.supabase.co" --visibility plaintext
npx eas-cli@latest env:set --environment production --name EXPO_PUBLIC_SUPABASE_ANON_KEY --value "（anon key）" --visibility sensitive
```

> **忘れるとビルドは通るが、ログインできないアプリになる。** `.env.example` に変数を足したら、ここにも登録する。

### 3. GitHub に `EXPO_TOKEN` を登録する

1. [expo.dev のアクセストークン画面](https://expo.dev/settings/access-tokens) でトークンを作る
2. GitHub のリポジトリの Settings → Secrets and variables → Actions に `EXPO_TOKEN` として登録する

### 4. App Store Connect のアプリIDを設定する（iOS の親向け）

App Store Connect にアプリを作り、アプリID（数字）を `eas.json` の `submit.production.ios.ascAppId` に書く。

```json
"submit": {
  "production": {
    "ios": { "ascAppId": "1234567890" }
  }
}
```

---

## ビルドして配る

```bash
# iOSの親（TestFlight）
npx eas-cli@latest build --profile production --platform ios
npx eas-cli@latest submit --profile production --platform ios --latest

# Android全員・iOSの子供
npx eas-cli@latest device:create      # iOS の子供の端末を登録する（初回・端末を増やしたとき）
npx eas-cli@latest build --profile preview --platform all

# 開発者の端末（internal の更新を受け取る版）
npx eas-cli@latest build --profile preview-internal --platform all
```

`preview` のビルドが終わると、インストール用のリンクが出る。テスターに送る。

---

## 修正を配信する（入れ直し不要）

main へのマージでは配信しない。GitHub Actions のボタンから手動で出す。

1. GitHub の Actions → 「更新の配信（EAS Update）」→ Run workflow
2. 配信先に `internal` を選んで実行し、開発者の端末（`preview-internal` 版）で確認する
   - アプリを開く → 一度閉じてもう一度開くと反映される
3. 問題なければ、同じコミットのまま配信先 `production` で実行し、テスター全員へ出す

配信元のブランチは Run workflow の「Use workflow from」で選ぶ（通常は `main`）。

---

## まずかった場合の戻し方

配信した更新に問題があったら、その配信先を1つ前の更新（または、ビルドに入っている版）へ戻す。

```bash
npx eas-cli@latest update:rollback
```

対話形式で、戻す配信先（channel）と戻し方を選ぶ。

- **1つ前の更新に戻す**: 直前の更新に問題があったとき
- **ビルドに入っている版に戻す**（embedded）: 配信した更新をすべて取り消したいとき

戻した結果もアプリを開いたときに取得され、次に開いたときに反映される。直した版は、通常どおり `internal` で確認してから `production` に出し直す。

配信の履歴は `npx eas-cli@latest update:list` か expo.dev のプロジェクト画面で確認できる。
