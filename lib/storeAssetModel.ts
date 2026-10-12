import {
  Box3,
  BoxGeometry,
  CylinderGeometry,
  DoubleSide,
  Group,
  Mesh,
  MeshStandardMaterial,
  SphereGeometry,
  TorusGeometry,
  Vector3,
} from "three";
import { getBuildingParts } from "./rpg-hub/catalog.ts";
import type { BuildingPart } from "./rpg-hub/buildingParts.ts";
import type { AssetId } from "../types/map";
import { getStoreAssetKind } from "./storeAssets.ts";

/** 棚の1商品ぶんに収める寸法。回転後の実寸から縮尺を決める。 */
export const STORE_MODEL_SIZE = { width: 0.68, height: 0.68, depth: 0.52 };

function createGeometry(part: BuildingPart) {
  switch (part.shape) {
    case "box":
      return new BoxGeometry(part.width, part.height, part.depth);
    case "cone":
      return new CylinderGeometry(0, part.diameter / 2, part.height, part.tessellation);
    case "cylinder":
      return new CylinderGeometry(part.diameterTop / 2, part.diameterBottom / 2, part.height, part.tessellation);
    case "sphere":
      return new SphereGeometry(1, part.segments, part.segments, 0, Math.PI * 2, 0, Math.PI * (part.slice ?? 1))
        .scale(part.diameterX / 2, part.diameterY / 2, part.diameterZ / 2);
    case "torus":
      // Babylonの輪はXZ平面、Threeの輪はXY平面が基準なので、パーツの回転より先に揃える。
      return new TorusGeometry(part.diameter / 2, part.thickness / 2, 12, 28).rotateX(Math.PI / 2);
  }
}

/** 町・更衣室と同じ形と色を使い、底面を原点に揃えた棚用のモデルを返す。 */
export function createStoreAssetModel(assetId?: string | null): Group | null {
  if (!getStoreAssetKind(assetId)) return null;
  const shape = new Group();
  for (const part of getBuildingParts(assetId as AssetId)) {
    const material = new MeshStandardMaterial({
      color: part.color,
      flatShading: part.flatShaded ?? false,
      roughness: 1,
      ...(part.shape === "sphere" && part.slice !== undefined ? { side: DoubleSide } : {}),
    });
    const mesh = new Mesh(createGeometry(part), material);
    mesh.position.set(part.position.x, part.position.y, part.position.z);
    if (part.rotation) mesh.rotation.set(part.rotation.x, part.rotation.y, part.rotation.z);
    shape.add(mesh);
  }
  // 草や帽子のつばも見えるよう、少し上から見る向きで展示する。
  shape.rotation.set(0.3, -0.35, 0);
  const bounds = new Box3().setFromObject(shape);
  const size = bounds.getSize(new Vector3());
  const center = bounds.getCenter(new Vector3());
  shape.position.set(-center.x, -bounds.min.y, -center.z);
  const model = new Group();
  model.name = assetId;
  model.scale.setScalar(Math.min(
    STORE_MODEL_SIZE.width / size.x,
    STORE_MODEL_SIZE.height / size.y,
    STORE_MODEL_SIZE.depth / size.z,
  ));
  model.add(shape);
  return model;
}

/** 棚の切り替えや画面を閉じたとき、primitive内のGPU資源を解放する。 */
export function disposeStoreAssetModel(model: Group | null) {
  model?.traverse((object) => {
    if (!(object instanceof Mesh)) return;
    object.geometry.dispose();
    const materials = Array.isArray(object.material) ? object.material : [object.material];
    materials.forEach((material) => material.dispose());
  });
}
