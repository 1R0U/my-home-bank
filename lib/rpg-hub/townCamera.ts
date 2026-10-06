/**
 * 我が家タウンを映すカメラ。
 *
 * プレイヤーの +X+Z 側の斜め上から見下ろし、プレイヤーに合わせて平行に追従する
 * （webview/rpg-hub/scene.ts）。カメラは回らないので、画面の上下左右と町の X・Z 軸の
 * 関係は常に同じになる。
 */

type Point3 = { x: number; y: number; z: number };

/** カメラのプレイヤーからのオフセット。R3F 版の CAMERA_OFFSET と同じ。 */
export const TOWN_CAMERA_OFFSET: Point3 = { x: 9, y: 11, z: 9 };

/**
 * 画面上の向き（右 = +x、下 = +y）を、町の地面（XZ平面）での向きに変換する（Issue #379）。
 *
 * カメラは斜め45度から見ているため、町の X・Z 軸は画面では斜めに映る。画面の向きを
 * そのまま X・Z に当てると、スティックを上へ倒しても画面の斜めへ進んでしまう。
 *
 * - 画面の上 = カメラから見た奥 = オフセットと逆向き（今のオフセットでは (-X, -Z)）
 * - 画面の右 = 奥 × 上（右手系。`scene.useRightHandedSystem = true`）
 *
 * 回転するだけなので、長さ（スティックの倒し具合）は変わらない。
 * @param screenX - 画面上の右向きの量
 * @param screenY - 画面上の下向きの量
 * @param cameraOffset - プレイヤーから見たカメラの位置
 * @returns 町での移動量（x, z）
 */
export function screenToWorldDirection(
  screenX: number,
  screenY: number,
  cameraOffset: Point3 = TOWN_CAMERA_OFFSET,
): { x: number; z: number } {
  const length = Math.hypot(cameraOffset.x, cameraOffset.z);
  // 真上から見ている場合は奥の向きが決まらないため、画面の上を -Z とみなす
  const forwardX = length > 0 ? -cameraOffset.x / length : 0;
  const forwardZ = length > 0 ? -cameraOffset.z / length : -1;
  // 奥 × 上(0, 1, 0) = (-forwardZ, 0, forwardX)
  const rightX = -forwardZ;
  const rightZ = forwardX;
  // 画面の y は下向きが正なので、奥（上）へは -screenY だけ進む
  return {
    x: rightX * screenX - forwardX * screenY,
    z: rightZ * screenX - forwardZ * screenY,
  };
}
