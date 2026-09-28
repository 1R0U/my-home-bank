// キャラクターの肖像（Issue #306）を描く WebView 側のスクリプト。
//
// ホーム画面・設定画面のアイコンに、我が家タウンと同じ姿のキャラクターを出すためのもの。
// 町・建物・住人は作らず、キャラクター1体だけを透明な背景に描いて、PNG の data URL を
// RN へ返す。RN 側は受け取った画像を `<Image>` で出す（components/CharacterAvatar.tsx）。
//
// **町と見た目をずらさないため、形・色・装備の組み立ては我が家タウンと同じものを使う。**
//   - 形: catalog.ts の getBuildingParts（CHARACTER_TYPE_ASSET_IDS から引く）
//   - 色: palette.ts の resolvePartColor
//   - 装備: partMesh.ts の attachEquipment（付く位置は equipment.ts が決める）
//   - メッシュ: partMesh.ts の createPartMesh
//   - 照明: seasonalLook.ts の季節ごとの値と、同じ日差しの向き
//   - 視点: 顔が見えるよう、正面（+Z側）の少し上から見る。町のカメラ（斜め上）とはここだけ違う
// 影だけは描かない。地面が無いので、影を落とす先がないため。
//
// scene.ts と同じく esbuild でバンドルし（scripts/build-rpg-scene.mjs）、Babylon 本体は
// 同じ HTML に UMD でインラインされている前提でグローバルの BABYLON を参照する。

import { getBuildingParts } from "../../lib/rpg-hub/catalog";
import { CHARACTER_TYPE_ASSET_IDS } from "../../lib/rpg-hub/characterTypes";
import { resolvePartColor } from "../../lib/rpg-hub/palette";
import {
  encodePortraitMessage,
  parsePortraitIntent,
  type PortraitEvent,
  type PortraitLook,
} from "../../lib/rpg-hub/portraitBridge";
import { SEASON_LIGHTING, SUN_DIRECTION } from "../../lib/rpg-hub/seasonalLook";
import { attachEquipment, createPartMesh, toColor3 } from "./partMesh";

declare const BABYLON: any;

/**
 * カメラを置く向き。アイコンでは顔が見えるよう、**正面（キャラクターが向いている +Z側）**に置く。
 *
 * 少しだけ上げて見下ろすのは、頭の上の目（カエル）や帽子のつばが見えるようにするため。
 * これ以上上げると、カエルのめがねが目に重なって顔が隠れる。
 * 真横（±X）からは見ない。キャラクターは「上面と +X面・+Z面」が見える前提で作ってあり、
 * 正面からなら、作り込んでいない -X面は映らない。
 */
const CAMERA_DIRECTION = { x: 0, y: 0.35, z: 1 };

/** カメラをキャラクターの中心からどれだけ離すか。正射影なので写る大きさには関わらない。 */
const CAMERA_DISTANCE = 20;

/**
 * キャラクターの外側に取る余白の割合。1で余白なし。
 * アイコンは丸く切り抜いて出すので、四隅が欠けても耳や帽子が切れないようにしておく。
 */
const FRAME_MARGIN = 1.18;

declare global {
  interface Window {
    ReactNativeWebView?: { postMessage: (message: string) => void };
  }
}

