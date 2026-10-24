/**
 * 建物の上に浮かべる名札（Issue #444）。
 *
 * 自分の家の中の、機能のある家具（そとへ・きがえ）に付ける。何をする家具か、
 * 近づく前から分かるようにするため（真横から見ていた家の中の名札を引き継いだ）。
 * 文字は `MapObject` の `tag`（lib/rpg-hub/houseInterior.ts）。
 */

import { CHILD_THEME } from "../../components/childTheme";

// Babylon UMD がグローバルに載せる名前空間（scene.ts と同じ理由で any で受ける）。
declare const BABYLON: any;

/** 名札の大きさ（3Dの座標）。家具の横幅（1〜2）に収まり、子供が読める大きさ */
const TAG_WIDTH = 1.3;
const TAG_HEIGHT = 0.5;

/** 家具のいちばん上から、名札の下の端までの隙間 */
const TAG_MARGIN = 0.25;

/**
 * 名札の下の端の、いちばん低い高さ（建物の原点から）。床に置いた敷居だけの玄関のように
 * 背の低い物でも、名札が床に埋もれず、プレイヤーの頭より上に浮かぶようにする
 */
const MIN_TAG_BOTTOM = 1.4;

/** 名札を描く絵の大きさ（ピクセル）。縦横比は TAG_WIDTH : TAG_HEIGHT と同じ */
const TEXTURE_WIDTH = 260;
const TEXTURE_HEIGHT = 100;

/** 名札の色。子供用の画面と同じ羊皮紙と濃い木の色（components/childTheme.ts） */
const TAG_COLORS = {
  background: CHILD_THEME.parchment,
  border: CHILD_THEME.darkWood,
  text: CHILD_THEME.darkWood,
} as const;

/**
 * 角の丸い四角の輪郭を描く。
 * @param context - 描く先
 * @param x - 左
 * @param y - 上
 * @param width - 幅
 * @param height - 高さ
 * @param radius - 角の丸み
 */
function roundedRect(context: any, x: number, y: number, width: number, height: number, radius: number): void {
  context.beginPath();
  context.moveTo(x + radius, y);
  context.lineTo(x + width - radius, y);
  context.quadraticCurveTo(x + width, y, x + width, y + radius);
  context.lineTo(x + width, y + height - radius);
  context.quadraticCurveTo(x + width, y + height, x + width - radius, y + height);
  context.lineTo(x + radius, y + height);
  context.quadraticCurveTo(x, y + height, x, y + height - radius);
  context.lineTo(x, y + radius);
  context.quadraticCurveTo(x, y, x + radius, y);
  context.closePath();
}

/**
 * 建物のルートノードの上に名札を付ける。
 *
 * いつもカメラの方を向く板（ビルボード）にする。**ルートノードの子の凍結（freezeWorldMatrix）が
 * 済んだあとに呼ぶ。** 凍結すると向きの計算が止まり、名札が斜めのまま固まるため。
 * 捨てるときはルートノードと一緒に捨てられる（マテリアル・テクスチャも含めて）。
 *
 * 名札はタップの対象にしない（建物はタップでは入れない。Issue #491）。
 * @param scene - Babylon のシーン
 * @param root - 建物のルートノード
 * @param text - 名札の文字
 * @param name - メッシュ名
 * @returns 名札のメッシュ
 */
export function attachNameTag(scene: any, root: any, text: string, name: string): any {
  // 建物の形のいちばん上を測り、その少し上に浮かべる
  const bounds = root.getHierarchyBoundingVectors(true);
  const scale = root.scaling.y || 1;

  const texture = new BABYLON.DynamicTexture(
    `${name}-texture`,
    { height: TEXTURE_HEIGHT, width: TEXTURE_WIDTH },
    scene,
    true,
  );
  texture.hasAlpha = true;
  const context = texture.getContext();
  context.clearRect(0, 0, TEXTURE_WIDTH, TEXTURE_HEIGHT);
  roundedRect(context, 5, 5, TEXTURE_WIDTH - 10, TEXTURE_HEIGHT - 10, 22);
  context.fillStyle = TAG_COLORS.background;
  context.fill();
  context.lineWidth = 6;
  context.strokeStyle = TAG_COLORS.border;
  context.stroke();
  context.fillStyle = TAG_COLORS.text;
  context.font = "bold 50px sans-serif";
  context.textAlign = "center";
  context.textBaseline = "middle";
  context.fillText(text, TEXTURE_WIDTH / 2, TEXTURE_HEIGHT / 2 + 2, TEXTURE_WIDTH - 36);
  texture.update();

  const material = new BABYLON.StandardMaterial(`${name}-material`, scene);
  material.diffuseTexture = texture;
  material.useAlphaFromDiffuseTexture = true;
  // 照明や影で文字が暗くならないよう、絵の色をそのまま出す
  material.emissiveTexture = texture;
  material.disableLighting = true;
  material.backFaceCulling = false;

  const tag = BABYLON.MeshBuilder.CreatePlane(name, { height: TAG_HEIGHT, width: TAG_WIDTH }, scene);
  tag.material = material;
  tag.parent = root;
  // 建物を拡大していても、名札の大きさは変えない
  tag.scaling.set(1 / scale, 1 / scale, 1 / scale);
  const bottom = Math.max(bounds.max.y - root.position.y + TAG_MARGIN, MIN_TAG_BOTTOM);
  tag.position.y = (bottom + TAG_HEIGHT / 2) / scale;
  tag.billboardMode = BABYLON.Mesh.BILLBOARDMODE_ALL;
  // 後ろにいる住人をタップできるよう、名札は拾わない
  tag.isPickable = false;
  return tag;
}
