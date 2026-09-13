// Babylon スパイク（/babylon-spike）で WebView に読み込ませる HTML を組み立てる。
//
// - Babylon.js の UMD ソース（assets/babylon-spike/babylon.txt の中身）を丸ごとインラインし、
//   外部リソースを一切読み込まない自己完結の HTML にする（オフライン・file アクセス権限差の回避）。
// - シーンは「灰色の地面 + カプセル1体 + 固定カメラ」のみ。3Dモデル・テクスチャは使わない。
// - RN ⇄ WebView は意図(intent)/イベント(event)レベルの JSON のみ（lib/babylon-spike/bridge.ts と対応）。

/**
 * `<script>` の早期終了を防ぐため、インライン JS 内の `</script` を無害化する。
 * @param source - インラインする JavaScript ソース
 * @returns エスケープ済みソース
 */
function escapeClosingScript(source: string): string {
  return source.replace(/<\/script/gi, "<\\/script");
}

/** WebView 内で動くシーン本体（Babylon UMD 読み込み後に実行される）。 */
const SCENE_SCRIPT = String.raw`
(function () {
  "use strict";

  function postToRN(payload) {
    if (window.ReactNativeWebView && window.ReactNativeWebView.postMessage) {
      window.ReactNativeWebView.postMessage(JSON.stringify(payload));
    }
  }

  window.onerror = function (message) {
    postToRN({ event: "error", message: String(message) });
  };

  var canvas = document.getElementById("renderCanvas");
  var balanceEl = document.getElementById("balance");

  if (!window.BABYLON) {
    postToRN({ event: "error", message: "BABYLON グローバルが読み込まれていません" });
    return;
  }

  var engine = new BABYLON.Engine(canvas, true, { preserveDrawingBuffer: true, stencil: true });
  var scene = new BABYLON.Scene(engine);
  scene.clearColor = new BABYLON.Color4(0.53, 0.81, 0.92, 1);

  // 固定カメラ（操作は受け付けない）
  var camera = new BABYLON.FreeCamera("camera", new BABYLON.Vector3(0, 6, -10), scene);
  camera.setTarget(BABYLON.Vector3.Zero());

  var light = new BABYLON.HemisphericLight("light", new BABYLON.Vector3(0, 1, 0), scene);
  light.intensity = 0.95;

  // 灰色の地面
  var ground = BABYLON.MeshBuilder.CreateGround("ground", { width: 12, height: 12 }, scene);
  var groundMat = new BABYLON.StandardMaterial("groundMat", scene);
  groundMat.diffuseColor = new BABYLON.Color3(0.6, 0.6, 0.6);
  ground.material = groundMat;

  // カプセル1体（プレイヤー相当）
  var player = BABYLON.MeshBuilder.CreateCapsule("player", { radius: 0.5, height: 2 }, scene);
  player.position.y = 1;
  var playerMat = new BABYLON.StandardMaterial("playerMat", scene);
  playerMat.diffuseColor = new BABYLON.Color3(0.85, 0.3, 0.3);
  player.material = playerMat;

  // タップ判定: カプセルが pick されたら RN へイベントを返す
  scene.onPointerObservable.add(function (pointerInfo) {
    if (pointerInfo.type !== BABYLON.PointerEventTypes.POINTERPICK) return;
    var picked = pointerInfo.pickInfo && pointerInfo.pickInfo.pickedMesh;
    if (picked && picked.name === "player") {
      postToRN({ event: "tapped", id: "player" });
    }
  });

  engine.runRenderLoop(function () {
    scene.render();
  });

  window.addEventListener("resize", function () {
    engine.resize();
  });

  // RN → WebView の意図を適用する
  function applyIntent(raw) {
    var data;
    try {
      data = typeof raw === "string" ? JSON.parse(raw) : raw;
    } catch (e) {
      return;
    }
    if (!data || typeof data !== "object") return;
    if (data.type === "setBalance" && typeof data.value === "number" && isFinite(data.value)) {
      balanceEl.textContent = "残高: " + data.value;
    }
  }

  // react-native-webview の postMessage は Android/iOS で window / document の
  // どちらに message を飛ばすか差があるため両方で受ける
  window.addEventListener("message", function (e) { applyIntent(e.data); });
  document.addEventListener("message", function (e) { applyIntent(e.data); });

  scene.executeWhenReady(function () {
    postToRN({ event: "ready" });
  });
})();
`;

/**
 * WebView に渡す HTML 全体を組み立てる。
 * @param babylonSource - Babylon.js の UMD ソース（assets/babylon-spike/babylon.txt の中身）
 * @returns 自己完結した HTML 文字列
 */
export function buildSceneHtml(babylonSource: string): string {
  return `<!doctype html>
<html>
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1, maximum-scale=1, user-scalable=no" />
    <style>
      html, body { margin: 0; padding: 0; width: 100%; height: 100%; overflow: hidden; background: #87ceeb; }
      #renderCanvas { width: 100%; height: 100%; display: block; touch-action: none; }
      #balance {
        position: absolute; left: 12px; top: 12px; padding: 6px 10px;
        font-family: -apple-system, Roboto, sans-serif; font-size: 16px;
        color: #fff; background: rgba(15, 23, 42, 0.6); border-radius: 8px;
      }
    </style>
  </head>
  <body>
    <canvas id="renderCanvas"></canvas>
    <div id="balance">残高: -</div>
    <script>${escapeClosingScript(babylonSource)}</script>
    <script>${escapeClosingScript(SCENE_SCRIPT)}</script>
  </body>
</html>`;
}
