# RPGハブ 3Dエンジン選定・検証記録

関連Issue: [#139 react-native-godot 導入可否の技術検証](https://github.com/1R0U/my-home-bank/issues/139)（クローズ）、[#151 WebView + Babylon.js 方式のスパイクと設計ドキュメント更新](https://github.com/1R0U/my-home-bank/issues/151)、[#138 EAS設定（eas.json）と開発ビルド手順の整備](https://github.com/1R0U/my-home-bank/issues/138)

## 決定（2026-09-10）

**RPGハブ画面の3D方式として `@borndotcom/react-native-godot` は不採用とし、WebView + Babylon.js を採用する。**

- react-native-godot の Gate 0 調査で、本リポジトリの RN `0.86.3` に近い RN `0.86.0` での Android ビルド失敗（未解決）、公式 Expo config plugin 不在、`react-native-worklets-core` と本リポジトリ導入済み `react-native-worklets` の共存未保証、プロジェクトの約10ヶ月停滞が判明した（詳細は「Gate 0」以下）。
- 代替の WebView + Babylon.js は、`react-native-webview` が Expo Go 標準搭載でネイティブ統合リスクが構造的に小さく、Babylon.js / react-native-webview とも活発にメンテされている（詳細は「フォールバック候補（WebView + Babylon.js）の検証」以下）。
- 稼働中の React Three Fiber + expo-gl 版 RPGハブは、Babylon.js 版へ移行するまでの暫定実装として当面残す。

このリポジトリの前提バージョン: Expo `~57.0.19` / React Native `0.86.3` / React `19.2.3` / Node `>=22.13.0`（`package.json` 時点）。

以下、Gate 0（react-native-godot 調査）とフォールバック候補の調査は、判断の経緯を残すための記録である。実際に採用する WebView + Babylon.js 方式のスパイク結果は末尾の「WebView + Babylon.js スパイク（Issue #151）」にまとめる。

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

---

## Gate 0 補足：フォールバック候補（WebView + Babylon.js）の検証

react-native-godotとの比較材料として、フォールバック候補についても同水準で一次情報を確認した（調査日: 2026-09-08）。

### A. 対象パッケージの特定

「WebView + Babylon.js」は具体的には次の組み合わせを指す。

- `react-native-webview`（RN内にWebViewを表示する定番ライブラリ）
- `@babylonjs/core`（Babylon.jsのエンジン本体。WebView内で読み込むJSバンドルとして使う）
- 両者はネイティブGLへは触れず、WebViewが内部で持つブラウザエンジン（AndroidはChromium系WebView、iOSはWKWebView＝Safariと同じWebKit）にレンダリングを委譲する

比較対象として、Babylon.jsを**WebViewを使わずネイティブに直接埋め込む**公式パッケージ `@babylonjs/react-native`（+ `@babylonjs/react-native-iosandroid`）も存在するため、こちらも合わせて調査し、不採用理由を明確にする。

### B. バージョン・ライセンス・最終更新

| パッケージ | 最新バージョン | ライセンス | 最終更新（npm） | GitHub最終push |
| --- | --- | --- | --- | --- |
| `react-native-webview` | `14.0.1` | MIT | 2026-07-11 | 2026-07-12 |
| `@babylonjs/core` | `9.25.0` | Apache-2.0 | 2026-09-07（ほぼ毎日更新） | 確認済み・活発 |
| `@babylonjs/react-native`（参考・不採用候補） | `2.0.5` | MIT | 2026-09-07 | 2026-09-03 |

react-native-godot（最終push 2025-11-07、以降10ヶ月停滞）と比べて、いずれも継続的にメンテナンスされている点が明確な違いである。

出典:
- `npm view react-native-webview` / `npm view @babylonjs/core` / `npm view @babylonjs/react-native`
- https://github.com/react-native-webview/react-native-webview
- https://github.com/BabylonJS/BabylonReactNative

### C. Expo/RN統合の成熟度（react-native-godotとの最大の違い）

**確認できた事実**
- `react-native-webview` はExpoの公式ドキュメントに掲載されており、**"Included in Expo Go"**（Expo Goのネイティブランタイムに標準搭載）と明記されている。つまり追加のネイティブビルド・config plugin・Development Buildなしで、Expo Go上でもそのまま動作する。react-native-godotが抱えていた「config plugin不在」「Expoでのビルド失敗」の類の問題は、この時点で構造的に発生しない。
- GitHubのIssue検索で `0.86` に関連する報告は、Fabric（新アーキテクチャ）での背景色透過に関する軽微な表示バグ（#3994、未解決だが3D描画用途とは無関係）のみ。RN 0.86でのビルド不能のような致命的な報告は見つからなかった。
- 一方、比較対象の `@babylonjs/react-native`（ネイティブ埋め込み版）のREADMEには **"Official support for React Native frameworks, like Expo, is not provided by BabylonReactNative. While BabylonReactNative may work with these frameworks, we do not conduct testing, bug fixes, or feature development to ensure compatibility."** と明記されている。さらにAndroid NDK・CMake・Ninja等のフルネイティブビルド環境が必須で、react-native-godotとほぼ同じ種類のリスク（Expo未対応・複雑なネイティブトゥールチェーン）を抱えている。

出典:
- https://docs.expo.dev/versions/latest/sdk/webview/
- https://github.com/react-native-webview/react-native-webview/issues/3994
- https://github.com/BabylonJS/BabylonReactNative（README「Frameworks (Expo, ...)」節）

**結論**: 「WebView + Babylon.js」を選ぶ場合は必ずWebView経由の方式を採る。ネイティブ埋め込み版（`@babylonjs/react-native`）はreact-native-godotと同じ弱点を持つため、フォールバックとしては採用しない。

### D. WebGL2対応状況（対象端末: iPhone 14 / iOS 26.6、Galaxy A22 5G / Android 13）

**確認できた事実**
- iOS Safari（WKWebViewが内部で使う描画エンジンと同一のWebKit）はバージョン15以降でWebGL2をサポート。iPhone 14はiOS 26.6稼働のため対応範囲内（caniuse.com調べ）。
- Android向けChromeはWebGL2に長期間対応済み（caniuse.com調べ、現行バージョンで100%サポート）。ただしAndroid端末の「WebView」はChromeそのものではなく「Android System WebView」という別アプリ（Chromiumベースで独立更新）である点に注意。Android 13搭載のGalaxy A22 5GでAndroid System WebViewが実際にWebGL2を返すかは、caniuseの数値からの類推であり、**この端末個別での実機確認はしていない（未確認）**。

出典:
- https://caniuse.com/webgl2

**未確認**: Galaxy A22 5G（Android 13）に実際に入っているAndroid System WebViewのバージョンと、そのWebGL2対応の実機確認。

### E. JS ⇄ WebView間の通信方式

**確認できた事実**
- `react-native-webview` は `postMessage` / `onMessage` / `injectedJavaScript` / `injectedJavaScriptBeforeContentLoaded` という組み込みのAPIで、RN側とWebView内JS側の双方向通信を提供している（公式ドキュメントで確認）。react-native-godotの `runOnGodotThread()` のような特別なworklet機構は不要で、素のReact Nativeの範囲で完結する。

出典:
- https://github.com/react-native-webview/react-native-webview/blob/master/docs/Guide.md

### F. 既知の制約・リスク

**確認できた事実**
- WebViewを1枚挟むレイヤー構成になるため、`docs/RPG_HUB_ARCHITECTURE.md` 10章が指摘する「RN側の画面遷移・Zustandとのブリッジ通信」「NativeWindとの統合の複雑さ」「タップ/状態同期の応答性低下の可能性」は引き続き課題として残る（今回、実機での応答性は未計測）。
- `@babylonjs/react-native`（ネイティブ版）のREADMEには「RNのJSエンジン（Hermes/JSC）はモバイルではJITが無効化されるため、JS重い処理で性能問題が起きうる」という記載があった。**この制約はネイティブ埋め込み版に固有のものであり、WebView内でBabylon.jsを動かす場合はWebView自身が持つ別のJSエンジン（AndroidはV8系、iOSはJavaScriptCore）上で実行されるため、直接は当てはまらない**（一般にWebブラウザのJSエンジンはJITが有効とされるが、本セッションでは一次情報での裏取りはしておらず、参考情報として記載する）。

出典:
- `docs/RPG_HUB_ARCHITECTURE.md` 10章
- https://github.com/BabylonJS/BabylonReactNative（README「Performance」節）

**未確認**: WebView内Babylon.jsの実機でのFPS・入力応答遅延・メモリ使用量。

### G. ゲームエンジン機能の有無（react-native-godot採用理由との対比）

**確認できた事実（一般知識ベース、今回一次情報での深堀りはしていない）**
- Babylon.jsは3Dレンダリングエンジンであり、Godotのような統合ゲームエンジンではない。シーングラフ・物理・アニメーションの機能は持つが、Godotの `Skeleton3D` / `BoneAttachment3D`（着せ替え）、`MultiMeshInstance3D` / `Area3D`（庭装飾）に相当する即戦力の標準機能は薄く、多くを自前実装する必要がある。
- 専用のGUIシーンエディタは提供されていない（Babylon.js Editorという別プロジェクトはあるが、Godotエディタほど一体化していない、未検証）。

**未確認**: Babylon.jsで着せ替え・庭装飾を実装する場合の具体的な工数・実現方式（この点はフォールバック採用が決まった場合に別途調査が必要）。

### まとめ：react-native-godot と WebView + Babylon.js の対比

| 観点 | react-native-godot | WebView + Babylon.js |
| --- | --- | --- |
| Expo/RN統合の成熟度 | 未成熟（config plugin不在、Expo関連未解決Issue多数、RN 0.86ビルド失敗報告あり） | **成熟**（`react-native-webview`はExpo Go標準搭載、致命的な未解決Issueなし） |
| プロジェクトの活発さ | 停滞（最終push 2025-11-07、以降10ヶ月） | 活発（両パッケージともほぼ現在進行形で更新） |
| ネイティブビルドの複雑さ | 高い（LibGodotバイナリ、独自worklets機構、SNAPSHOT依存解決の問題） | 低い（追加のネイティブビルドが基本的に不要） |
| ゲームエンジン機能（着せ替え・庭装飾） | 標準機能として存在（Gate 0の範囲では未検証） | 薄い。多くを自前実装する前提 |
| シーンエディタ | Godotエディタ（成熟したGUI） | 専用エディタなし |
| 今回確認できた技術的優位性 | シーンファイルのテキスト管理、統合ゲームエンジン機能 | Expo/RNとの統合リスクの低さ |

**Gate 0全体を踏まえた総合所見**: react-native-godotが持つ「ゲームエンジンとしての機能の強さ」と、WebView + Babylon.jsが持つ「Expo/RNとの統合の安定性」はトレードオフの関係にある。react-native-godot側の統合リスクは今回の調査で具体的かつ深刻であることが分かった一方、WebView + Babylon.js側は統合リスクは低いが、着せ替え・庭装飾という当初の目的機能をどこまで自前実装できるかが未検証のまま残っている。次に進む場合は、この「機能の自前実装コスト」を見積もるための小規模な調査（Babylon.jsでのスケルトン共有・MultiMesh相当の実現方法）を追加することを推奨する。

→ この所見を踏まえ、ユーザー判断で **WebView + Babylon.js を採用**（2026-09-10）。以降のスパイクは Issue #151。

---

## WebView + Babylon.js スパイク（Issue #151）

### 目的

「`react-native-webview` の中で Babylon.js を動かし、RN ⇄ WebView を意図(intent)レベルの JSON で双方向通信する」方式が成立するかを、検証専用ルート `/babylon-spike` で確認する。見た目・アセット・アートディレクションには手を付けない（プリミティブのみ、3Dモデルなし）。

稼働中の React Three Fiber 版 RPGハブ（`app/main-child.tsx` / `components/ChildHomeScreen.tsx` / `components/rpg-hub/`）、`three` / `@react-three/fiber` / `expo-gl` には一切手を付けていない。

### 依存関係（`npm ls` で確認、2026-09-10）

| パッケージ | 解決バージョン | 追加区分 |
| --- | --- | --- |
| `react-native-webview` | `13.16.1` | dependencies（`npx expo install`。Expo SDK 57 互換版。`expo` 本体も依存しており Expo Go に標準搭載） |
| `expo-asset` | `~57.0.16` | dependencies（オフラインアセット読込。従来は transitive のみだったため明示依存化） |
| `expo-file-system` | `~57.0.6` | dependencies（同上。組み立てた HTML をキャッシュに書き出す） |
| `babylonjs` | `^9.25.0` | devDependencies（ブラウザ用 UMD ビルドの供給元。アプリには同梱しない） |

- `react-native-worklets` は `0.10.1` 単一バージョンで解決（`react-native-reanimated@4.5.1` 用）。`react-native-worklets-core` は依存ツリーに存在しない。react-native-godot で懸念された worklets 競合は、そもそも該当パッケージを入れないため発生しない。
- 新規の環境変数なし（`.env.example` 変更なし）。
- `ios/` `android/` は生成・コミットしていない（CNG 維持）。config plugin の自作も不要だった。`npx expo install expo-asset` により `app.json` の `plugins` に `expo-asset` が自動追加された。

### Babylon.js のオフラインバンドル方式

外部 CDN は使わず、Babylon.js の UMD ビルドをアプリ内にオフラインで持つ。方式は「npm 依存 + 生成」（Git 履歴を数MBのバイナリで汚さないため）。

1. `babylonjs` を devDependency に追加（UMD `babylon.js` を同梱するパッケージ）。
2. `scripts/sync-babylon.mjs` が `node_modules/babylonjs/babylon.js` を `assets/babylon-spike/babylon.txt` にコピー。
3. `package.json` の `postinstall` から実行され、CI・ローカルとも `npm install` 時に自動生成される。
4. 生成物 `assets/babylon-spike/babylon.txt` は `.gitignore` 済み（コミットしない）。
5. `metro.config.js` の `resolver.assetExts` に `txt` を追加し、Metro がアセットとしてバンドルする。

**更新手順**: `npm install --save-dev babylonjs@<新バージョン>` の後、`node scripts/sync-babylon.mjs` を実行（`npm install` 済み環境では postinstall が自動発火しないため手動）。

**確認済み**: `npx expo export --platform android` で `assets/babylon-spike/babylon.txt`（8,316,622 bytes、babylonjs@9.25.0 の `babylon.js`）が `ext: txt` のアセットとしてバンドルされることを `dist/metadata.json` で確認。

### 実行時の流れ（`components/babylon-spike/BabylonSpikeView.tsx`）

1. `Asset.fromModule(require("assets/babylon-spike/babylon.txt")).downloadAsync()` で Babylon UMD を文字列として取得。
2. `buildSceneHtml()`（`components/babylon-spike/sceneHtml.ts`）で、Babylon UMD とシーン用インライン JS を1枚に埋め込んだ自己完結 HTML を組み立てる（外部リソース読み込みゼロ → file アクセス権限のプラットフォーム差を回避）。`<script>` の早期終了対策として `</script` を無害化する。
3. `expo-file-system` の `File(Paths.cache, "babylon-spike.html")` に書き出し、`WebView` へは `source={{ uri }}` で渡す（8MB超の文字列を RN のブリッジ prop に載せない）。
4. `WebView` は `allowFileAccess` / `originWhitelist={["*"]}` でキャッシュの HTML を読む。

### シーン内容（`sceneHtml.ts` の `SCENE_SCRIPT`）

- 灰色の地面（`MeshBuilder.CreateGround`）、赤いカプセル1体（`MeshBuilder.CreateCapsule`、name `player`）、固定カメラ（`FreeCamera`、操作を受け付けない）、`HemisphericLight`。
- `scene.onPointerObservable` の `POINTERPICK` で `player` が pick されたら RN へ `{ event: "tapped", id: "player" }` を送る。
- `scene.executeWhenReady` で `{ event: "ready" }` を送る。
- `window.onerror` を `{ event: "error", message }` として RN へ転送する。

### ブリッジのインターフェース定義（`lib/babylon-spike/bridge.ts`）

意図・イベントレベルの JSON のみ。RN 側から WebView 内の Babylon ノードを直接操作しない（react-native-godot 調査で判明した「別 JS コンテキスト間のオブジェクト参照は非互換」という制約を、そもそも踏まない設計判断）。

**RN → WebView（意図 / `BabylonIntent`）**

| type | ペイロード | 意味 | WebView 側の挙動 |
| --- | --- | --- | --- |
| `setBalance` | `value: number`（有限数値） | 残高を表示させる | 画面左上の `#balance` を `残高: <value>` に更新 |

- 送信: `WebView.postMessage(encodeIntent(intent))`（`encodeIntent` = `JSON.stringify`）。
- 受信側: `window` と `document` の両方で `message` を待つ（`react-native-webview` の Android/iOS 差の吸収）。
- パース: `parseIntent()`。文字列/オブジェクト両対応、非 JSON・非オブジェクト・未知 type・非有限 `value` は破棄。

**WebView → RN（イベント / `BabylonEvent`）**

| event | ペイロード | 意味 |
| --- | --- | --- |
| `ready` | なし | シーンの初期化が完了した |
| `tapped` | `id: string`（非空） | `id` のオブジェクトがタップされた（本スパイクでは `player` のみ） |
| `error` | `message: string` | WebView 側で例外が発生した（`message` 欠落時は空文字へフォールバック） |

- 送信: `window.ReactNativeWebView.postMessage(JSON.stringify(event))`。
- 受信: `WebView` の `onMessage` → `parseBabylonEvent()` → `console.log`（`onEvent` コールバックにも渡す）。未知 event・不正値は `console.warn` して破棄。

### 検証結果（ローカル、Claude 実施）

| 項目 | 結果 |
| --- | --- |
| `npx tsc --noEmit` | ✅ エラーなし |
| `npm test`（`tests/babylonSpike.test.mjs` 7件 + 既存） | ✅ 全パス（unit 143 / render 46） |
| `npx expo export --platform android` | ✅ 完了。`babylon.txt` がアセットとしてバンドルされる |
| `npm ls react-native-webview react-native-worklets` | ✅ 単一バージョン解決。worklets 競合なし |

### 実機確認チェックリスト（依頼者が実施）

`npm start` で Expo Go に接続し、URL 直打ちで `/babylon-spike` を開く（開発ナビ `app/dev-navigation.tsx` には意図的に載せていない）。iPhone 14 / iOS ・ Galaxy A22 5G / Android の両方で確認する。

- [ ] WebView 内に灰色の地面と赤いカプセルが表示される（真っ黒・真っ白でない）
- [ ] 画面左上に「残高: -」が表示される
- [ ] カプセルをタップすると、RN 側のコンソールに `[babylon-spike] WebView → RN: { event: 'tapped', id: 'player' }` が出る／画面下部の「最新イベント」表示が更新される
- [ ] 「残高を送る」ボタンを押すと、WebView 内の「残高: -」が「残高: 1350」（押すたび +100）に変わる
- [ ] 別画面へ遷移 → 戻る、を数回繰り返してシーンが毎回再表示される
- [ ] アプリをバックグラウンドに送り、復帰させてもシーンが継続する（または `ready` 後に復帰できる）
- [ ] 端末名・OSバージョン・Expo Go バージョン・結果を本ドキュメントに追記する

### 未確認・後続（Issue #151 の範囲外）

- 実機での FPS・メモリ・コールドスタート・入力遅延の実測
- リグ付きキャラへの実行時メッシュ装着（着せ替え）、`.pck` 相当の追加コンテンツ配信、タップによるオブジェクト配置（庭装飾）の Babylon.js での実現方式
- ライフサイクル（バックグラウンド復帰・画面遷移）の反復試験（各10回）
- 稼働中 RPGハブ（`ChildHomeScreen`）の Babylon.js 版への移行
- Babylon.js のツリーシェイク（現在は UMD 全部入り 8.3MB。本実装フェーズで esbuild 等での最小化を検討）
