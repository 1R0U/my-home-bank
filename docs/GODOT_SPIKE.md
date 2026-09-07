# react-native-godot 技術検証記録（Godotスパイク）

関連Issue: [#139 react-native-godot 導入可否の技術検証（スパイク）](https://github.com/1R0U/my-home-bank/issues/139)、[#138 EAS設定（eas.json）と開発ビルド手順の整備](https://github.com/1R0U/my-home-bank/issues/138)

本ドキュメントは `docs/RPG_HUB_ARCHITECTURE.md` で採用している React Three Fiber + expo-gl 方式の技術的な天井（ポストプロセス非対応、JSスレッド競合、シーンエディタ不在、着せ替え/庭装飾に必要なゲームエンジン機能の不在）を踏まえ、`@borndotcom/react-native-godot` の導入可否をゲート制で検証した記録である。

このリポジトリの前提バージョン: Expo `~57.0.19` / React Native `0.86.3` / React `19.2.3` / Node `>=22.13.0`（`package.json` 時点）。

---

## Gate 0：事前調査（一次情報のみ、コード変更なし）

調査日: 2026-09-07。すべて一次情報（npm registry / GitHub API / GitHub上のREADME・Issue本文）で確認し、確認できなかった事項は「未確認」と明記する。

### 1. 最新バージョン・ライセンス・最終更新日

**確認できた事実**
- npm上の最新バージョンは `1.0.1`（2025-11-04公開）。`1.0.0` は2025-11-02公開。2バージョンのみが存在する。
- ライセンス: MIT（npm `package.json` の `license` フィールド、および GitHub リポジトリの `LICENSE` ファイルの両方で確認）。
- GitHubリポジトリの最終 push は `2025-11-07T13:56:23Z`。調査時点（2026-09-07）から約10ヶ月更新がない。GitHub Releases は0件（`releases` APIが空配列を返す。バージョン管理はnpmのタグのみで、GitHub Releaseは作成されていない）。
- Star 2,670 / Fork 129 / Open Issues 18（2026-09-07時点）。

出典:
- https://www.npmjs.com/package/@borndotcom/react-native-godot （`npm view @borndotcom/react-native-godot --json` で取得）
- https://github.com/borndotcom/react-native-godot （`gh api repos/borndotcom/react-native-godot`）

### 2. 対応 React Native / Expo バージョン範囲

**確認できた事実**
- READMEおよびnpmの `package.json` に、対応する React Native / Expo のバージョン範囲は明記されていない。
- npmの `peerDependencies` は `"react": "*"`, `"react-native": "*"`, `"react-native-worklets-core": "*"` と無制限指定。
- `devDependencies`（ライブラリ自身の開発・サンプルアプリで使用しているバージョン）は `react-native@^0.81.0` / `react@^19.0.0` 系であり、これは「動作を確認している」という保証ではなく、あくまで開発環境の記録。
- **本リポジトリの RN `0.86.3` に極めて近い RN `0.86.0` で、Androidビルドが失敗する未解決のIssueが存在する**（詳細は項目4・8参照）。

出典:
- https://github.com/borndotcom/react-native-godot/blob/master/README.md
- https://www.npmjs.com/package/@borndotcom/react-native-godot（`package.json` の `devDependencies` / `peerDependencies`）
- https://github.com/borndotcom/react-native-godot/issues/32

**未確認**: 公式にサポート対象と明言されたRN/Expoのバージョン範囲そのもの（そもそも存在しない）。

### 3. Expo用 config plugin の提供有無

**確認できた事実**
- npmパッケージ・READMEのいずれにも Expo config plugin は同梱されていない。
- Expo (managed workflow / config plugin) でのビルドに関する複数の未解決Issueが存在し、いずれもユーザーが独自に `expo-build-properties` の設定や、自作の config plugin（`plugins/withGodot.js` で `MainActivity.kt` と `build.gradle` を書き換えるもの）を書いて回避している。公式に提供された config plugin は確認できなかった。
  - Issue #27「Expo support and example」（未解決、公式サンプルなし）
  - Issue #29「Android Build Fails in Expo Project due to minSdkVersion and Gradle Dependency Errors」（未解決。`expo prebuild --clean` 後も `minSdkVersion` が反映されない、Gradleが `com.migeran.libgodot:godot-debug:...-SNAPSHOT` を解決できない、という2つの問題を報告）
  - Issue #16「Issue running with Expo app」（未解決。同じSNAPSHOT解決エラーと `Worklets` TurboModule未検出エラーの両方を報告。回答はコミュニティによる自作config plugin共有のみで、投稿者本人も「android実装はまだ不明瞭」とコメント）
  - Issue #18「[Expo][iOS] Build fails when using static framework」（クローズ済みだが、`useFrameworks: static` 使用時に `react-native-worklets-core` のヘッダが見つからずビルド失敗。回避策は `forceStaticLinking` の手動指定）

出典:
- https://github.com/borndotcom/react-native-godot/issues/27
- https://github.com/borndotcom/react-native-godot/issues/29
- https://github.com/borndotcom/react-native-godot/issues/16
- https://github.com/borndotcom/react-native-godot/issues/18

**結論**: config plugin は自作が必須。かつ自作例はすべて `MainActivity.kt` や `build.gradle` の直接書き換えを伴う非公式な内容であり、品質・保守性の保証はない。

### 4. react-native-worklets-core と react-native-worklets の共存可否（最重要項目）

**確認できた事実**
- `@borndotcom/react-native-godot` は `react-native-worklets-core`（Margelo製、npm上のバージョン `1.6.2` に固定して `dependencies` に記載、`peerDependencies` は `"*"`）に依存している。これは本リポジトリが `react-native-reanimated@4.5.1` のために導入済みの `react-native-worklets`（Software Mansion製、`0.10.1`）とは**別のnpmパッケージ**であり、READMEの「Threading and JavaScript in React Native」節でも明示的に `react-native-worklets-core` を採用している旨が説明されている。
- Issue #31「Question: Is this project still mantained?」で、コミュニティメンバー（blazejkustra）がメンテナ（kisg, Migeran所属）に対し「Reanimated v4は`react-native-worklets`単体パッケージでworkletsを配布しており、`react-native-vision-camera`など他ライブラリは既にそちらへ移行している。`react-native-godot`も`react-native-worklets-core`から`react-native-worklets`へ移行する予定はあるか」と直接質問しているが、**メンテナはこの質問に対して明確な回答をしていない**（別の質問への返答のみ）。
- 同じスレッドで別ユーザー（someSOAP）が、`react-native-worklets`（swmansion）へ移行したという非公式フォーク `@somesoap/react-native-godot` の存在を紹介しているが、本人が「完全な動作保証はない、100%テストしていない」と明言している。公式パッケージではない。
- 実際に本リポジトリと同種の構成（Expo + Godot + worklets系ライブラリ併用）で、`TurboModuleRegistry.getEnforcing(...): 'Worklets' could not be found. Verify that a module by this name is registered in the native binary.` というエラーが複数ユーザーから報告されている（Issue #16, #23）。これはまさに依頼文の想定どおり、worklet関連のネイティブモジュール登録が競合・欠落するクラスの障害である。メンテナの返信は「同様の環境では問題なく動いている」「追加のMavenリポジトリ設定を試して」という個別対応にとどまり、`react-native-worklets` との共存可否について明確な保証は一次情報からは確認できなかった。
- 別のビルド障害として、iOSで `react-native-worklets-core/WKTJsiWorklet.h` が見つからないケース（Issue #28、`useFrameworks: static` 環境）も報告されている。

出典:
- https://github.com/borndotcom/react-native-godot/issues/31
- https://github.com/borndotcom/react-native-godot/issues/16
- https://github.com/borndotcom/react-native-godot/issues/23
- https://github.com/borndotcom/react-native-godot/issues/28
- https://www.npmjs.com/package/@somesoap/react-native-godot
- npmパッケージ本体の `package.json`（`dependencies`, `peerDependencies`）

**未確認**: `react-native-worklets-core@1.6.2` と `react-native-worklets@0.10.1` を同一アプリにインストールした場合に、JSIランタイムレベルで確実に競合する（起動不能になる）のか、それとも個別のビルド設定の問題を解消すれば共存できるのかは、一次情報からは断定できなかった。公式にテスト済み・保証された組み合わせは存在しない。

### 5. LibGodotプリビルドバイナリの取得方法・バージョン固定・CI

**確認できた事実**
- プリビルドバイナリはnpmパッケージには同梱されず、`yarn download-prebuilt`（`bin` に登録された `scripts/download-prebuilt.js`）で別途ダウンロードする方式。
- ダウンロード元は `github.com/migeran/libgodot` のGitHub Releaseアセット。npmパッケージの `package.json` の `prebuiltFiles` フィールドにファイル名・バージョン・SHA-256・ダウンロードURLが記載されており、バージョンは `4.5.1.migeran.2` に固定、SHA-256ハッシュによる検証も行われる。
- 環境変数（`LIBGODOT_XCFRAMEWORK_PATH` 等）でローカルビルド済みバイナリに差し替え可能。
- Android側は `libgodot-android.zip`（55,787,859 bytes）と `godot-cpp-android.zip`（28,643,239 bytes）、iOS側は `libgodot.xcframework.zip`（57,350,898 bytes）と `libgodot-cpp.xcframework.zip`（35,809,065 bytes）（いずれも圧縮配布パッケージのサイズ。実際にアプリへ組み込まれるネイティブライブラリのサイズとは異なる）。
- CIでの扱いについて、ライブラリ側のリポジトリにGitHub Actionsのワークフローが存在すること自体は確認したが（`Actions` タブ）、その内容の詳細調査（一次情報でのCI設定の読み込み）は今回実施していない。

出典:
- npmパッケージ本体の `package.json` の `prebuiltFiles` / `bin` フィールド
- https://github.com/migeran/libgodot/releases/tag/4.5.1.migeran.2

**未確認**: 本リポジトリのCI（GitHub Actions, `ubuntu-latest`）上で `download-prebuilt` を安定して実行できるか（ネットワーク・認証・キャッシュの制約）は未検証（Gate 2で確認予定）。

### 6. 対応する Godot エディタのバージョン

**確認できた事実**
- LibGodotのブランチは依頼文の想定どおり `libgodot_migeran_45` であり、これは Godot Engine `4.5.1` ベース（npmパッケージの `prebuiltFiles` バージョン表記 `4.5.1.migeran.2`、および `migeran/libgodot` リポジトリのタグ `4.5.1.migeran.1` / `4.5.1.migeran.2` で確認）。
- Godot公式配布のエディタではなく、Migeran社がフォークしたカスタムビルド（`libgodot`）である点に注意。プロジェクトファイル自体は通常のGodotエディタ（4.5.1系）で編集可能と推測されるが、この互換性の詳細（通常配布のGodot 4.5.1エディタとの完全互換性）はREADME上に明記がなく未確認。

出典:
- https://github.com/migeran/libgodot/releases
- npmパッケージ本体の `package.json`（`prebuiltFiles[].version`）

**未確認**: 公式配布の Godot Editor 4.5.1（godotengine.org配布版）で作成したプロジェクトが、Migeran版LibGodotとバイナリレベルで完全互換かどうかの明記。

### 7. アプリサイズへの影響

**確認できた事実**
- READMEには「Godotアプリをランタイムでダウンロードすれば初期アプリサイズを小さくできる」という設計上の利点の記述はあるが、LibGodot自体をネイティブに組み込んだ場合の具体的なアプリサイズ増加量の記載はない。
- プリビルドバイナリの配布パッケージサイズ（圧縮状態）は項目5の通り、Android向けで合計約80MB、iOS向けで合計約90MB。ただしこれはビルド用の中間ファイルであり、最終的なAPK/IPAへの実サイズ増加分ではない（アーキテクチャ別分割、圧縮方式、不要シンボルの除去等により変動する）。

出典:
- npmパッケージ本体の `package.json`（`prebuiltFiles`）
- https://github.com/migeran/libgodot/releases/tag/4.5.1.migeran.2
- https://github.com/borndotcom/react-native-godot/blob/master/README.md

**未確認**: 実際のAPK/IPAサイズ増加量の実測値。Gate 2以降でバンドル生成・実機ビルドを行った際に測定が必要。

### 8. 既知の制約

**確認できた事実**（依頼文が想定していた内容と一致）
- READMEの「Threading and JavaScript in React Native」節に明記あり:
  - Godotエンジンは独立したネイティブスレッドで動作し、React NativeのJSスレッドとは別。JSからGodotスレッドへのアクセスには `react-native-worklets-core` の worklet機構（`runOnGodotThread()`）を使う。
  - メインJSスレッドから直接Godotへアクセスすることは可能だが非推奨。Godot側から見ると「バックグラウンドスレッド」からの呼び出しになり、**SceneTreeに完全にはアクセスできない**制約がある。
  - **メインJSスレッドで取得したGodotオブジェクト参照と、worklet（Godotスレッド）内で取得した参照は、別々のJSコンテキストに紐づくため互換性がなく、相互に使い回せない**。複数コンテキストで使える参照の実装は「現状サポートされていない」とREADMEに明記。この制約を回避したい場合はMigeranに直接問い合わせが必要、とある＝標準機能では未対応。
- これに加え、実運用でのビルド障害（Gate 0の他項目で記載）も広義の制約として確認できた: RN 0.86でのAndroidビルド失敗（項目2・4）、公式Expo config plugin不在（項目3）、worklets-core/worklets共存の未保証（項目4）。

出典:
- https://github.com/borndotcom/react-native-godot/blob/master/README.md（「Threading and JavaScript in React Native」節）

**未確認**: なし（依頼文が挙げた制約はいずれもREADME一次情報で確認できた）。

---

## Gate 0 合否判定

上記8項目すべてについて「確認できた事実」または「確認できなかった」を記録した。**合格条件（8項目すべての記録）は満たしている。**

一方、項目4（最重要項目）は「明確に不可」と断定できる一次情報（例: メンテナ自身による『共存不可』という明言）はなかった。そのため、依頼文の記載どおりの機械的な基準（「項目4が明確に不可と判明した場合のみ中止」）には厳密には該当しない。

ただし、以下の複合的な事実を踏まえると、実務上のリスクは「不可に近い」と判断する。

## 総合評価と推奨

**推奨: 本命（react-native-godot）は現時点で採用を保留し、フォールバック（WebView + Babylon.js）への切り替え、または react-native-godot の状況が改善するまでの様子見を提案する。**

根拠:

1. **本リポジトリのRNバージョン（0.86.3）に極めて近いRN 0.86.0で、Androidネイティブビルドが失敗する未解決Issueが存在する**（#32、CMakeが `hermes-engine::libhermes` を見つけられずビルド不能）。修正は非公式フォーク（`falleco/react-native-godot`）でのみ提供されており、しかもそのフォークは `react-native-worklets`（>=0.10.0）への切り替えを前提としている＝公式パッケージとは別物。
2. **Expo管理下（config plugin）での公式サポートが存在しない**。Android統合の実例はすべてコミュニティが自作した config plugin と `build.gradle` の手動パッチであり、投稿者自身が「まだ実装方法が不明瞭」とコメントしている状態（#16, #29）。EAS Cloud Buildでの失敗報告もある（#16内のswalih-mohammedコメント）。
3. **本タスクの最重要確認事項（worklets-core と worklets の共存）について、公式の保証も、確認済みの成功事例も一次情報からは見つからなかった**。むしろ「移行してほしい」という要望にメンテナが明確に答えていない状況と、実際に `TurboModuleRegistry` 関連のエラーを踏んだユーザー報告が複数ある。
4. **プロジェクトが実質的に停滞している**。GitHub上の最終pushは2025-11-07（調査時点から約10ヶ月前）。メンテナは2025-11時点で「RN最新版への対応を進めている」とコメントしているが、それ以降のリリースは確認できない。

これらはいずれも、本タスクの制約（「独自の回避策を本採用しない」「有料サービス登録なしで完結させる」「bare workflow化しない」）と衝突する。Gate 2 に進んだ場合、実際に遭遇する可能性が高い障害（RN 0.86でのAndroidビルド失敗、Expo config plugin不在によるprebuild失敗、worklets競合）に対して、承認された回避策が「非公式フォークへの切り替え」「MainActivity.ktを書き換える自作config plugin」しかなく、いずれも今回の検証方針（回避策の独自実装をしない）に反する。

**ユーザーへの確認事項**: 上記を踏まえたうえで、
- (a) フォールバック（WebView + Babylon.js）の検討に切り替える
- (b) リスクを承知の上でGate 2（インストールとworklets競合の実地検証）まで時間を区切って進め、実際に発生する障害を記録した上で最終判断する
- (c) react-native-godotの更新（RN最新版対応）を待つ

のいずれを希望するか、指示を仰ぐ。
