/**
 * 町の照明と影（Issue #399 で webview/rpg-hub/scene.ts から切り出した）。
 *
 * 照明の強さと色は季節で変わる（`applySeason` が lib/rpg-hub/seasonalLook.ts の表から入れる）。
 * どの季節も、**上を向いた面の明るさが合計で 1.0 を超えない**ように決めてある。
 * 1.0 を超えると素材の色がそのまま出ず、明るい色から順に白へ潰れる（Issue #214）。
 */
import { SEASON_LIGHTING, SUN_DIRECTION } from "../../lib/rpg-hub/seasonalLook";
import type { Season } from "../../types/map";
import { toColor3 } from "./partMesh";

// Babylon UMD がグローバルに載せる名前空間（scene.ts と同じ理由で any で受ける）。
declare const BABYLON: any;

/**
 * 影を落とす範囲の半分の幅。カメラに映る範囲（縦 ORTHO_HALF_HEIGHT × 2 ＋ 建物の高さ）を
 * 覆えればよい。広げるほど同じ解像度で影が粗くなる。
 */
const SHADOW_AREA_HALF = 11;

/**
 * 影の解像度。SHADOW_AREA_HALF × 2 の範囲をこの枚数で割った細かさになる。
 * **重かったらここを 512 に下げるか、SHADOW_ENABLED を false にする。**
 */
const SHADOW_MAP_SIZE = 1024;

/**
 * 影を描くかどうか。
 * 影があると物が地面に乗って見えるが、描画のパスが1回増える。
 * 低スペック端末で重い場合にすぐ戻せるよう、1か所にまとめてある。
 */
export const SHADOW_ENABLED = true;

/** 影の濃さ。1で真っ黒。地面の色が分かる程度に残す。 */
const SHADOW_DARKNESS = 0.42;

/** 平行光をプレイヤーからどれだけ引いた位置に置くか（影の範囲の中心決めに使う）。 */
const SUN_DISTANCE = 35;

export type SceneLighting = {
  /**
   * メッシュを影の対象にする。
   * @param mesh - 対象のメッシュ
   * @param casts - 影を落とす側にするか（地面に貼りつく道のタイルなどは false）
   */
  applyShadow: (mesh: any, casts: boolean) => void;
  /** 照明の強さと色を季節に合わせる */
  applySeason: (season: Season) => void;
  /** 破棄したメッシュを影のリストから外す。残ると、そのぶん無駄に描こうとする */
  pruneShadowCasters: () => void;
  /** 影を落とす範囲を、いま映している場所（focus）へ追従させる。毎フレーム呼ぶ */
  follow: (x: number, z: number) => void;
};

/**
 * 環境光・平行光・影を作る。
 * @param scene - Babylon のシーン
 */
export function createSceneLighting(scene: any): SceneLighting {
  // 環境光の groundColor は、光の当たらない面が真っ暗にならないよう少しだけ明るくする。
  const ambient = new BABYLON.HemisphericLight("ambient", new BABYLON.Vector3(0, 1, 0), scene);
  // 平行光はX方向とZ方向で当たり方を変える。左右対称にすると、カメラから見える
  // +X面と+Z面が同じ明るさになり、箱の角が消えて平べったく見えるため。
  const sunDirection = new BABYLON.Vector3(SUN_DIRECTION.x, SUN_DIRECTION.y, SUN_DIRECTION.z);
  const sun = new BABYLON.DirectionalLight("sun", sunDirection, scene);

  // 影。物が地面に乗っているように見せるための、いちばん効く要素。
  // 平行光なので、影を落とす範囲は光の位置と ortho* で決まる。範囲をマップ全体ではなく
  // 固定の大きさにして毎フレームプレイヤーへ追従させることで、同じ解像度でも影を細かく保つ。
  const sunOffset = sunDirection.normalizeToNew().scale(-SUN_DISTANCE);
  let shadowMap: any = null;
  if (SHADOW_ENABLED) {
    sun.autoUpdateExtends = false;
    sun.orthoLeft = -SHADOW_AREA_HALF;
    sun.orthoRight = SHADOW_AREA_HALF;
    sun.orthoBottom = -SHADOW_AREA_HALF;
    sun.orthoTop = SHADOW_AREA_HALF;
    sun.shadowMinZ = 1;
    sun.shadowMaxZ = SUN_DISTANCE * 2;
    const shadowGenerator = new BABYLON.ShadowGenerator(SHADOW_MAP_SIZE, sun);
    // 影の縁をぼかす。WebGL2 が無い環境では Babylon が自動でポアソンサンプリングへ落ちる。
    shadowGenerator.usePercentageCloserFiltering = true;
    shadowGenerator.filteringQuality = BABYLON.ShadowGenerator.QUALITY_MEDIUM;
    shadowGenerator.darkness = SHADOW_DARKNESS;
    // 平らな面が自分の影で縞になる（シャドウアクネ）のを防ぐ。
    // 軒と壁の境目がギザギザになるのはこの値が足りないときで、上げると消える代わりに
    // 接地部分の影がわずかに痩せる。
    shadowGenerator.bias = 0.008;
    shadowGenerator.normalBias = 0.05;
    shadowMap = shadowGenerator.getShadowMap();
  }

  return {
    applySeason(season) {
      const lighting = SEASON_LIGHTING[season];
      ambient.intensity = lighting.ambient.intensity;
      ambient.diffuse = toColor3(lighting.ambient.color);
      ambient.groundColor = toColor3(lighting.ambient.groundColor);
      sun.intensity = lighting.sun.intensity;
      sun.diffuse = toColor3(lighting.sun.color);
    },
    applyShadow(mesh, casts) {
      if (!shadowMap) return;
      // インスタンスは共有元と一緒に描かれるので、共有元だけ登録すればよい。
      // 受ける設定も共有元から引き継がれる。
      if (mesh.sourceMesh) return;
      mesh.receiveShadows = true;
      if (casts) shadowMap.renderList.push(mesh);
    },
    pruneShadowCasters() {
      if (shadowMap?.renderList) {
        shadowMap.renderList = shadowMap.renderList.filter((mesh: any) => !mesh.isDisposed());
      }
    },
    follow(x, z) {
      // 平行光は「位置」で範囲の中心が決まる
      if (shadowMap) sun.position.set(x + sunOffset.x, sunOffset.y, z + sunOffset.z);
    },
  };
}
