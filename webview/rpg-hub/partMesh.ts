// RPGハブの WebView 側で、パーツ定義（lib/rpg-hub/buildingParts.ts）から Babylon のメッシュを作る。
//
// 我が家タウン（scene.ts）と、キャラクターの肖像（portrait.ts、Issue #306）、
// 更衣室のプレビュー（wardrobePreview.ts、Issue #344）で使う。
// **同じ関数でメッシュを作ることで、アイコンやプレビューに出るキャラクターの形・色が町で見る姿とずれないようにする。**

import type { BuildingPart } from "../../lib/rpg-hub/buildingParts";
import { getBuildingParts } from "../../lib/rpg-hub/catalog";
import { CHARACTER_TYPE_ASSET_IDS } from "../../lib/rpg-hub/characterTypes";
import { resolveEquipment, type EquipmentMap } from "../../lib/rpg-hub/equipment";
import { resolvePartColor } from "../../lib/rpg-hub/palette";
import type { PortraitLook } from "../../lib/rpg-hub/portraitBridge";

// Babylon UMD がグローバルに載せる名前空間（scene.ts と同じく any で受ける）。
declare const BABYLON: any;

/**
 * #rrggbb を Babylon の Color3 に変換する。
 * @param hex - 16進カラーコード
 * @returns Babylon.Color3
 */
export function toColor3(hex: string): any {
  return BABYLON.Color3.FromHexString(hex);
}

/**
 * パーツのローカルな位置・回転をメッシュへ反映する。
 * 共有元から作ったインスタンスにも同じものを掛ける必要があるため、切り出してある。
 * @param mesh - 対象のメッシュ
 * @param part - パーツ定義
 */
export function applyPartTransform(mesh: any, part: BuildingPart): void {
  mesh.position.set(part.position.x, part.position.y, part.position.z);
  if (part.rotation) {
    mesh.rotation.set(part.rotation.x, part.rotation.y, part.rotation.z);
  }
}

/**
 * パーツ定義1つ分から Babylon のメッシュを生成する。
 * @param part - パーツ定義
 * @param scene - Babylon シーン
 * @param name - メッシュ名
 * @returns 生成したメッシュ
 */
export function createPartMesh(part: BuildingPart, scene: any, name: string, color: string): any {
  let mesh: any;

  if (part.shape === "box") {
    mesh = BABYLON.MeshBuilder.CreateBox(
      name,
      { depth: part.depth, height: part.height, width: part.width },
      scene,
    );
  } else if (part.shape === "cone") {
    // Babylon に円錐専用のビルダーは無く、上面の直径 0 の円柱が円錐になる。
    mesh = BABYLON.MeshBuilder.CreateCylinder(
      name,
      {
        diameterBottom: part.diameter,
        diameterTop: 0,
        height: part.height,
        tessellation: part.tessellation,
      },
      scene,
    );
  } else if (part.shape === "sphere") {
    mesh = BABYLON.MeshBuilder.CreateSphere(
      name,
      {
        diameterX: part.diameterX,
        diameterY: part.diameterY,
        diameterZ: part.diameterZ,
        segments: part.segments,
      },
      scene,
    );
  } else if (part.shape === "cylinder") {
    mesh = BABYLON.MeshBuilder.CreateCylinder(
      name,
      {
        diameterBottom: part.diameterBottom,
        diameterTop: part.diameterTop,
        height: part.height,
        tessellation: part.tessellation,
      },
      scene,
    );
  } else {
    mesh = BABYLON.MeshBuilder.CreateTorus(
      name,
      { diameter: part.diameter, tessellation: 28, thickness: part.thickness },
      scene,
    );
  }

  if (part.flatShaded) {
    // 頂点を面ごとに分け、法線をならさない。球や円錐の面の境目が出る（岩・草の葉先用）。
    mesh.convertToFlatShadedMesh();
  }

  applyPartTransform(mesh, part);

  const material = new BABYLON.StandardMaterial(`${name}-mat`, scene);
  material.diffuseColor = toColor3(color);
  // プリミティブのみの見た目なので、鏡面反射は切って平坦に見せる。
  material.specularColor = new BABYLON.Color3(0, 0, 0);
  mesh.material = material;

  return mesh;
}

