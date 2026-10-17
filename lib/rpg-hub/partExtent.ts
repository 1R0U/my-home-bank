/**
 * パーツ（BuildingPart）で作った形の、地面から見た広がりを求める（Issue #445）。
 *
 * 装飾をマス（townGrid.ts）に置くとき、**当たり判定ではなく見た目がマスに収まるか**を見るために使う。
 * 当たり判定は歩きやすいよう見た目より小さく作ってあるので（catalog.ts の DecorationPlacement）、
 * 判定だけをマスに収めると、しげみや木の葉が隣のマスへはみ出して見える。
 *
 * 形ごとに輪郭の点を取り、パーツの回転と位置を掛けてから、原点からいちばん遠い X・Z を見る。
 * 回転は webview/rpg-hub/partMesh.ts と同じく Babylon の `rotation`（Z → X → Y の順に回す）。
 * 円や球は点で近似するので、ごくわずかに小さく出ることがある。
 */

import type { BuildingPart } from "./buildingParts.ts";

type Point = [number, number, number];

/** 円や球を近似するときの分割数。 */
const SEGMENTS = 24;

/**
 * 水平な円の輪郭の点。
 * @param radius - 半径
 * @param y - 高さ
 * @returns 点の配列
 */
function ring(radius: number, y: number): Point[] {
  return Array.from({ length: SEGMENTS }, (_, index): Point => {
    const angle = (index / SEGMENTS) * Math.PI * 2;
    return [Math.cos(angle) * radius, y, Math.sin(angle) * radius];
  });
}

/**
 * パーツの形の輪郭の点（パーツのローカル座標、回転・位置を掛ける前）。
 * @param part - パーツ
 * @returns 点の配列
 */
function outline(part: BuildingPart): Point[] {
  switch (part.shape) {
    case "box": {
      const points: Point[] = [];
      for (const sx of [-1, 1]) {
        for (const sy of [-1, 1]) {
          for (const sz of [-1, 1]) {
            points.push([(sx * part.width) / 2, (sy * part.height) / 2, (sz * part.depth) / 2]);
          }
        }
      }
      return points;
    }
    case "cone":
      return [...ring(part.diameter / 2, -part.height / 2), [0, part.height / 2, 0]];
    case "cylinder":
      return [...ring(part.diameterBottom / 2, -part.height / 2), ...ring(part.diameterTop / 2, part.height / 2)];
    case "torus": {
      const outer = (part.diameter + part.thickness) / 2;
      return [...ring(outer, 0), ...ring(part.diameter / 2, part.thickness / 2), ...ring(part.diameter / 2, -part.thickness / 2)];
    }
    case "sphere": {
      // 上下を切った球（slice）も、球全体で見る（大きめに出るぶんには困らない）
      const points: Point[] = [];
      const rows = SEGMENTS / 2;
      for (let row = 0; row <= rows; row += 1) {
        const polar = (row / rows) * Math.PI;
        for (let column = 0; column < SEGMENTS; column += 1) {
          const azimuth = (column / SEGMENTS) * Math.PI * 2;
          points.push([
            ((Math.sin(polar) * Math.cos(azimuth)) * part.diameterX) / 2,
            (Math.cos(polar) * part.diameterY) / 2,
            ((Math.sin(polar) * Math.sin(azimuth)) * part.diameterZ) / 2,
          ]);
        }
      }
      return points;
    }
  }
}

/**
 * 点にパーツの回転を掛ける（Babylon の `rotation` と同じく Z → X → Y の順）。
 * @param point - 点
 * @param rotation - パーツの回転（ラジアン）
 * @returns 回した点
 */
function rotate(point: Point, rotation: BuildingPart["rotation"]): Point {
  if (!rotation) return point;
  let x = point[0];
  let y = point[1];
  let z = point[2];
  let cos = Math.cos(rotation.z);
  let sin = Math.sin(rotation.z);
  const zx = x * cos - y * sin;
  y = x * sin + y * cos;
  x = zx;
  cos = Math.cos(rotation.x);
  sin = Math.sin(rotation.x);
  const xy = y * cos - z * sin;
  z = y * sin + z * cos;
  y = xy;
  cos = Math.cos(rotation.y);
  sin = Math.sin(rotation.y);
  const yx = x * cos + z * sin;
  z = -x * sin + z * cos;
  x = yx;
  return [x, y, z];
}

/**
 * パーツで作った形の、原点から見た水平方向の半分の広がりを求める。
 *
 * X と Z の大きいほうを返す。マスに置く物は90度刻みに回すので、どちらの向きでも収まるようにする。
 * @param parts - 形のパーツ
 * @returns 半分の広がり（拡大率1のとき）
 */
export function getPartsHalfExtent(parts: readonly BuildingPart[]): number {
  let half = 0;
  for (const part of parts) {
    for (const point of outline(part)) {
      const rotated = rotate(point, part.rotation);
      half = Math.max(
        half,
        Math.abs(rotated[0] + part.position.x),
        Math.abs(rotated[2] + part.position.z),
      );
    }
  }
  return half;
}
