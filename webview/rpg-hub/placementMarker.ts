/**
 * かざるモードで、装飾が置かれる場所に出す目印。
 *
 * 置く場所はプレイヤーの正面と決まっているので、毎フレームプレイヤーの位置と向きから
 * 求め直す。RN へ送る位置は間引いているため、RN 側で計算して送ると歩いている間に
 * 目印が遅れてついてくる。
 *
 * 置けない場所（物やプレイヤーと重なる）では赤くする。置いたあとに建物へ行けるかの
 * 判定は重いので目印では見ず、「ここに おく」を押したときだけ調べる。
 */
import { getDecorationPlacement } from "../../lib/rpg-hub/catalog";
import { createPlacementCandidate, isPlacementSpotBlocked } from "../../lib/rpg-hub/placementSpot";
import { TOWN_CELL_SIZE } from "../../lib/rpg-hub/townGrid";
import type { MapObject } from "../../types/map";
import { toColor3 } from "./partMesh";

// Babylon UMD がグローバルに載せる名前空間（scene.ts と同じ理由で any で受ける）。
declare const BABYLON: any;

/** 置けるときの色。子供用画面の金（CHILD_THEME.brightYellow）とそろえる。 */
const OK_COLOR = "#f2c94c";

/** 置けないときの色。 */
const BLOCKED_COLOR = "#ef4444";

/**
 * 目印の大きさの下限。草のように小さい装飾だと、目印が小さすぎて見えないため。
 */
const MIN_DIAMETER = 0.9;

/** 地面（y = -0.08）からわずかに浮かせる。同じ高さだとちらつく。 */
const MARKER_Y = -0.05;

/** ふくらんだり縮んだりする1回の長さ（ミリ秒）。 */
const PULSE_PERIOD_MS = 1200;

export type PlacementMarker = {
  /**
   * 目印を出す装飾を変える。null で消す。
   * @param assetId - 置こうとしている装飾
   */
  setAsset: (assetId: string | null) => void;
  /**
   * 毎フレーム呼ぶ。プレイヤーの正面へ動かし、置けるかで色を変える。
   * @param position - プレイヤーの位置
   * @param facingY - プレイヤーの向き
   * @param objects - いまのマップオブジェクト一覧
   * @param nowMs - 今の時刻（ミリ秒）
   */
  update: (position: { x: number; z: number }, facingY: number, objects: readonly MapObject[], nowMs: number) => void;
};

/**
 * 置き場所の目印を作る。作った直後は隠れている。
 * @param scene - Babylon のシーン
 * @returns 目印を動かすための操作
 */
export function createPlacementMarker(scene: any): PlacementMarker {
  const root = new BABYLON.TransformNode("placement-marker", scene);
  root.setEnabled(false);

  const material = new BABYLON.StandardMaterial("placement-marker-mat", scene);
  // 照明や影で色が変わると、置けるかどうかの色が読めなくなるので、光を受けずに塗る
  material.disableLighting = true;
  material.specularColor = new BABYLON.Color3(0, 0, 0);
  material.backFaceCulling = false;

  const fillMaterial = material.clone("placement-marker-fill-mat");
  fillMaterial.alpha = 0.5;

  // 直径1で作り、装飾の大きさに合わせて root ごと拡大する
  const ring = BABYLON.MeshBuilder.CreateTorus(
    "placement-marker-ring",
    { diameter: 1, tessellation: 40, thickness: 0.07 },
    scene,
  );
  ring.material = material;
  ring.parent = root;

  const fill = BABYLON.MeshBuilder.CreateDisc("placement-marker-fill", { radius: 0.5, tessellation: 40 }, scene);
  // 円盤は立った向きで作られるので、寝かせて地面に沿わせる
  fill.rotation.x = Math.PI / 2;
  fill.material = fillMaterial;
  fill.parent = root;

  for (const mesh of [ring, fill]) {
    // タップしても何も起きないうえ、後ろの建物が拾えなくなるため対象から外す
    mesh.isPickable = false;
    mesh.receiveShadows = false;
  }

  let assetId: string | null = null;
  let diameter = MIN_DIAMETER;
  let blocked: boolean | null = null;

  /**
   * 置けるかどうかで色を変える。同じなら何もしない（毎フレーム色を作り直さない）。
   * @param nextBlocked - 置けないなら true
   */
  function applyColor(nextBlocked: boolean): void {
    if (blocked === nextBlocked) return;
    blocked = nextBlocked;
    const color = toColor3(nextBlocked ? BLOCKED_COLOR : OK_COLOR);
    material.emissiveColor = color;
    material.diffuseColor = color;
    fillMaterial.emissiveColor = color;
    fillMaterial.diffuseColor = color;
  }

  return {
    setAsset(nextAssetId) {
      const placement = nextAssetId ? getDecorationPlacement(nextAssetId) : null;
      assetId = placement ? nextAssetId : null;
      // 置く物が占めるマスの大きさに合わせる（Issue #445）。花壇なら 2×2 マスぶん
      diameter = Math.max((placement?.cells ?? 1) * TOWN_CELL_SIZE, MIN_DIAMETER);
      root.setEnabled(assetId !== null);
    },
    update(position, facingY, objects, nowMs) {
      if (!assetId) return;
      const candidate = createPlacementCandidate(assetId, position, facingY);
      if (!candidate) return;
      root.position.set(candidate.position.x, MARKER_Y, candidate.position.z);
      // 少しだけふくらんだり縮んだりさせて、地面の模様と見分けやすくする
      const pulse = 1 + 0.06 * Math.sin((nowMs / PULSE_PERIOD_MS) * Math.PI * 2);
      root.scaling.set(diameter * pulse, 1, diameter * pulse);
      applyColor(isPlacementSpotBlocked(candidate, objects, position));
    },
  };
}
