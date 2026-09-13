// RPGハブ（WebView + Babylon.js）で WebView に読み込ませる HTML を組み立てる。
//
// - Babylon.js の UMD（assets/babylon-spike/babylon.txt）と、バンドル済みのシーン
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
 * WebView に渡す HTML 全体を組み立てる。
 * @param babylonSource - Babylon.js の UMD ソース
 * @param sceneSource - バンドル済みのシーンスクリプト
 * @returns 自己完結した HTML 文字列
 */
export function buildRpgHubHtml(babylonSource: string, sceneSource: string): string {
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
    <script>${escapeClosingScript(babylonSource)}</script>
    <script>${escapeClosingScript(sceneSource)}</script>
  </body>
</html>`;
}
