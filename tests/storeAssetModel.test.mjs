import assert from "node:assert/strict";
import test from "node:test";
import { Box3, Mesh, Vector3 } from "three";
import { STORE_ASSETS } from "../lib/storeAssets.ts";
import { createStoreAssetModel, disposeStoreAssetModel, STORE_MODEL_SIZE } from "../lib/storeAssetModel.ts";

test("全販売アセットが棚に収まり、底面が揃い、回転しても隣の商品へはみ出さない", () => {
  for (const asset of STORE_ASSETS) {
    const model = createStoreAssetModel(asset.id);
    assert.ok(model, asset.id);
    const bounds = new Box3().setFromObject(model);
    const size = bounds.getSize(new Vector3());
    const center = bounds.getCenter(new Vector3());
    assert.ok(size.x > 0 && size.y > 0 && size.z > 0, asset.id);
    assert.ok(size.x <= STORE_MODEL_SIZE.width + 1e-6, asset.id);
    assert.ok(size.y <= STORE_MODEL_SIZE.height + 1e-6, asset.id);
    assert.ok(size.z <= STORE_MODEL_SIZE.depth + 1e-6, asset.id);
    assert.ok(Math.abs(bounds.min.y) < 1e-6, asset.id);
    assert.ok(Math.abs(center.x) < 1e-6 && Math.abs(center.z) < 1e-6, asset.id);
    disposeStoreAssetModel(model);
  }
});

test("めがねの輪とキャップの半球が、塗りつぶした箱や球にならずに表示される", () => {
  const glasses = createStoreAssetModel("wearable-glasses");
  const cap = createStoreAssetModel("wearable-cap");
  const meshes = (model) => {
    const result = [];
    model.traverse((object) => { if (object instanceof Mesh) result.push(object); });
    return result;
  };
  assert.equal(meshes(glasses).filter((mesh) => mesh.geometry.type === "TorusGeometry").length, 2);
  const dome = meshes(cap).find((mesh) => mesh.geometry.type === "SphereGeometry");
  assert.ok(dome);
  dome.geometry.computeBoundingBox();
  assert.ok(dome.geometry.boundingBox.min.y >= -1e-6, "キャップの下半分を描かない");
  disposeStoreAssetModel(glasses);
  disposeStoreAssetModel(cap);
});

test("通常商品・未知のID・販売しないアセットは既存の木箱表示に任せる", () => {
  for (const id of [null, undefined, "", "missing", "building-store", "player-frog"]) {
    assert.equal(createStoreAssetModel(id), null);
  }
});
