# RPGハブ 技術検証記録

Issue #48 で導入した最小R3Fシーンの依存関係と検証状況を記録する。

## 依存関係

| 区分 | パッケージ | 解決バージョン |
| --- | --- | --- |
| Expo | `expo` | `54.0.36` |
| React | `react` / `react-dom` | `19.1.0` / `19.1.0` |
| React Native | `react-native` | `0.81.5` |
| 3D | `three` | `0.180.0` |
| React Three Fiber | `@react-three/fiber` | `9.7.0` |
| ネイティブGL | `expo-gl` | `16.0.10` |

正確な依存関係は `package-lock.json` を正とする。`react-dom` はR3Fのpeer dependency解決時にReact 19.2系が選ばれないよう、プロジェクトのReactと同じ19.1系へ固定した。

## 今回確認した内容

- `npx expo install --check` でExpo SDKとの依存整合性を確認
- Android向けのMetroバンドル生成を確認
- TypeScript型チェックと純粋ロジックの自動テストを実行
- プリミティブ形状によるプレイヤー、建物、装飾、地面を単一R3Fシーンに配置
- OrthographicCamera、建物タップ遷移、仮想パッド移動を実装

## 実機確認で記録する項目

### 実施済み

| 端末 | OS | ビルド種別 | 確認結果 |
| --- | --- | --- | --- |
| iPhone 14 | iOS 26.6 | Expo Go | 移動操作、ドラッグ中のカーソル表示を確認 |
| Galaxy A22 5G | Android 13 | Expo Go | 移動操作、ドラッグ中のカーソル表示を確認 |

### 未実施

次の項目はDevelopment Build / リリース相当ビルドでの確認と性能測定が必要なため、このPRでは未完了とする。確認時に端末名、OSバージョン、ビルド種別と結果を追記する。

- iOS / Androidでの起動とGLコンテキスト生成
- 建物タップによる各画面への遷移と、復帰後の入力ロック解除
- 30分操作時のFPS、フレーム時間、メモリ、クラッシュ有無
- バックグラウンド復帰と画面再表示の10回反復
- 初回起動時間と2D画面との差分

`.glb`アセットは今回の土台では導入せず、プリミティブ形状を使用する。後続で導入する場合はリポジトリ内の `assets/` に配置し、Metro設定、破損時のプレースホルダー、再試行上限を合わせて検証する。

## 2D比較用画面

「初回起動時間と2D画面との差分」の比較基準となる2D版の子供用ホーム画面は、#98時点で `main-child.tsx` がRPGハブ（3D）自体に置き換わったため存在しない状態だった。そのため、RPGハブと同じデータ（`store/mapStore.ts`、`types/map.ts` の `MAP_ROUTES`）・同じ遷移ロジック（`navigationLocked` による多重遷移防止）を再利用し、表現層のみプレーンなReact Native View（NativeWind）にした比較用画面 `ChildHomeScreen2D`（ルート: `/main-child-2d`、開発ナビからも遷移可）を追加した。3Dシーンのレンダリングコストだけを比較対象として切り出す狙い。

実機でのDevelopment Build / リリース相当ビルドの作成（EAS Build）とコールドスタート・メモリの実測は、本リポジトリに `eas.json` 等のEAS設定が未整備で、Apple/Google開発者アカウントのセットアップが別途必要なため、このPRの範囲外とする。ビルド設定の用意と実機測定は後続の作業として残す。
