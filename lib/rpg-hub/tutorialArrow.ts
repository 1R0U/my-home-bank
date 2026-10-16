import type { BuildingMapObject } from "../../types/map.ts";
import { getBuildingExitPoint } from "./movement.ts";
import { TOWN_CAMERA_OFFSET } from "./townCamera.ts";

/** 目的の入口へ向く矢印の回転角。画面上の上向きが0度、時計回りが正。 */
export function getTutorialArrowRotation(
  player: { x: number; z: number },
  building: BuildingMapObject,
): number | null {
  // 建物の中心ではなく、歩いて到達できる扉の手前を指す。
  const entrance = getBuildingExitPoint(building);
  const dx = entrance.x - player.x;
  const dz = entrance.z - player.z;
  if (Math.hypot(dx, dz) < 0.35) return null;

  // 3Dと同じカメラから地面を投影する。奥行きは見下ろす角度に応じて縮む。
  const camera = TOWN_CAMERA_OFFSET;
  const horizontal = Math.hypot(camera.x, camera.z);
  const depthScale = camera.y / Math.hypot(camera.x, camera.y, camera.z);
  const right = (dx * camera.z - dz * camera.x) / horizontal;
  const down = ((dx * camera.x + dz * camera.z) / horizontal) * depthScale;
  return Math.atan2(right, -down) * 180 / Math.PI;
}
