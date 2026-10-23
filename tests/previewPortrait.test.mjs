import assert from "node:assert/strict";
import test from "node:test";
import { capturePreviewPortrait } from "../webview/rpg-hub/previewPortrait.ts";

const PNG = "data:image/png;base64,iVBORw0KGgo=";

/** 撮影カメラから見た座標まで計算する、Babylonの最小限の代わり。 */
class Vector3 {
  constructor(x, y, z) { Object.assign(this, { x, y, z }); }
  static Zero() { return new Vector3(0, 0, 0); }
  static TransformCoordinates(point, view) { return view.project(point); }
  add(other) { return new Vector3(this.x + other.x, this.y + other.y, this.z + other.z); }
  subtract(other) { return this.add(other.scale(-1)); }
  scale(value) { return new Vector3(this.x * value, this.y * value, this.z * value); }
  normalize() { return this.scale(1 / Math.hypot(this.x, this.y, this.z)); }
}

const dot = (a, b) => a.x * b.x + a.y * b.y + a.z * b.z;
const cross = (a, b) => new Vector3(
  a.y * b.z - a.z * b.y,
  a.z * b.x - a.x * b.z,
  a.x * b.y - a.y * b.x,
);

/** 通常のプレビューと、生成された画像・一時カメラを記録する。 */
function setup(t, { width, height, floorEnabled = true, imageError = null }) {
  const previousBabylon = Object.getOwnPropertyDescriptor(globalThis, "BABYLON");
  const previousDocument = Object.getOwnPropertyDescriptor(globalThis, "document");
  t.after(() => {
    if (previousBabylon) Object.defineProperty(globalThis, "BABYLON", previousBabylon);
    else delete globalThis.BABYLON;
    if (previousDocument) Object.defineProperty(globalThis, "document", previousDocument);
    else delete globalThis.document;
  });

  const cameras = [];
  class FreeCamera {
    constructor(name, position) {
      Object.assign(this, { disposed: false, name, position });
      cameras.push(this);
    }
    setTarget(target) { this.target = target; }
    getViewMatrix() {
      const forward = this.target.subtract(this.position).normalize();
      const right = cross(forward, new Vector3(0, 1, 0)).normalize();
      const up = cross(right, forward);
      return {
        project: (point) => {
          const relative = point.subtract(this.position);
          return new Vector3(dot(relative, right), dot(relative, up), -dot(relative, forward));
        },
      };
    }
    dispose() { this.disposed = true; }
  }
  globalThis.BABYLON = { Camera: { ORTHOGRAPHIC_CAMERA: 1 }, FreeCamera, Vector3 };

  const draws = [];
  const image = {
    width: 0,
    height: 0,
    getContext: (kind) => {
      assert.equal(kind, "2d");
      return { drawImage: (...args) => draws.push(args) };
    },
    toDataURL: (format) => {
      assert.equal(format, "image/png");
      if (imageError) throw imageError;
      return PNG;
    },
  };
  globalThis.document = {
    createElement: (tag) => {
      assert.equal(tag, "canvas");
      return image;
    },
  };

  const canvas = { width, height };
  const previousCamera = { alpha: 3.7, beta: 1.2, radius: 0.7 };
  const floorChanges = [];
  let enabled = floorEnabled;
  const floor = {
    isEnabled: () => enabled,
    setEnabled: (value) => { enabled = value; floorChanges.push(value); },
  };
  const renders = [];
  const scene = {
    activeCamera: previousCamera,
    render: () => renders.push({ camera: scene.activeCamera, floorEnabled: enabled }),
  };
  const bounds = { min: new Vector3(4, 1, -2), max: new Vector3(6, 5, -1) };
  const meshes = [{ computed: false }, { computed: false }];
  const character = {
    getChildMeshes: () => meshes.map((mesh) => ({
      computeWorldMatrix: (force) => { assert.equal(force, true); mesh.computed = true; },
    })),
    getHierarchyBoundingVectors: (includeChildren) => {
      assert.equal(includeChildren, true);
      assert.ok(meshes.every((mesh) => mesh.computed));
      return bounds;
    },
  };
  return { bounds, cameras, draws, floorChanges, image, options: { canvas, character, floor, scene }, previousCamera, renders };
}

