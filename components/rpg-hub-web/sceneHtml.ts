// RPGハブ（WebView + Babylon.js）で WebView に読み込ませる HTML を組み立てる。
//
// - Babylon.js の UMD（assets/babylon/babylon.txt）と、バンドル済みのシーン
//   （assets/rpg-hub/scene.txt）を丸ごとインラインし、外部リソースを一切読み込まない
//   自己完結の HTML にする（オフライン動作と file アクセス権限差の回避）。
// - シーンの実装は webview/rpg-hub/scene.ts。ここでは器だけを用意する。

/**
 * `<script>` の早期終了を防ぐため、インライン JS 内の `</script` を無害化する。
 * @param source - インラインする JavaScript ソース
 * @returns エスケープ済みソース
 */
function escapeClosingScript(source: string): string {
  return source.replace(/<\/script/gi, "<\\/script");
}

/**
 * シーンの使い方（Issue #309）。
 * - `hub`: 我が家タウン。プレイヤーを操作して歩き回る
 * - `title`: タイトル画面の背景。プレイヤーを出さず、町の中に立った目の高さの固定の視点から映す。タップにも反応しない
 */
export type RpgHubSceneMode = "hub" | "title";

/**
 * WebView に渡す HTML 全体を組み立てる。
 * @param babylonSource - Babylon.js の UMD ソース
 * @param sceneSource - バンドル済みのシーンスクリプト
 * @param characterType - プレイヤーの見た目の種類（Issue #287）。シーンの立ち上げ時に
 *   一度だけ読む値のため、意図（postMessage）ではなくHTMLへ埋め込んで渡す。
 * @param mode - シーンの使い方。characterType と同じく立ち上げ時に一度だけ読む
 * @returns 自己完結した HTML 文字列
 */
export function buildRpgHubHtml(
  babylonSource: string,
  sceneSource: string,
  characterType: string,
  mode: RpgHubSceneMode = "hub",
): string {
  return `<!doctype html>
<html>
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1, maximum-scale=1, user-scalable=no" />
    <style>
      html, body { margin: 0; padding: 0; width: 100%; height: 100%; overflow: hidden; background: #dff4ff; }
      #renderCanvas { width: 100%; height: 100%; display: block; touch-action: none; }
    </style>
  </head>
  <body>
    <canvas id="renderCanvas"></canvas>
    <script>window.__RPG_HUB_INITIAL_CHARACTER_TYPE__ = ${JSON.stringify(characterType)};</script>
    <script>window.__RPG_HUB_MODE__ = ${JSON.stringify(mode)};</script>
    <script>${escapeClosingScript(babylonSource)}</script>
    <script>${escapeClosingScript(sceneSource)}</script>
  </body>
</html>`;
}

/**
 * キャラクターの肖像（Issue #306）の画像の一辺（px）。
 * 設定画面のアイコン（直径96）を3倍密度の端末で出しても粗くならない大きさにしてある。
 */
export const PORTRAIT_IMAGE_SIZE = 320;

/**
 * キャラクターの肖像（Issue #306）を描くための HTML を組み立てる。
 *
 * 我が家タウンと同じく Babylon.js とバンドル済みのスクリプト（assets/rpg-hub/portrait.txt）を
 * インラインした自己完結の HTML にする。**キャンバスの大きさは固定**で、これがそのまま
 * 画像の大きさになる（WebView 自体の大きさや端末のピクセル密度には左右されない）。
 * 背景は透明にして、アイコンの丸の色は RN 側で決める。
 * @param babylonSource - Babylon.js の UMD ソース
 * @param portraitSource - バンドル済みの肖像スクリプト
 * @returns 自己完結した HTML 文字列
 */
export function buildPortraitHtml(babylonSource: string, portraitSource: string): string {
  return `<!doctype html>
<html>
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1, maximum-scale=1, user-scalable=no" />
    <style>
      html, body { margin: 0; padding: 0; overflow: hidden; background: transparent; }
      #renderCanvas { width: ${PORTRAIT_IMAGE_SIZE}px; height: ${PORTRAIT_IMAGE_SIZE}px; display: block; }
    </style>
  </head>
  <body>
    <canvas id="renderCanvas"></canvas>
    <script>${escapeClosingScript(babylonSource)}</script>
    <script>${escapeClosingScript(portraitSource)}</script>
  </body>
</html>`;
}
