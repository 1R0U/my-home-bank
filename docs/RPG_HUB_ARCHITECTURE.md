# RPGハブ画面 アーキテクチャ設計

## 1. 目的

子供用メイン画面を、プレイヤーキャラクターがマップ上を移動し、建物から各機能へ遷移できるRPGハブとして実装するための技術方針を定める。

本設計では、地形・建物・装飾・プレイヤーを単一の3Dシーンで扱う。そのシーンは **RN 内の WebView で動く Babylon.js** で構築する。最初から完成版を実装せず、実機での技術検証を通して依存関係と性能を確認した後、段階的に機能を追加する。

関連Issue: [#55 RPGハブ画面 アーキテクチャ設計](https://github.com/1R0U/my-home-bank/issues/55)、[#48 子供用ホーム画面を作る](https://github.com/1R0U/my-home-bank/issues/48)、[#151 WebView + Babylon.js 方式のスパイク](https://github.com/1R0U/my-home-bank/issues/151)

### 1.1 3Dエンジンの選定経緯（重要）

この設計は当初 `three` / `@react-three/fiber` + `expo-gl` の単一シーンを前提にしていたが、以下の経緯で **WebView + Babylon.js 方式へ変更した**（2026-09-10）。判断の詳細は [`docs/RPG_HUB_ENGINE_INVESTIGATION.md`](RPG_HUB_ENGINE_INVESTIGATION.md)。

- R3F + expo-gl は expo-gl の WebGL2 相当が上限で、ポストプロセスが実質使えない。three.js のシーングラフ走査とドローコール発行が RN の JS スレッドで走り予算を食い合う。シーンエディタが無く配置の試行錯誤が回らない。将来の「着せ替え」「庭の自由装飾」はレンダラではなくゲームエンジン／エディタの機能を要求する。
- 本命候補として `@borndotcom/react-native-godot` を調査したが、本リポジトリの RN `0.86.3` に近い RN `0.86.0` での Android ビルド失敗（未解決）、公式 Expo config plugin 不在、`react-native-worklets-core` と本リポジトリ導入済み `react-native-worklets` の共存未保証、プロジェクトの約10ヶ月停滞により不採用。
- **採用**: WebView + Babylon.js。`react-native-webview` は Expo Go 標準搭載でネイティブ統合リスクが構造的に小さい。Babylon.js / react-native-webview とも活発にメンテされている。ネイティブ GL ブリッジ（expo-gl / LibGodot）の問題を避けられる。

### 1.2 現行の暫定実装

`app/main-child.tsx` → `components/ChildHomeScreen.tsx` → `components/rpg-hub/`（R3F + expo-gl、プリミティブ形状のみ）が稼働中。これは Babylon.js 版へ移行するまでの**暫定実装**として当面残す。`three` / `@react-three/fiber` / `expo-gl` はアンインストールしない（別画面のストア3D化などでも 3D 系ライブラリが使われている）。

## 2. 要件

- マップ上をプレイヤーキャラクターが自由に移動できる
- プレイヤーキャラクターにはリギング済みの3Dモデル（`.glb` 等）を使用する
- 建物を各機能への入口として扱う
  - 建物のタップで画面遷移できる
  - 建物への接近時にインタラクト操作で画面遷移できる
- 季節に応じて地形、装飾、照明の見た目を変更できる
- 建物や装飾をデータ駆動で追加・変更できる
- iOSとAndroidの実機で安定して動作する

## 3. アーキテクチャ決定

### 3.1 単一の3Dシーンを WebView 内の Babylon.js で構築する

地形・建物・装飾・プレイヤーを、WebView 内で動く Babylon.js の単一シーンに配置する。

2D背景の上に3Dキャラクターを重ねる方式は採用しない。2Dと3Dで座標系が分かれると、カメラ移動、前後関係、タップ判定、衝突判定の同期が必要になるためである。単一シーンでは次の処理を同じ座標系で扱える。

- Z-bufferによる前後関係の描画
- Babylon の `scene.pick` によるレイキャスト（建物のタップ判定）
- プレイヤーとマップオブジェクトの距離・衝突判定
- プレイヤーを基準にしたカメラ追従

RN 側と WebView 側の責務分離は次のとおり。

- **WebView 側（Babylon.js）**: 3D 描画、レンダリングループ、入力（仮想パッド／タップ）、移動・衝突・接近判定、季節に応じた見た目の切り替え
- **RN 側**: 画面遷移（Expo Router）、残高などアプリ状態の受け渡し、Supabase との通信、ネイティブ UI（「入る」ボタン等）
- **ブリッジ**: 両者は「意図(intent)」「イベント(event)」レベルの粗い JSON のみでやり取りする。RN 側から WebView 内の Babylon ノードを直接操作しない

### 3.2 採用技術

| 用途 | 技術 |
| --- | --- |
| 3Dシーン | Babylon.js（`babylonjs` UMD、WebView 内で実行） |
| RN ⇔ 3D の器 | `react-native-webview`（Expo Go 標準搭載） |
| 描画基盤 | WebView 内蔵ブラウザエンジンの WebGL2（iOS: WKWebView / WebKit、Android: System WebView / Chromium） |
| オフラインアセット | `expo-asset` / `expo-file-system` |
| ルーティング | Expo Router |
| 移動入力 | WebView 内の DOM/`PointerEvent`（必要なら RN 側 `react-native-gesture-handler` と併用） |
| 状態管理 | Zustand（RN 側のアプリ状態） |
| 動的データ | Supabase |

- 依存バージョンは [`docs/RPG_HUB_ENGINE_INVESTIGATION.md`](RPG_HUB_ENGINE_INVESTIGATION.md) の「依存関係」表を正とする。`package.json` / `package-lock.json` で解決された正確なバージョンを記録する。
- Babylon.js の UMD ビルドは外部 CDN から読み込まず、`babylonjs` パッケージ（devDependency）から `postinstall` で `assets/babylon-spike/babylon.txt` を生成し、Metro のアセットとしてバンドルする（`assetExts` に `txt` を追加）。生成物はコミットしない。
- 3Dモデル（`.glb` 等）を導入する場合も、リポジトリ内の `assets/` へ配置し WebView へ渡す。外部URLからの動的読み込みは技術検証の対象に含めない。
- WebGL2 対応: iOS Safari（＝WKWebView の WebKit）は 15 以降で対応。Android System WebView は Chromium ベースで対応。対象端末（iPhone 14 / Galaxy A22 5G Android 13）での実機確認は投資検証で行う。

### 3.3 カメラと座標系

- XZ平面を地面とし、Y軸を高さとして扱う
- カメラは斜め上から見下ろす角度で配置し、Babylon の正射影モード（`camera.mode = ORTHOGRAPHIC_CAMERA`）で 2D ゲームに近い見た目を保つ
- プレイヤーのXZ座標を基準にカメラを追従させる
- ゲームロジック上の座標はワールド座標に統一し、画面ピクセル座標を状態として保持しない

透視投影は距離による見た目の差が大きく、2Dゲームに近い見た目を保ちにくいため、初期実装では使用しない。

## 4. コンポーネント構成

画面・3D表現・ゲームロジック・データを分離する。RN 側と WebView 側で層が分かれる。

```text
app/
├── main-child.tsx                 # 画面の入口（現状は暫定の R3F 版 ChildHomeScreen を re-export）
└── babylon-spike.tsx              # 検証専用ルート /babylon-spike（スパイク、Issue #151）
components/babylon-spike/          # スパイクの実装（本実装の参照元）
├── BabylonSpikeScreen.tsx         # 画面。WebView の器 + ネイティブ UI（ボタン等）
├── BabylonSpikeView.tsx           # WebView ラッパ。HTML の組み立て・ロード・ブリッジ受信
└── sceneHtml.ts                   # WebView に渡す自己完結 HTML（Babylon UMD + シーン用インライン JS）
lib/babylon-spike/
└── bridge.ts                      # RN ⇄ WebView の意図/イベントのシリアライズ・パース・検証（純粋関数）
store/
├── playerStore.ts                 # プレイヤー位置・向き・移動状態（RN 側スナップショット）
└── mapStore.ts                    # マップオブジェクト・季節
types/
└── map.ts                         # マップ関連の型
lib/rpg-hub/
├── movement.ts / collision 相当   # 純粋関数による衝突・接近判定（WebView 側バンドルでも再利用可能）
└── season.ts                      # 日付・イベントから季節を決定
scripts/
└── sync-babylon.mjs               # babylonjs UMD → assets/babylon-spike/babylon.txt を生成
```

本実装時は `components/babylon-spike/` を土台に `components/rpg-hub-web/`（仮）へ発展させる想定。`lib/rpg-hub/` の判定ロジックは Three.js 非依存の純粋関数なので、WebView 側のシーンバンドルからも `import` して再利用できる（同じ移動・衝突ルールを RN 側テストと WebView 側実行で共有する）。

既存の `store/index.ts` と `types/index.ts` は単一ファイル構成だが、RPGハブは状態・型・判定ロジックが独立して増えるため、意図的に機能単位のファイルへ分割する。既存ファイル全体のリファクタは行わず、RPGハブ関連だけにこの方針を適用する。

## 5. データ設計

### 5.1 型定義

位置は3D描画の座標系に合わせて`x`, `y`, `z`を持たせる。衝突判定は地面上の`x`, `z`を使用する。

```ts
type Season = 'spring' | 'summer' | 'autumn' | 'winter';

type MapObjectType = 'building' | 'decoration' | 'npc';
type MapRouteId = 'tasks-child' | 'balance-child' | 'store-child';
type AssetId = string & { readonly __brand: 'AssetId' };

type MapObject = {
  id: string;
  type: MapObjectType;
  position: { x: number; y: number; z: number };
  rotationY?: number;
  scale?: number;
  model: AssetId;
  seasonalModel?: Partial<Record<Season, AssetId>>;
  seasonalTexture?: Partial<Record<Season, AssetId>>;
  route?: MapRouteId;
  interactive: boolean;
  collidable: boolean;
  collisionSize?: { width: number; depth: number };
  interactionRadius?: number;
};
```

`route`、`model`、`seasonalModel`、`seasonalTexture`にはパスやURLを保存せず、アプリが定義する許可リストのIDを保存する。`MapRouteId`はルート辞書、`AssetId`はアセット辞書で解決し、解決済みの値だけを`router.push()`またはローダーへ渡す。Supabaseから未知のIDを受け取ったレコードは破棄して報告し、データ変更だけで想定外の画面・ローカルパス・外部URLを選択できないようにする。

ワールド座標とモデルのローカル座標は、どちらも`1`単位を現実空間の`1m`相当として扱う。`collisionSize`はモデルのローカル座標における未拡縮の幅・奥行き、`interactionRadius`はワールド座標上の半径とする。

`collisionSize`には衝突判定時に`scale`（省略時は`1`）を掛け、`rotationY`を反映した4頂点からワールド座標のAABBを算出する。`interactionRadius`にはモデルの`scale`を適用しない。負または`0`の`scale`と、正でない`collisionSize`または`interactionRadius`は入力検証で拒否する。回転後のAABBがゲーム性に対して粗すぎるオブジェクトだけ、後続IssueでOBBまたは複数の衝突矩形を検討する。

### 5.2 Supabase入力の検証

Supabaseの行をTypeScriptの型アサーションだけで`MapObject`として扱わない。DBとアプリの両方で次を検証する。

- DB制約: `type`の列挙値、有限な座標、`scale > 0`、衝突サイズと接近半径の正数、マップ内での`id`の一意性
- 実行時パーサー: 必須項目、数値の有限性、許可された`MapObjectType`、`MapRouteId`、`AssetId`、季節キーを検証する
- 取得結果内の重複`id`を拒否し、不正レコードは`mapStore`へ渡さず、監視ログへ理由とレコードIDを記録する
- パース済みの`MapObject[]`だけを`mapStore.objects`へ設定する（既存の `lib/rpg-hub/mapObjects.ts` の `parseMapObject` / `parseMapObjects` を利用する）

### 5.3 状態の責務

```ts
type PlayerState = {
  position: { x: number; z: number };
  direction: 'up' | 'down' | 'left' | 'right';
  moving: boolean;
};

type MapState = {
  objects: MapObject[];
  currentSeason: Season;
  nearbyObjectId: string | null;
};
```

- プレイヤーの現在位置の正規ソースは **WebView 内のゲームループが保持する値**とし、描画、衝突、接近判定、カメラ追従は同じ値を各フレームの先頭で参照する
- `playerStore.position` は RN 側の UI・画面遷移・保存処理向けのスナップショットとし、WebView から意図イベントで通知された値を反映する。フレーム内判定には使用しない
- `playerStore` は位置のスナップショット以外に、向きと移動状態などゲーム進行に必要な論理状態を保持する
- モデル、テクスチャ、Babylon オブジェクトなどシリアライズできない値は Zustand へ格納しない。ブリッジにも載せない
- `mapStore` は取得済みのマップデータと現在の季節を保持し、必要な差分だけを意図として WebView へ送る
- 毎フレーム変わる表示用の一時値は WebView 側に閉じ込め、RN の再レンダリングを発生させない

初期MVPではローカル定数からマップを読み込み、データ構造と表示を確定してからSupabaseの`map_objects`テーブルへ移行する。

## 6. インタラクション

### 6.1 建物のタップ

WebView 内の Babylon シーンで `scene.onPointerObservable` の `POINTERPICK` を監視し、`scene.pick` の結果が `interactive: true` かつ許可済みの `route` を持つ建物なら、`{ event: "navigate", route }` 相当の意図イベントを RN へ送る。RN 側は許可済みルート辞書で解決してから `router.push()` する。

連続タップによる多重遷移を防ぐため、遷移開始後は RN 側で入力を一時的に無効化し、WebView にも入力停止の意図を送る。

### 6.2 建物への接近

移動中にプレイヤーとインタラクティブなオブジェクトの距離を比較し、`interactionRadius`内に入った対象を `nearbyObjectId` とする（WebView 側で判定）。候補が複数ある場合はXZ平面上の距離が最短の対象を選び、同距離の場合は`id`の昇順で決定して配列順に依存させない。`nearbyObjectId` の変化のみを意図イベントとして RN へ送り、RN 側で「入る」「話す」などのネイティブボタンを表示する。

接近だけでは自動遷移しない。建物の近くを通過しただけで画面が切り替わる誤操作を防ぐためである。

### 6.3 移動と衝突

- 仮想パッドまたはポインタ入力を移動ベクトルへ変換する（WebView 側）
- フレーム時間を考慮して移動量を計算し、`deltaTime`は最大50msに制限する
- 1回の移動距離が最小障害物厚の半分以下になるよう移動をサブステップ化する
- 各サブステップの移動候補座標と、`scale`と`rotationY`を反映した`collidable: true`のオブジェクトのワールドAABBを判定する
- 衝突する場合は移動をキャンセルする
- 判定ロジックは Babylon.js に依存しない純粋関数として実装し（`lib/rpg-hub/` の関数を WebView 側でも再利用）、回転・拡縮・大きな`deltaTime`・薄い障害物を含めて `node --test` でテストする

## 7. 季節システム

`currentSeason`の変更時に、オブジェクトの`seasonalModel`または`seasonalTexture`を参照する。季節用アセットがない場合は通常の`model`とマテリアルへフォールバックする。

ベースの`model`自体がバンドル漏れ、破損、デコード失敗で読み込めない場合は、Babylon のロード失敗ハンドラで捕捉し、シーン全体をクラッシュさせない。失敗した`AssetId`とエラー理由を意図イベントで RN へ通知してログに記録し、次の共通プレースホルダーへ置き換える。

- 建物: 元の`position`、`scale`、衝突領域、インタラクションを維持した簡易Boxメッシュを表示する
- 装飾: 非インタラクティブな簡易Boxメッシュを表示する
- NPC: 会話や遷移を維持できる簡易カプセルメッシュを表示する

同じ破損アセットの自動再試行は繰り返さず、画面の再表示または明示的な再読み込み時に1回だけ再試行する。技術検証では存在しない`AssetId`と破損したモデルをそれぞれ読み込ませ、プレースホルダー表示、操作継続、ログ記録、再試行上限を確認する。

季節に応じて次の要素を変更できるようにする。

- 地形と建物のテクスチャ
- 木、花、雪などの装飾
- 背景色、環境光、平行光源の色と強さ

同一モデルのテクスチャ差し替えでは、ジオメトリを再生成せずマテリアルを更新する。季節の決定方法は表示から分離し、現実の日付連動とアプリ内イベント連動のどちらにも対応できるようにする（`lib/rpg-hub/season.ts`）。

## 8. パフォーマンス方針

- 木や街灯など同じ形状を繰り返す装飾は Babylon の Thin Instances（`mesh.thinInstance*`）で描画する
- モデルとテクスチャはキャッシュし、フレームごとの再読み込みを避ける
- Babylon の視錐台カリング（既定で有効）を利用する
- マップ拡大後は、プレイヤー周辺のオブジェクトだけを判定・描画対象にする空間分割を検討する
- ブリッジ（`postMessage`）は往復コストがあるため、毎フレーム送らない。位置スナップショットは最大 100ms 間隔、接近対象や遷移などの状態変化は変化時のみ送る
- 8MB超の Babylon UMD は WebView に文字列 prop として渡さず、キャッシュにファイルとして書き出して `source={{ uri }}` で読む
- 技術検証時に実機で FPS、メモリ使用量、初回起動時間、入力遅延を確認する
- 本実装フェーズで Babylon のツリーシェイク（UMD 全部入りではなく使用機能だけのバンドル）を検討する

## 9. 技術検証

検証の記録は [`docs/RPG_HUB_ENGINE_INVESTIGATION.md`](RPG_HUB_ENGINE_INVESTIGATION.md) に集約する。

- **Gate 0（完了）**: react-native-godot / WebView + Babylon.js の一次情報調査、方式決定
- **スパイク（Issue #151、実装済み・実機確認待ち）**: 検証専用ルート `/babylon-spike` で「WebView 内の最小 Babylon シーン ＋ 意図レベルの双方向ブリッジ」が成立するかを確認。ローカルでは型チェック・テスト・Android バンドル生成が通ることを確認済み。実機（iPhone 14 / Galaxy A22 5G）での表示・タップ・残高受け渡し・ライフサイクルの確認は依頼者が実施し、結果を投資検証ドキュメントに追記する
- **後続で計測する項目**: リリース相当ビルドでの平均 FPS・95 パーセンタイルフレーム時間、30分操作時のメモリ増加、コールドスタート、バックグラウンド復帰・画面遷移の反復（各10回）、2D 版子供用ホームとの比較

### 合否判断

両OSの対象端末で、表示・タップ遷移・残高受け渡し・画面遷移後の再表示・バックグラウンド復帰が安定して動作し、後続の数値基準（FPS・メモリ・コールドスタート）を満たした場合に WebView + Babylon.js 方式を本実装確定とする。

一方のOSで安定しない場合は、本実装へ進まず 10 章を評価する。

## 10. 保険案

WebView + Babylon.js 方式が実機で成立しない場合の候補。

- **現行の R3F + expo-gl 単一シーン**（`components/rpg-hub/`）を暫定継続する。プリミティブ形状のみでの動作は Expo Go で確認済み。着せ替え・庭装飾の要求には応えられないが、当面のRPGハブ表示は維持できる
- `@babylonjs/react-native`（WebView を介さないネイティブ埋め込み）は、公式に「Expo 非対応」と明記され Android NDK/CMake が必須で、react-native-godot と同種の統合リスクを抱えるため、フォールバックとしても採用しない（[`docs/RPG_HUB_ENGINE_INVESTIGATION.md`](RPG_HUB_ENGINE_INVESTIGATION.md) 参照）

技術検証の失敗内容と代替方式の追加コストを記録し、別Issueで採否を決定する。

## 11. 実装順序

1. **（済）** 3Dエンジンの選定と、最小シーン＋ブリッジのスパイク（Issue #151）
2. 実機でスパイクの表示・タップ・残高受け渡し・ライフサイクルを確認する
3. WebView 側に正射影カメラとプレイヤー移動（仮想パッド）を実装する
4. ローカルの`MapObject`データから建物を描画し、タップ → 意図イベント → RN で `router.push` の遷移を実装する
5. 接近判定とインタラクトUI（RN 側ネイティブボタン）を実装する
6. 装飾物とのAABB衝突判定を実装する（`lib/rpg-hub/` の純粋関数を WebView 側で再利用）
7. 季節によるテクスチャ・装飾・照明の切り替えを実装する
8. マップデータをSupabaseから取得する（`parseMapObjects` で検証）
9. 実機計測を基に描画・ブリッジ・バンドルサイズを最適化する
10. 稼働中 RPGハブ（`ChildHomeScreen`）を Babylon.js 版へ切り替え、R3F 版を撤去する

各段階は個別Issueに分割し、スパイクの実機確認が完了するまで大規模なアセット制作やSupabaseのスキーマ追加を開始しない。

## 12. 今回の対象外

- 3Dモデルや季節アセットの制作
- RPGハブ画面の本実装（稼働中画面の差し替え）
- Supabaseの`map_objects`テーブル作成
- クエスト、銀行、ストア各画面の仕様変更
- Babylon.js のツリーシェイク・バンドル最小化
- FPS・メモリ・コールドスタートの実測、着せ替え・庭装飾の実現方式調査

これらは本設計とスパイクの実機確認結果を前提に、後続Issueで対応する。
