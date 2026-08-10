# RPGハブ画面 アーキテクチャ設計

## 1. 目的

子供用メイン画面を、プレイヤーキャラクターがマップ上を移動し、建物から各機能へ遷移できるRPGハブとして実装するための技術方針を定める。

本設計では、地形・建物・装飾・プレイヤーを単一の3Dシーンで扱う。最初から完成版を実装せず、実機での技術検証を通して依存関係と性能を確認した後、段階的に機能を追加する。

関連Issue: [#48 子供用ホーム画面を作る](https://github.com/1R0U/my-home-bank/issues/48)

## 2. 要件

- マップ上をプレイヤーキャラクターが自由に移動できる
- プレイヤーキャラクターにはリギング済みの`.glb`モデルを使用する
- 建物を各機能への入口として扱う
  - 建物のタップで画面遷移できる
  - 建物への接近時にインタラクト操作で画面遷移できる
- 季節に応じて地形、装飾、照明の見た目を変更できる
- 建物や装飾をデータ駆動で追加・変更できる
- iOSとAndroidの実機で安定して動作する

## 3. アーキテクチャ決定

### 3.1 単一の3Dシーンを採用する

地形・建物・装飾・プレイヤーを、`three`と`@react-three/fiber`で構築する単一シーンに配置する。

2D背景の上に3Dキャラクターを重ねる方式は採用しない。2Dと3Dで座標系が分かれると、カメラ移動、前後関係、タップ判定、衝突判定の同期が必要になるためである。単一シーンでは次の処理を同じ座標系で扱える。

- Z-bufferによる前後関係の描画
- raycasterによる建物のタップ判定
- プレイヤーとマップオブジェクトの距離・衝突判定
- プレイヤーを基準にしたカメラ追従

### 3.2 採用技術

| 用途 | 技術 |
| --- | --- |
| 3Dシーン | `three` / `@react-three/fiber` |
| ネイティブGL | `expo-gl` |
| ルーティング | Expo Router |
| 移動入力 | `react-native-gesture-handler` |
| 状態管理 | Zustand |
| 動的データ | Supabase |

依存パッケージのバージョンは設計時点で固定しない。Expo SDKと`expo-gl`、`@react-three/fiber`の互換性を技術検証で確認し、実機で合格した組み合わせを`package.json`と`package-lock.json`に記録する。

`react-native-game-engine`などのゲームエンジンは採用しない。今回必要なレンダリングループ、シーングラフ、タップ判定はReact Three Fiberで扱え、移動と簡易衝突判定はZustandと軽量な更新処理で実装できるためである。

### 3.3 カメラと座標系

- XZ平面を地面とし、Y軸を高さとして扱う
- `OrthographicCamera`を斜め上から見下ろす角度で配置する
- プレイヤーのXZ座標を基準にカメラを追従させる
- ゲームロジック上の座標はワールド座標に統一し、画面ピクセル座標を状態として保持しない

`PerspectiveCamera`は距離による見た目の差が大きく、2Dゲームに近い見た目を保ちにくいため、初期実装では使用しない。

## 4. コンポーネント構成

実装時は、画面・3D表現・ゲームロジック・データを分離する。

```text
app/
└── main-child.tsx                 # 画面の入口、ルーティングとの接続
components/rpg-hub/
├── RpgHubScene.tsx                # Canvas、カメラ、照明の構成
├── Player.tsx                     # モデル、アニメーション、表示
├── MapObjectMesh.tsx              # 建物・装飾・NPCの表示とタップ
├── InteractionPrompt.tsx          # 「入る」等のネイティブUI
└── VirtualPad.tsx                 # 移動入力UI
store/
├── playerStore.ts                 # プレイヤー位置・向き・移動状態
└── mapStore.ts                    # マップオブジェクト・季節
types/
└── map.ts                         # マップ関連の型
lib/rpg-hub/
├── collision.ts                   # 純粋関数による衝突・接近判定
└── season.ts                      # 日付・イベントから季節を決定
```

実際のファイル追加は各実装Issueで行う。既存の`main-child.tsx`は画面の入口に留め、3Dシーンや判定ロジックを直接集約しない。

## 5. データ設計

### 5.1 型定義

位置は3D描画の座標系に合わせて`x`, `y`, `z`を持たせる。衝突判定は地面上の`x`, `z`を使用する。

```ts
type Season = 'spring' | 'summer' | 'autumn' | 'winter';

type MapObjectType = 'building' | 'decoration' | 'npc';

type MapObject = {
  id: string;
  type: MapObjectType;
  position: { x: number; y: number; z: number };
  rotationY?: number;
  scale?: number;
  model: string;
  seasonalModel?: Partial<Record<Season, string>>;
  seasonalTexture?: Partial<Record<Season, string>>;
  route?: string;
  interactive: boolean;
  collidable: boolean;
  collisionSize?: { width: number; depth: number };
  interactionRadius?: number;
};
```

`route`は任意文字列を無条件に遷移させず、アプリ内で許可したルートへ変換・検証してから`router.push()`へ渡す。Supabase連携後も、データ変更だけで想定外の画面へ遷移できないようにする。

### 5.2 状態の責務

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

- `playerStore`はゲーム進行に必要な論理状態のみ保持する
- モデル、テクスチャ、Three.jsオブジェクトなどシリアライズできない値はZustandへ格納しない
- `mapStore`は取得済みのマップデータと現在の季節を保持する
- 毎フレーム変わる表示用の一時値は、必要以上にReactの再レンダリングを発生させないようR3F側のrefで扱う

初期MVPではローカル定数からマップを読み込み、データ構造と表示を確定してからSupabaseの`map_objects`テーブルへ移行する。

## 6. インタラクション

### 6.1 建物のタップ

各建物メッシュにR3Fのポインターイベントを設定する。対象が`interactive: true`かつ許可済みの`route`を持つ場合に画面遷移する。

連続タップによる多重遷移を防ぐため、遷移開始後は入力を一時的に無効化する。

### 6.2 建物への接近

移動中にプレイヤーとインタラクティブなオブジェクトの距離を比較し、`interactionRadius`内に入った対象を`nearbyObjectId`へ設定する。接近だけでは自動遷移せず、「入る」「話す」などのボタンを表示する。

自動遷移を採用しない理由は、建物の近くを通過しただけで画面が切り替わる誤操作を防ぐためである。

### 6.3 移動と衝突

- 仮想パッドまたはPanGestureの入力を移動ベクトルへ変換する
- フレーム時間を考慮して移動量を計算する
- 移動候補座標と`collidable: true`のオブジェクトをAABBで判定する
- 衝突する場合は移動をキャンセルする
- 判定ロジックはThree.jsに依存しない純粋関数としてテストする

## 7. 季節システム

`currentSeason`の変更時に、オブジェクトの`seasonalModel`または`seasonalTexture`を参照する。季節用アセットがない場合は通常の`model`とマテリアルへフォールバックする。

季節に応じて次の要素を変更できるようにする。

- 地形と建物のテクスチャ
- 木、花、雪などの装飾
- 背景色、環境光、平行光源の色と強さ

同一モデルのテクスチャ差し替えでは、ジオメトリを再生成せずマテリアルを更新する。季節の決定方法は表示から分離し、現実の日付連動とアプリ内イベント連動のどちらにも対応できるようにする。

## 8. パフォーマンス方針

- 木や街灯など同じ形状を繰り返す装飾は`InstancedMesh`で描画する
- モデルとテクスチャはキャッシュし、フレームごとの再読み込みを避ける
- R3Fの`frustumCulling`を利用する
- マップ拡大後は、プレイヤー周辺のオブジェクトだけを判定・描画対象にする空間分割を検討する
- Zustandの毎フレーム更新と全コンポーネントの再レンダリングを避ける
- 技術検証時に開発ビルドとリリース相当ビルドの両方でFPSとメモリ使用量を確認する

## 9. 技術検証

本実装の前に、キャラクター1体と建物1個だけの最小シーンを作成し、iOSとAndroidの実機で検証する。Expo Goで動かないネイティブ依存がある場合はDevelopment Buildを使用する。

### 検証項目

- アプリ起動後にGLコンテキストが安定して生成される
- `.glb`モデルと簡易建物を同時に表示できる
- OrthographicCameraで意図した見た目になる
- 建物のタップからExpo Routerで遷移できる
- 画面遷移後に戻ってもシーンを再表示できる
- iOSとAndroidでクラッシュや重大な描画崩れがない
- 連続操作中も許容できるフレームレートを維持できる
- 開発ビルドとリリース相当ビルドで結果に重大な差がない

### 合否判断

両OSで上記項目を満たした場合に単一R3Fシーン方式を採用確定とし、動作した依存バージョン、端末、OS、ビルド方式を検証IssueまたはPRへ記録する。

依存関係の調整を行っても一方のOSで安定しない場合は、本実装へ進まず保険案を評価する。

## 10. 保険案

単一R3Fシーン方式が実機で成立しない場合に限り、WebView内でBabylon.jsまたはPlayCanvasを動かす方式を再検討する。

この方式はネイティブGLブリッジの問題を避けられる一方、次のコストがある。

- React Native側の画面遷移やZustandとのブリッジ通信が必要
- NativeWindで構築したUIとの統合が複雑になる
- タップや状態同期の応答性が下がる可能性がある
- WebViewとゲーム側でエラー監視・ライフサイクル管理が分かれる

そのため、技術検証の失敗内容と代替方式の追加コストを記録し、別Issueで採否を決定する。

## 11. 実装順序

1. 実機で依存関係と最小3Dシーンを技術検証する
2. OrthographicCameraとプレイヤー移動を実装する
3. ローカルの`MapObject`データから建物を描画し、タップ遷移を実装する
4. 接近判定とインタラクトUIを実装する
5. 装飾物とのAABB衝突判定を実装する
6. 季節によるテクスチャ・装飾・照明の切り替えを実装する
7. マップデータをSupabaseから取得する
8. 実機計測を基に描画と判定を最適化する

各段階は個別Issueに分割し、技術検証が完了するまで大規模なアセット制作やSupabaseのスキーマ追加を開始しない。

## 12. 今回の対象外

- 3D関連パッケージの追加とバージョン確定
- 3Dモデルや季節アセットの制作
- RPGハブ画面の実装
- Supabaseの`map_objects`テーブル作成
- クエスト、銀行、ストア各画面の仕様変更

これらは本設計と技術検証結果を前提に、後続Issueで対応する。