/** 回転・ズームしていた既存カメラを使わず、正面から全体を収めていること。 */
function assertFrontCamera(fixture) {
  const camera = fixture.cameras[0];
  const center = fixture.bounds.min.add(fixture.bounds.max).scale(0.5);
  assert.deepEqual(camera.target, center);
  const direction = camera.position.subtract(center).normalize();
  assert.ok(Math.abs(direction.x) < 1e-12);
  assert.ok(direction.z > 0);
  assert.ok(Math.abs(direction.y / direction.z - 0.35) < 1e-12);
  assert.equal(camera.mode, BABYLON.Camera.ORTHOGRAPHIC_CAMERA);
  const offset = camera.position.subtract(center);
  assert.ok(Math.abs(Math.hypot(offset.x, offset.y, offset.z) - 20) < 1e-12);

  // 長い辺を広げて描いてから中央の正方形へ切り出しても、全パーツがその内側に残る。
  const squareHalf = Math.min(camera.orthoRight, camera.orthoTop);
  const view = camera.getViewMatrix();
  for (const x of [fixture.bounds.min.x, fixture.bounds.max.x]) {
    for (const y of [fixture.bounds.min.y, fixture.bounds.max.y]) {
      for (const z of [fixture.bounds.min.z, fixture.bounds.max.z]) {
        const point = Vector3.TransformCoordinates(new Vector3(x, y, z), view);
        assert.ok(Math.abs(point.x) < squareHalf);
        assert.ok(Math.abs(point.y) < squareHalf);
      }
    }
  }
  assert.equal(fixture.renders[0].camera, camera);
  assert.equal(fixture.renders[0].floorEnabled, false);
}

for (const dimensions of [
  { width: 800, height: 220, cropX: 290, cropY: 0, floorEnabled: true, label: "横長" },
  { width: 220, height: 800, cropX: 0, cropY: 290, floorEnabled: false, label: "縦長" },
]) {
  test(`${dimensions.label}のプレビューでも正面から撮り、中央の正方形を固定サイズで切り出す`, (t) => {
    const fixture = setup(t, dimensions);

    assert.equal(capturePreviewPortrait(fixture.options), PNG);

    assert.equal(fixture.image.width, 256);
    assert.equal(fixture.image.height, 256);
    assert.deepEqual(fixture.draws, [[fixture.options.canvas,
      dimensions.cropX, dimensions.cropY, 220, 220, 0, 0, 256, 256]]);
    assertFrontCamera(fixture);
    const camera = fixture.cameras[0];
    assert.ok(Math.abs(camera.orthoRight / camera.orthoTop - dimensions.width / dimensions.height) < 1e-12);
    assert.equal(fixture.options.scene.activeCamera, fixture.previousCamera);
    assert.deepEqual(fixture.previousCamera, { alpha: 3.7, beta: 1.2, radius: 0.7 });
    assert.deepEqual(fixture.floorChanges, [false, dimensions.floorEnabled]);
    assert.equal(camera.disposed, true);
    assert.deepEqual(fixture.renders[1], { camera: fixture.previousCamera, floorEnabled: dimensions.floorEnabled });
  });
}

test("PNGの書き出しに失敗しても、元のカメラと床を戻して一時カメラを破棄する", (t) => {
  const imageError = new Error("PNGの書き出し失敗");
  const fixture = setup(t, { width: 800, height: 220, imageError });

  assert.throws(() => capturePreviewPortrait(fixture.options), (error) => error === imageError);

  assert.equal(fixture.options.scene.activeCamera, fixture.previousCamera);
  assert.deepEqual(fixture.floorChanges, [false, true]);
  assert.equal(fixture.cameras[0].disposed, true);
  assert.deepEqual(fixture.renders, [
    { camera: fixture.cameras[0], floorEnabled: false },
    { camera: fixture.previousCamera, floorEnabled: true },
  ]);
});