function postToRN(event: PortraitEvent): void {
  window.ReactNativeWebView?.postMessage(encodePortraitMessage(event));
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

  // 描画バッファは保持しない。描いた直後、同じ処理の中で toDataURL を呼べば読み出せる。
  // 保持を頼むと環境によってはアンチエイリアスが効かなくなる（scene.ts と同じ理由）。
  // 最後の false は「端末のピクセル密度に合わせない」。キャンバスのCSSの大きさ（sceneHtml 側で
  // 決めた固定値）をそのまま画像の大きさにするため。
  const engine = new BABYLON.Engine(
    canvas,
    true,
    { alpha: true, powerPreference: "high-performance", preserveDrawingBuffer: false, stencil: false },
    false,
  );
  const scene = new BABYLON.Scene(engine);
  // 我が家タウンと同じく右手系にする。左手系だと Z 軸が反転して、左右が裏返った姿になる。
  scene.useRightHandedSystem = true;
  // 背景は透明にする。アイコンの丸の色は RN 側で決める
  scene.clearColor = new BABYLON.Color4(0, 0, 0, 0);

  const camera = new BABYLON.FreeCamera("camera", new BABYLON.Vector3(9, 11, 9), scene);
  camera.mode = BABYLON.Camera.ORTHOGRAPHIC_CAMERA;
  camera.minZ = 0.1;
  camera.maxZ = CAMERA_DISTANCE * 2;

  const ambient = new BABYLON.HemisphericLight("ambient", new BABYLON.Vector3(0, 1, 0), scene);
  const sun = new BABYLON.DirectionalLight(
    "sun",
    new BABYLON.Vector3(SUN_DIRECTION.x, SUN_DIRECTION.y, SUN_DIRECTION.z),
    scene,
  );

  /** いま描いているキャラクター。次の依頼で作り直すため持っておく */
  let character: any = null;
  /**
   * 何番目の依頼か。描き終わる前に次の依頼が来たら、前の依頼のぶんは返さない。
   * 返すと、新しい姿を描いた画像に前の依頼のキーが付いてしまう。
   */
  let requestCount = 0;

  /**
   * キャラクターを組み立て直す。
   * @param look - 描く見た目
   */
  function buildCharacter(look: PortraitLook): void {
    if (character) character.dispose(false, true);

    const assetId = CHARACTER_TYPE_ASSET_IDS[look.characterType];
    character = new BABYLON.TransformNode("character", scene);
    getBuildingParts(assetId).forEach((part, index) => {
      const mesh = createPartMesh(
        part,
        scene,
        `character-part-${index}`,
        resolvePartColor(part, look.palette),
      );
      mesh.parent = character;
    });
    attachEquipment(character, assetId, look.equipment, "character-equip", scene, () => {});

    const lighting = SEASON_LIGHTING[look.season];
    ambient.intensity = lighting.ambient.intensity;
    ambient.diffuse = toColor3(lighting.ambient.color);
    ambient.groundColor = toColor3(lighting.ambient.groundColor);
    sun.intensity = lighting.sun.intensity;
    sun.diffuse = toColor3(lighting.sun.color);
  }

  /**
   * キャラクター全体（装備を含む）がちょうど収まるようにカメラを合わせる。
   *
   * 帽子の有無や種類で高さが変わるので、決め打ちの大きさにせず毎回測る。
   * 画面上の縦横のうち長いほうに合わせ、中心から上下左右に同じだけ取る。
   */
  function frameCharacter(): void {
    character.getChildMeshes().forEach((mesh: any) => mesh.computeWorldMatrix(true));
    // 分割代入はバンドルの対象環境へ変換できないので使わない（AGENTS.md「PR前チェック」）
    const bounds = character.getHierarchyBoundingVectors(true);
    const min = bounds.min;
    const max = bounds.max;
    const center = min.add(max).scale(0.5);

    const direction = new BABYLON.Vector3(
      CAMERA_DIRECTION.x,
      CAMERA_DIRECTION.y,
      CAMERA_DIRECTION.z,
    ).normalize();
    camera.position = center.add(direction.scale(CAMERA_DISTANCE));
    camera.setTarget(center);

    // 外接する箱の8つの角を、カメラから見た座標に直して、画面上の広がりを測る
    const view = camera.getViewMatrix(true);
    let half = 0;
    [min.x, max.x].forEach((x: number) => {
      [min.y, max.y].forEach((y: number) => {
        [min.z, max.z].forEach((z: number) => {
          const point = BABYLON.Vector3.TransformCoordinates(new BABYLON.Vector3(x, y, z), view);
          half = Math.max(half, Math.abs(point.x), Math.abs(point.y));
        });
      });
    });
    half *= FRAME_MARGIN;
    camera.orthoLeft = -half;
    camera.orthoRight = half;
    camera.orthoBottom = -half;
    camera.orthoTop = half;
  }

  /**
   * 依頼を受けて1枚描き、画像を RN へ返す。
   * @param raw - message イベントで受け取った値
   */
  function handleIntent(raw: unknown): void {
    const result = parsePortraitIntent(raw);
    if ("errors" in result) {
      postToRN({ event: "error", message: result.errors.join(" / ") });
      return;
    }
    const key = result.intent.key;
    const look = result.intent.look;
    requestCount += 1;
    const request = requestCount;

    buildCharacter(look);
    frameCharacter();
    // 作り直したマテリアルのシェーダーが揃ってから描く。揃う前に描くと、
    // 一部のパーツが抜けた画像になることがある
    scene.executeWhenReady(() => {
      if (request !== requestCount) return;
      scene.render();
      postToRN({ dataUrl: canvas.toDataURL("image/png"), event: "portrait", key });
    });
  }

  // react-native-webview の postMessage は Android / iOS で window / document の
  // どちらに message を飛ばすか差があるため両方で受ける（scene.ts と同じ）。
  window.addEventListener("message", (e) => handleIntent((e as MessageEvent).data));
  document.addEventListener("message", (e) => handleIntent((e as unknown as MessageEvent).data));

  scene.executeWhenReady(() => {
    postToRN({ event: "ready" });
  });
}

window.onerror = (message) => {
  postToRN({ event: "error", message: String(message) });
};

main();
