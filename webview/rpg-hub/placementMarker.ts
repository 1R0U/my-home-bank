/**
 * かざるの編集モード（Issue #477）で、マスの上に出す目印。
 *
 * 2つの用途で使う。
 * - 置き場所: 装飾を引っぱっている間、指の下のマスに出す。置けないマス（埋まっている・
 *   プレイヤーと重なる・床の外）では赤くする。置いたあとに建物へ行けるかの判定は重いので
 *   目印では見ず、指を離したときに RN 側で調べる。
 * - 選択: タップして選んだ装飾の足元に出す。
 *
 * 目印は占めるマスの大きさ（1マス・2×2マス、家具は 2×1 マスなどの長方形）に合わせる。
 */
import { TOWN_CELL_SIZE } from "../../lib/rpg-hub/townGrid";
import { toColor3 } from "./partMesh";

// Babylon UMD がグローバルに載せる名前空間（scene.ts と同じ理由で any で受ける）。
declare const BABYLON: any;

/** 置けるときの色。子供用画面の金（CHILD_THEME.brightYellow）とそろえる。 */
const OK_COLOR = "#f2c94c";

/** 置けないときの色。 */
const BLOCKED_COLOR = "#ef4444";

/**
 * 床（家の中の床の上面 y = 0、町の地面 y = -0.08）よりわずかに上。
 * 同じ高さだとちらつき、家の中では床に隠れる。
 */
const MARKER_Y = 0.02;

/** 目印の四角を、マスの縁から少し内側へ寄せる幅。隣のマスの目印とくっついて見えないように。 */
const INSET = 0.06;

/** ふくらんだり縮んだりする1回の長さ（ミリ秒）。 */
const PULSE_PERIOD_MS = 1200;

export type CellMarker = {
  /** 目印を消す。 */
  hide: () => void;
  /**
   * 目印を出す（毎フレーム呼んでよい）。
   * @param x - 中心のX座標
   * @param z - 中心のZ座標
   * @param cols - 東西のマス数
   * @param rows - 南北のマス数
   * @param blocked - 置けないなら true（赤くする）
   * @param nowMs - 今の時刻（ミリ秒）。ふくらませる動きに使う
   */
  show: (x: number, z: number, cols: number, rows: number, blocked: boolean, nowMs: number) => void;
};

/**
 * マスの目印を作る。作った直後は隠れている。
 * @param scene - Babylon のシーン
 * @param name - メッシュ名の接頭辞（目印を2つ作るので分ける）
 * @returns 目印を動かすための操作
 */
export function createCellMarker(scene: any, name: string): CellMarker {
  const root = new BABYLON.TransformNode(name, scene);
  root.setEnabled(false);

  const material = new BABYLON.StandardMaterial(`${name}-mat`, scene);
  // 照明や影で色が変わると、置けるかどうかの色が読めなくなるので、光を受けずに塗る
  material.disableLighting = true;
  material.specularColor = new BABYLON.Color3(0, 0, 0);
  material.backFaceCulling = false;

  const fillMaterial = material.clone(`${name}-fill-mat`);
  fillMaterial.alpha = 0.45;

  // 一辺1で作り、マスの大きさに合わせて root ごと拡大する。四角の縁と、薄く塗った中
  const edge = 0.08;
  const border = [
    { h: edge, w: 1, x: 0, z: 0.5 - edge / 2 },
    { h: edge, w: 1, x: 0, z: -0.5 + edge / 2 },
    { h: 1, w: edge, x: 0.5 - edge / 2, z: 0 },
    { h: 1, w: edge, x: -0.5 + edge / 2, z: 0 },
  ].map((side, index) => {
    const mesh = BABYLON.MeshBuilder.CreateGround(`${name}-edge-${index}`, { height: side.h, width: side.w }, scene);
    mesh.position.set(side.x, 0.002, side.z);
    mesh.material = material;
    return mesh;
  });
  const fill = BABYLON.MeshBuilder.CreateGround(`${name}-fill`, { height: 1, width: 1 }, scene);
  fill.material = fillMaterial;

  for (const mesh of [...border, fill]) {
    mesh.parent = root;
    // タップしても何も起きないうえ、後ろの物が拾えなくなるため対象から外す
    mesh.isPickable = false;
    mesh.receiveShadows = false;
  }

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
    hide() {
      root.setEnabled(false);
    },
    show(x, z, cols, rows, nextBlocked, nowMs) {
      root.setEnabled(true);
      root.position.set(x, MARKER_Y, z);
      // 少しだけふくらんだり縮んだりさせて、床の模様と見分けやすくする
      const pulse = 1 + 0.04 * Math.sin((nowMs / PULSE_PERIOD_MS) * Math.PI * 2);
      const width = Math.max(cols * TOWN_CELL_SIZE - INSET * 2, 0.2) * pulse;
      const depth = Math.max(rows * TOWN_CELL_SIZE - INSET * 2, 0.2) * pulse;
      root.scaling.set(width, 1, depth);
      applyColor(nextBlocked);
    },
  };
}
