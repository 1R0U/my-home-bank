import {
  TITLE_CAMERA_FOV,
  TITLE_CAMERA_POSITION,
  TITLE_CAMERA_TARGET,
} from "./titleCamera.ts";

/**
 * タイトル画面の背景の空に流す雲（Issue #309）。
 *
 * 雲はカメラから見た「奥行き（depth）」「左右（lateral）」「高さ（height）」で置き、
 * 左右方向へゆっくり流す。画面の外へ出たら反対側から戻ってくる。
 * カメラは動かないので、カメラの向きを基準に置くと、どの雲も必ず画面を横切る。
 *
 * WebView 内のシーン（webview/rpg-hub/scene.ts）が、タイトル用のモードのときだけ使う。
 */

export type TitleCloud = {
  /** カメラから前方へどれだけ離れているか */
  depth: number;
  /** 地面からの高さ。地平線の少し上、タイトルのカードの下あたりに見える高さにする */
  height: number;
  /** 動き始めの左右の位置（カメラから見て右が正） */
  lateral: number;
  /** 大きさの倍率 */
  scale: number;
  /** 左右へ流れる速さ（1秒あたり）。正なら右へ流れる */
  speed: number;
};

/**
 * 空に浮かべる雲。奥ほど大きく、遅くして、遠近が出るようにしている。
 * 値は実際に描いた絵を見ながら決めたもの。
 */
export const TITLE_CLOUDS: readonly TitleCloud[] = [
  { depth: 34, height: 10, lateral: -9, scale: 1.7, speed: 0.55 },
  { depth: 44, height: 14.5, lateral: 8, scale: 2.2, speed: 0.4 },
  { depth: 52, height: 11.5, lateral: -24, scale: 2.4, speed: 0.35 },
  { depth: 40, height: 18, lateral: 19, scale: 1.9, speed: 0.5 },
  { depth: 30, height: 13.5, lateral: 2, scale: 1.2, speed: 0.65 },
];

/** 画面の外へ出てから戻ってくるまでの余裕。雲の幅より大きくして、端で消えて見えないようにする */
const WRAP_MARGIN = 8;

/**
 * カメラの前方と右方向（水平面上の単位ベクトル）。
 * 見る点がカメラの真上・真下にあることはないので、長さ0にはならない。
 */
function getCameraAxes(): { forward: { x: number; z: number }; right: { x: number; z: number } } {
  const dx = TITLE_CAMERA_TARGET.x - TITLE_CAMERA_POSITION.x;
  const dz = TITLE_CAMERA_TARGET.z - TITLE_CAMERA_POSITION.z;
  const length = Math.hypot(dx, dz);
  const forward = { x: dx / length, z: dz / length };
  // 右手系（scene.ts は useRightHandedSystem）で、上から見て前方を時計回りに90度回した向きが右
  const right = { x: -forward.z, z: forward.x };
  return { forward, right };
}

/**
 * その奥行きで、雲が行き来する左右の範囲の半分。画面の端より WRAP_MARGIN だけ外側まで。
 * @param depth - カメラからの奥行き
 * @returns 左右の範囲の半分
 */
export function getCloudWrapHalfWidth(depth: number): number {
  return depth * Math.tan(TITLE_CAMERA_FOV / 2) + WRAP_MARGIN;
}

/**
 * 経過時間から、雲の左右の位置を求める。範囲の端を越えたら反対側の端へ戻す。
 * @param cloud - 雲
 * @param elapsedMs - 背景を映し始めてからの経過時間（ミリ秒）
 * @returns 左右の位置（-範囲の半分 〜 +範囲の半分）
 */
export function getCloudLateral(cloud: TitleCloud, elapsedMs: number): number {
  const safeElapsed = Number.isFinite(elapsedMs) && elapsedMs > 0 ? elapsedMs : 0;
  const half = getCloudWrapHalfWidth(cloud.depth);
  const span = half * 2;
  const moved = cloud.lateral + (cloud.speed * safeElapsed) / 1000 + half;
  // JS の % は負の数で負を返すので、0 〜 span に収め直す
  const wrapped = ((moved % span) + span) % span;
  return wrapped - half;
}

/**
 * 経過時間から、雲のワールド座標を求める。
 * @param cloud - 雲
 * @param elapsedMs - 背景を映し始めてからの経過時間（ミリ秒）
 * @returns ワールド座標
 */
export function getCloudPosition(
  cloud: TitleCloud,
  elapsedMs: number,
): { x: number; y: number; z: number } {
  // 分割代入しない（esbuild が ios13 ターゲットへ変換できない。AGENTS.md 参照）
  const axes = getCameraAxes();
  const forward = axes.forward;
  const right = axes.right;
  const lateral = getCloudLateral(cloud, elapsedMs);
  return {
    x: TITLE_CAMERA_POSITION.x + forward.x * cloud.depth + right.x * lateral,
    y: cloud.height,
    z: TITLE_CAMERA_POSITION.z + forward.z * cloud.depth + right.z * lateral,
  };
}