/**
 * 着せ替え品をキャラクターにぶら下げる（Issue #221）。
 *
 * 枠ごとにノードを1つ作り、そこへアンカーの位置・回転・拡大率を入れてからパーツを吊る。
 * **キャラクターのルートの子にするので、移動・向き・跳ねの縮みには自動で追従する。**
 * 位置合わせの計算をこちら側に書かないのは、二重に持たないため
 * （どこに付くかは lib/rpg-hub/equipment.ts が決める）。
 *
 * 我が家タウンと肖像（Issue #306）で付く位置がずれないよう、ここに1つだけ置いてある。
 * タップ判定や影など、使う側ごとに違う設定は `onMesh` で足す。
 * @param root - 着せる相手のルートノード
 * @param characterAssetId - 着せる相手のアセットID
 * @param equipment - 身に着けているもの
 * @param namePrefix - メッシュ名の接頭辞
 * @param scene - Babylon シーン
 * @param onMesh - 作ったメッシュごとに呼ぶ。使う側の設定を足す
 * @returns 作った枠ごとのノード（着け替えで消せるように返す）
 */
export function attachEquipment(
  root: any,
  characterAssetId: string,
  equipment: EquipmentMap | undefined,
  namePrefix: string,
  scene: any,
  onMesh: (mesh: any, name: string) => void,
): any[] {
  const anchors: any[] = [];
  resolveEquipment(characterAssetId, equipment).forEach((item) => {
    const anchor = new BABYLON.TransformNode(`${namePrefix}-${item.slot}`, scene);
    anchor.parent = root;
    anchor.position.set(item.anchor.position.x, item.anchor.position.y, item.anchor.position.z);
    anchor.rotation.set(item.anchor.rotation.x, item.anchor.rotation.y, item.anchor.rotation.z);
    anchor.scaling.set(item.anchor.scale, item.anchor.scale, item.anchor.scale);

    item.parts.forEach((part, index) => {
      const name = `${namePrefix}-${item.slot}-${index}`;
      const mesh = createPartMesh(part, scene, name, part.color);
      mesh.parent = anchor;
      onMesh(mesh, name);
    });
    anchors.push(anchor);
  });
  return anchors;
}

/**
 * キャラクター1体（体と着せ替え品）を組み立てる。
 *
 * 町に置かないキャラクター（肖像・更衣室のプレビュー）用。どちらも町と同じ姿に見えるよう、
 * 形は catalog.ts、色は palette.ts、装備は `attachEquipment` という同じ組み立て方を使う。
 * @param look - キャラクターの見た目
 * @param namePrefix - ノード・メッシュ名の接頭辞
 * @param scene - Babylon シーン
 * @returns キャラクターのルートノード。作り直すときはこれを dispose する
 */
export function createCharacter(look: PortraitLook, namePrefix: string, scene: any): any {
  const assetId = CHARACTER_TYPE_ASSET_IDS[look.characterType];
  const character = new BABYLON.TransformNode(namePrefix, scene);
  try {
    getBuildingParts(assetId).forEach((part, index) => {
      const mesh = createPartMesh(
        part,
        scene,
        `${namePrefix}-part-${index}`,
        resolvePartColor(part, look.palette),
      );
      mesh.parent = character;
    });
    attachEquipment(character, assetId, look.equipment, `${namePrefix}-equip`, scene, () => {});
  } catch (error) {
    // 途中まで作ったものを残すと、前の姿と重なって映る。片付けてから失敗を伝える
    character.dispose(false, true);
    throw error;
  }
  return character;
}
