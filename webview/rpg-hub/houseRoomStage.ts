// 自分の家の中（Issue #386）を映すカメラと照明。
//
// 部屋の中身（家具・キャラクター）は houseRoom.ts が作る。ここは「どこから・どんな光で映すか」だけを受け持つ
// （houseRoom.ts が目安の500行を超えたため切り出した。Issue #425 の1R0Uレビュー指摘）。
//
// houseRoom.ts と一緒に esbuild でバンドルされ、グローバルの BABYLON を参照する。

import { ROOM_DEPTH, ROOM_HEIGHT, ROOM_WIDTH } from "../../lib/rpg-hub/houseRoom";
import type { PortraitLook } from "../../lib/rpg-hub/portraitBridge";
import { SEASON_LIGHTING } from "../../lib/rpg-hub/seasonalLook";
import { toColor3 } from "./partMesh";

declare const BABYLON: any;

/** カメラの見下ろす角度（ラジアン）。真横だと床が線になるので、少しだけ上から見る */
const CAMERA_TILT = 0.3;
/** 部屋のまわりに取る余白（ワールド座標） */
const FRAME_MARGIN = 0.35;
/**
 * 画面の縦方向に映したい範囲の半分。床の手前の縁から、奥の壁の上の縁までを
 * カメラの傾きで見たときの高さ（床の手前の縁は z = 0.2、壁の上の縁は y = ROOM_HEIGHT, z = -ROOM_DEPTH）。
 */
const CONTENT_HALF_HEIGHT =
  (ROOM_HEIGHT * Math.cos(CAMERA_TILT) + (ROOM_DEPTH + 0.2) * Math.sin(CAMERA_TILT)) / 2;

/**
 * 部屋を真横から少しだけ見下ろす、固定の平行投影のカメラを作る。
 * @param engine - Babylon のエンジン
 * @param scene - 部屋のシーン
 * @returns camera と、画面の大きさが変わったときに映す範囲を合わせ直す fit
 */
export function createHouseRoomCamera(engine: any, scene: any): { camera: any; fit: () => void } {
  const camera = new BABYLON.FreeCamera("camera", new BABYLON.Vector3(0, 0, 20), scene);
  camera.mode = BABYLON.Camera.ORTHOGRAPHIC_CAMERA;
  camera.minZ = 0.1;
  camera.maxZ = 100;

  /**
   * 画面の縦横比に合わせて、部屋全体が収まるよう映す範囲を決める。
   * 縦に余るときは、部屋を下に寄せる（床が画面の真ん中に浮いて見えないように）。
   */
  function fit(): void {
    const aspect = engine.getAspectRatio(camera) || 1;
    const halfWidthNeeded = ROOM_WIDTH / 2 + 0.2 + FRAME_MARGIN;
    const contentHalf = CONTENT_HALF_HEIGHT + FRAME_MARGIN;
    const halfHeight = Math.max(contentHalf, halfWidthNeeded / aspect);
    const halfWidth = halfHeight * aspect;
    // 画面の上向き（カメラの傾きぶん奥へ倒れている）
    const up = new BABYLON.Vector3(0, Math.cos(CAMERA_TILT), -Math.sin(CAMERA_TILT));
    const target = new BABYLON.Vector3(0, ROOM_HEIGHT / 2, -ROOM_DEPTH / 2).add(up.scale(halfHeight - contentHalf));
    const distance = 20;
    camera.position = new BABYLON.Vector3(
      0,
      target.y + Math.sin(CAMERA_TILT) * distance,
      target.z + Math.cos(CAMERA_TILT) * distance,
    );
    camera.setTarget(target);
    camera.orthoLeft = -halfWidth;
    camera.orthoRight = halfWidth;
    camera.orthoBottom = -halfHeight;
    camera.orthoTop = halfHeight;
  }
  fit();
  return { camera, fit };
}

/**
 * 部屋の照明と影を作る。はじめは春の明るさ。
 * @param scene - 部屋のシーン
 * @returns 影を作る shadowGenerator と、季節の明るさに合わせる applySeason
 */
export function createHouseRoomLighting(scene: any): {
  applySeason: (season: PortraitLook["season"]) => void;
  shadowGenerator: any;
} {
  const ambient = new BABYLON.HemisphericLight("ambient", new BABYLON.Vector3(0.2, 1, 0.4), scene);
  // 手前の左上から差す光。奥の壁に家具とキャラクターの影が落ちて、立体に見える
  const sun = new BABYLON.DirectionalLight("sun", new BABYLON.Vector3(0.35, -0.8, -0.6), scene);
  sun.position = new BABYLON.Vector3(-4, 10, 8);
  const shadowGenerator = new BABYLON.ShadowGenerator(1024, sun);
  shadowGenerator.usePercentageCloserFiltering = true;
  shadowGenerator.darkness = 0.55;
  shadowGenerator.bias = 0.005;
  shadowGenerator.normalBias = 0.03;

  function applySeason(season: PortraitLook["season"]): void {
    const lighting = SEASON_LIGHTING[season];
    ambient.intensity = lighting.ambient.intensity;
    ambient.diffuse = toColor3(lighting.ambient.color);
    ambient.groundColor = toColor3(lighting.ambient.groundColor);
    sun.intensity = lighting.sun.intensity;
    sun.diffuse = toColor3(lighting.sun.color);
  }
  applySeason("spring");
  return { applySeason, shadowGenerator };
}
