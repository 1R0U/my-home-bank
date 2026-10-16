// もようがえの一覧に出す、家具の絵を描く（Issue #425）。
//
// 部屋に置いたときと同じ見た目になるよう、部屋と同じ形（lib/rpg-hub/houseRoomParts.ts）と
// 組み立て方（partMesh.ts の createPartMesh）で家具を1つずつ作り、画像（PNG の data URL）にする。
// 家の中の WebView（houseRoom.ts）の中で、部屋とは別のシーンに描く。部屋の描画には映らない。
//
// houseRoom.ts と一緒に esbuild でバンドルされ、グローバルの BABYLON を参照する。

import { HOUSE_PLACEABLE_FURNITURE, type HousePlaceableKind } from "../../lib/rpg-hub/houseLayout";
import { HOUSE_FURNITURE_SHAPES } from "../../lib/rpg-hub/houseRoomParts";
import { SEASON_LIGHTING } from "../../lib/rpg-hub/seasonalLook";
import { createPartMesh, toColor3 } from "./partMesh";

declare const BABYLON: any;

/** 絵の大きさ（ピクセル）。一覧のボタンに出す大きさの3倍ほどにして、高解像度の画面でもぼやけないようにする */
const THUMBNAIL_SIZE = 160;
/** 見下ろす角度（ラジアン）。部屋のカメラ（0.3）と同じにして、部屋で見たときと同じ向きに見せる */
const VIEW_TILT = 0.3;
/** 横へ回り込む角度（ラジアン）。少しだけ右から見て、真正面より立体に見せる */
const VIEW_TURN = 0.35;
/** カメラから家具までの距離。平行投影なので映る大きさには関わらない */
const CAMERA_DISTANCE = 20;
/** 家具のまわりに空ける余白（家具の大きさに対する割合） */
const MARGIN = 1.04;

/**
 * 置ける家具をすべて、1つずつ絵にする。描けたものから順に onThumbnail で渡す。
 * @param engine - 部屋を描いている Babylon のエンジン
 * @param onThumbnail - 1つ描けるたびに呼ぶ。kind は家具の種類、dataUrl は PNG の data URL
 */
export async function renderFurnitureThumbnails(
  engine: any,
  onThumbnail: (kind: HousePlaceableKind, dataUrl: string) => void,
): Promise<void> {
  const scene = new BABYLON.Scene(engine);
  // 部屋と同じく右手系にする。左手系だと左右が裏返る
  scene.useRightHandedSystem = true;
  // 背景は透明にして、ボタンの色の上に家具だけを出す
  scene.clearColor = new BABYLON.Color4(0, 0, 0, 0);

  const camera = new BABYLON.FreeCamera("thumbnail-camera", BABYLON.Vector3.Zero(), scene);
  camera.mode = BABYLON.Camera.ORTHOGRAPHIC_CAMERA;
  camera.minZ = 0.1;
  camera.maxZ = CAMERA_DISTANCE * 2;
  const viewDirection = new BABYLON.Vector3(
    Math.sin(VIEW_TURN) * Math.cos(VIEW_TILT),
    Math.sin(VIEW_TILT),
    Math.cos(VIEW_TURN) * Math.cos(VIEW_TILT),
  );

  // 照明は部屋の春の明るさに合わせる（部屋と同じ向きから日が差す）
  const lighting = SEASON_LIGHTING.spring;
  const ambient = new BABYLON.HemisphericLight("thumbnail-ambient", new BABYLON.Vector3(0.2, 1, 0.4), scene);
  ambient.intensity = lighting.ambient.intensity;
  ambient.diffuse = toColor3(lighting.ambient.color);
  ambient.groundColor = toColor3(lighting.ambient.groundColor);
  const sun = new BABYLON.DirectionalLight("thumbnail-sun", new BABYLON.Vector3(0.35, -0.8, -0.6), scene);
  sun.intensity = lighting.sun.intensity;
  sun.diffuse = toColor3(lighting.sun.color);

  try {
    for (const item of HOUSE_PLACEABLE_FURNITURE) {
      const root = new BABYLON.TransformNode(`thumbnail-${item.kind}`, scene);
      HOUSE_FURNITURE_SHAPES[item.kind].parts.forEach((part, index) => {
        const mesh = createPartMesh(part, scene, `thumbnail-${item.kind}-${index}`, part.color);
        mesh.parent = root;
      });

      // 家具がちょうど収まるように映す。どの向きから見てもはみ出さないよう、外接する球の大きさで決める
      root.getChildMeshes(false).forEach((mesh: any) => mesh.computeWorldMatrix(true));
      const bounds = root.getHierarchyBoundingVectors(true);
      const center = bounds.min.add(bounds.max).scale(0.5);
      const half = (bounds.max.subtract(bounds.min).length() / 2) * MARGIN;
      camera.position = center.add(viewDirection.scale(CAMERA_DISTANCE));
      camera.setTarget(center);
      camera.orthoLeft = -half;
      camera.orthoRight = half;
      camera.orthoBottom = -half;
      camera.orthoTop = half;

      await scene.whenReadyAsync();
      const dataUrl: string = await BABYLON.Tools.CreateScreenshotUsingRenderTargetAsync(
        engine,
        camera,
        { height: THUMBNAIL_SIZE, width: THUMBNAIL_SIZE },
        "image/png",
        // 縁のギザギザを抑える
        4,
      );
      root.dispose(false, true);
      onThumbnail(item.kind, dataUrl);
    }
  } finally {
    scene.dispose();
  }
}
