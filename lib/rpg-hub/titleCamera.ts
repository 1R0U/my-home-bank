/**
 * タイトル画面の背景で、カメラがゆっくり町を巡る道すじ（Issue #309）。
 *
 * タイトル画面では我が家タウンと同じ3Dシーンを、プレイヤーを出さずに背景として映す。
 * カメラの角度（真上寄りの斜め見下ろし）は我が家タウンと同じにしたまま、
 * **見ている先（注視点）だけ**を町の中心のまわりで楕円に動かす。
 * 角度まで回すと、建物を裏から見ることになり、正面の看板や扉が見えなくなるため。
 *
 * WebView 内のシーン（webview/rpg-hub/scene.ts）から毎フレーム呼ばれる。
 */

/** 1周にかかる時間（ミリ秒）。背景なので、動いていると分かる程度にゆっくり回す */
export const TITLE_CAMERA_LOOP_MS = 60_000;

/**
 * 楕円の半径。4棟の建物は x = ±5.6、z = -4.8 〜 5.6 にあるため、
 * 1周するあいだに4棟とも画面に入るよう、建物の少し内側を通す。
 */
export const TITLE_CAMERA_RADIUS = { x: 3.6, z: 3.2 };

/** 楕円の中心。建物の z の中央（(-4.8 + 5.6) / 2）に合わせる */
export const TITLE_CAMERA_CENTER = { x: 0, z: 0.4 };

/**
 * 経過時間から、カメラが見ている地面の点を求める。
 * @param elapsedMs - タイトルの背景を映し始めてからの経過時間（ミリ秒）
 * @returns 注視点の x / z（ワールド座標）
 */
export function getTitleCameraFocus(elapsedMs: number): { x: number; z: number } {
  // 負の値や NaN が来ても、どこか決まった点を返す（カメラが飛ばないように）
  const safeElapsed = Number.isFinite(elapsedMs) && elapsedMs > 0 ? elapsedMs : 0;
  const angle = ((safeElapsed % TITLE_CAMERA_LOOP_MS) / TITLE_CAMERA_LOOP_MS) * Math.PI * 2;
  return {
    x: TITLE_CAMERA_CENTER.x + Math.sin(angle) * TITLE_CAMERA_RADIUS.x,
    z: TITLE_CAMERA_CENTER.z + Math.cos(angle) * TITLE_CAMERA_RADIUS.z,
  };
}
