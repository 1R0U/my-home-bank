// 更衣室のプレビュー（Issue #344）を描く WebView 側のスクリプト。
//
// 更衣室で選んだ着せ替え品を、保存する前にキャラクターに着せて見せるためのもの。
// 町・建物・住人は作らず、キャラクター1体と足元の円だけを描く。
//
// **町と見た目をずらさないため、組み立ては肖像（portrait.ts）と同じ `createCharacter` を使う。**
// 照明も季節ごとの値と日差しの向きを町と同じにする。
//
// 視点だけは町と違う。子供が指でぐるっと回して全体（背中のものも）を見られるよう、
// キャラクターの周りを回るカメラ（ArcRotateCamera）にしてある。
//   - 回転: 横方向（キャラクターの周りを一周）と、上下方向（真上近くから真横まで）
//   - ズーム: ピンチで寄ったり引いたりできる。寄りすぎ・引きすぎは止める
//   - 平行移動: しない。キャラクターが画面から外れて戻せなくなるため
//
// scene.ts と同じく esbuild でバンドルし（scripts/build-rpg-scene.mjs）、Babylon 本体は
// 同じ HTML に UMD でインラインされている前提でグローバルの BABYLON を参照する。

import type { PortraitLook } from "../../lib/rpg-hub/portraitBridge";
import { SEASON_LIGHTING, SUN_DIRECTION } from "../../lib/rpg-hub/seasonalLook";
import {
  encodeWardrobePreviewMessage,
  parseWardrobePreviewIntent,
  type WardrobePreviewEvent,
} from "../../lib/rpg-hub/wardrobePreviewBridge";
import { createCharacter, toColor3 } from "./partMesh";

declare const BABYLON: any;

/**
 * 最初にカメラを置く向き（水平方向の角度、ラジアン）。
 * ArcRotateCamera の alpha は +X から測るので、π/2 で正面（キャラクターが向いている +Z側）になる。
 */
const INITIAL_ALPHA = Math.PI / 2;

/**
 * 最初のカメラの上下の角度（真上からの角度、ラジアン）。
 * 真横（π/2）より少しだけ上から見下ろし、頭の上の目（カエル）や帽子が見えるようにする。
 */
const INITIAL_BETA = Math.PI / 2.4;

/**
 * 上下に回せる範囲（真上からの角度、ラジアン）。
 * 上は真上の少し手前まで。真上ちょうどにすると、横回転の向きが急に変わって扱いにくい。
 * 下は真横まで。それより下から見上げると、足元の円がキャラクターを隠してしまう。
 */
const MIN_BETA = 0.2;
const MAX_BETA = Math.PI / 2;

/** キャラクターの外側に取る余白の割合。1で余白なし。帽子や耳が画面の端で切れないようにする */
const FRAME_MARGIN = 1.25;

/** いちばん寄ったときの距離（最初の距離に対する割合）。顔まわりの着せ替え品が大きく見える程度 */
const MIN_ZOOM_RATIO = 0.45;

/** いちばん引いたときの距離（最初の距離に対する割合）。小さくなりすぎて見えなくならない程度 */
const MAX_ZOOM_RATIO = 1.6;

/** 足元の円の色。背景（sceneHtml.ts の WARDROBE_PREVIEW_BACKGROUND）より少し濃くする */
const FLOOR_COLOR = "#bfe3f5";

/** 足元の円の半径（キャラクターの横幅に対する割合） */
const FLOOR_RADIUS_RATIO = 0.9;

declare global {
  interface Window {
    ReactNativeWebView?: { postMessage: (message: string) => void };
  }
}

function postToRN(event: WardrobePreviewEvent): void {
  window.ReactNativeWebView?.postMessage(encodeWardrobePreviewMessage(event));
}

function main(): void {
  const canvas = document.getElementById("renderCanvas") as HTMLCanvasElement | null;
  if (!canvas) {
    postToRN({ event: "error", message: "renderCanvas が見つかりません" });
    return;
  }
  if (typeof BABYLON === "undefined") {
    postToRN({ event: "error", message: "BABYLON グローバルが読み込まれていません" });
    return;
  }

  // 描画バッファは保持しない（scene.ts と同じ理由）。
  // 最後の true は「端末のピクセル密度に合わせる」。画面に直接映すので、粗く見えないようにする
  const engine = new BABYLON.Engine(
    canvas,
    true,
    { powerPreference: "high-performance", preserveDrawingBuffer: false, stencil: false },
    true,
  );
  const scene = new BABYLON.Scene(engine);
  // 我が家タウンと同じく右手系にする。左手系だと Z 軸が反転して、左右が裏返った姿になる。
  scene.useRightHandedSystem = true;
  // 背景は HTML 側の背景色を透かして見せる（読み込み中と描画後で色が変わらないように）
  scene.clearColor = new BABYLON.Color4(0, 0, 0, 0);

  const camera = new BABYLON.ArcRotateCamera(
    "camera",
    INITIAL_ALPHA,
    INITIAL_BETA,
    10,
    BABYLON.Vector3.Zero(),
    scene,
  );
  camera.minZ = 0.05;
  camera.lowerBetaLimit = MIN_BETA;
  camera.upperBetaLimit = MAX_BETA;
  // 平行移動はしない（2本指で動かしてもキャラクターが中心から外れないように）
  camera.panningSensibility = 0;
  // ズームの速さを今の距離に比例させる。決め打ちの量だと、寄ったときだけ急に動いて見える
  camera.pinchDeltaPercentage = 0.004;
  camera.wheelDeltaPercentage = 0.01;
  camera.attachControl(canvas, true);

  const ambient = new BABYLON.HemisphericLight("ambient", new BABYLON.Vector3(0, 1, 0), scene);
  const sun = new BABYLON.DirectionalLight(
    "sun",
    new BABYLON.Vector3(SUN_DIRECTION.x, SUN_DIRECTION.y, SUN_DIRECTION.z),
    scene,
  );

  /** いま描いているキャラクター。見た目が変わったら作り直すため持っておく */
  let character: any = null;
  /** 足元の円。キャラクターの大きさに合わせて作り直す */
  let floor: any = null;
  /**
   * カメラを合わせたときの種類。**種類が同じ間はカメラを合わせ直さない。**
   * 着せ替えるたびに向きや距離が戻ると、背中を見ながら選んでいたのに正面へ戻されてしまう。
   */
  let framedCharacterType: string | null = null;

  /**
   * キャラクター全体（装備を含む）が収まるようにカメラの注視点と距離を合わせ、
   * 足元に円を置く。
   */
  function frameCharacter(): void {
    character.getChildMeshes().forEach((mesh: any) => mesh.computeWorldMatrix(true));
    // 分割代入はバンドルの対象環境へ変換できないので使わない（AGENTS.md「PR前チェック」）
    const bounds = character.getHierarchyBoundingVectors(true);
    const min = bounds.min;
    const max = bounds.max;
    const center = min.add(max).scale(0.5);
    const size = max.subtract(min);

    // どの向きから見ても収まるよう、外接する球の半径で距離を決める。
    // 画面の縦横のうち狭いほうの視野角に合わせる（fov は縦方向の値）
    const radius = size.length() / 2;
    const aspect = engine.getAspectRatio(camera);
    const halfFov = Math.min(camera.fov, camera.fov * aspect) / 2;
    const distance = (radius / Math.sin(halfFov)) * FRAME_MARGIN;

    camera.setTarget(center);
    camera.alpha = INITIAL_ALPHA;
    camera.beta = INITIAL_BETA;
    camera.radius = distance;
    camera.lowerRadiusLimit = distance * MIN_ZOOM_RATIO;
    camera.upperRadiusLimit = distance * MAX_ZOOM_RATIO;

    if (floor) floor.dispose(false, true);
    floor = BABYLON.MeshBuilder.CreateDisc(
      "floor",
      { radius: Math.max(size.x, size.z) * FLOOR_RADIUS_RATIO, tessellation: 48 },
      scene,
    );
    // 円は XY 平面に作られるので、寝かせて足元に置く
    floor.rotation.x = Math.PI / 2;
    floor.position.set(center.x, min.y - 0.001, center.z);
    const floorMaterial = new BABYLON.StandardMaterial("floor-mat", scene);
    floorMaterial.diffuseColor = toColor3(FLOOR_COLOR);
    floorMaterial.specularColor = new BABYLON.Color3(0, 0, 0);
    floorMaterial.backFaceCulling = false;
    floor.material = floorMaterial;
  }

  /**
   * 見た目を受け取って、キャラクターを組み立て直す。
   * @param look - 映す見た目
   */
  function showLook(look: PortraitLook): void {
    // **新しい姿を作り終えてから、前の姿を捨てる。** 先に捨てると、組み立てに失敗したときに
    // 前の姿も消えて何も映らなくなる。失敗したら前の姿を映したまま、RN へ失敗を知らせる
    // （作りかけは createCharacter が片付ける。PR #346 レビュー対応）
    const next = createCharacter(look, "character", scene);
    if (character) character.dispose(false, true);
    character = next;

    const lighting = SEASON_LIGHTING[look.season];
    ambient.intensity = lighting.ambient.intensity;
    ambient.diffuse = toColor3(lighting.ambient.color);
    ambient.groundColor = toColor3(lighting.ambient.groundColor);
    sun.intensity = lighting.sun.intensity;
    sun.diffuse = toColor3(lighting.sun.color);

    if (framedCharacterType !== look.characterType) {
      frameCharacter();
      framedCharacterType = look.characterType;
    }
  }

  /**
   * 意図を受け取る。
   * @param raw - message イベントで受け取った値
   */
  function handleIntent(raw: unknown): void {
    const result = parseWardrobePreviewIntent(raw);
    if ("errors" in result) {
      postToRN({ event: "error", message: result.errors.join(" / ") });
      return;
    }
    try {
      showLook(result.intent.look);
    } catch (error) {
      postToRN({ event: "error", message: error instanceof Error ? error.message : String(error) });
    }
  }

  // react-native-webview の postMessage は Android / iOS で window / document の
  // どちらに message を飛ばすか差があるため両方で受ける（scene.ts と同じ）。
  window.addEventListener("message", (e) => handleIntent((e as MessageEvent).data));
  document.addEventListener("message", (e) => handleIntent((e as unknown as MessageEvent).data));
  window.addEventListener("resize", () => engine.resize());

  engine.runRenderLoop(() => scene.render());

  scene.executeWhenReady(() => {
    postToRN({ event: "ready" });
  });
}

window.onerror = (message) => {
  postToRN({ event: "error", message: String(message) });
};

main();
