// 既に動いているプレビューのシーンで、移動中にも使える正面の画像を作る（Issue #483）。
declare const BABYLON: any;

/** 保存する正方形の大きさ。端末の画面サイズによって画像が肥大化しないようにする */
const IMAGE_SIZE = 256;

/**
 * プレビューの回転・ズーム・縦横比に左右されない画像を作る。
 * エンジンとキャラクターは使い回し、撮影用のカメラだけ一時的に切り替える。
 * @param options - 表示中のシーン・キャラクター・床・描画先
 * @returns 透明な背景の正方形PNG
 */
export function capturePreviewPortrait(options: {
  canvas: HTMLCanvasElement;
  character: any;
  floor: any;
  scene: any;
}): string {
  const canvas = options.canvas;
  const character = options.character;
  const floor = options.floor;
  const scene = options.scene;
  const image = document.createElement("canvas");
  image.width = IMAGE_SIZE;
  image.height = IMAGE_SIZE;
  const context = image.getContext("2d");
  if (!context) throw new Error("画像を作る準備ができませんでした");

  const previousCamera = scene.activeCamera;
  const showFloor = floor?.isEnabled();
  const camera = new BABYLON.FreeCamera("preview-portrait", BABYLON.Vector3.Zero(), scene);
  try {
    character.getChildMeshes().forEach((mesh: any) => mesh.computeWorldMatrix(true));
    const bounds = character.getHierarchyBoundingVectors(true);
    const min = bounds.min;
    const max = bounds.max;
    const center = min.add(max).scale(0.5);
    // 通常の肖像（portrait.ts）と同じ正面・少し上の向きと余白。
    camera.position = center.add(new BABYLON.Vector3(0, 0.35, 1).normalize().scale(20));
    camera.minZ = 0.05;
    camera.mode = BABYLON.Camera.ORTHOGRAPHIC_CAMERA;
    camera.setTarget(center);
    const view = camera.getViewMatrix(true);
    let half = 0;
    [min.x, max.x].forEach((x: number) => {
      [min.y, max.y].forEach((y: number) => {
        [min.z, max.z].forEach((z: number) => {
          const point = BABYLON.Vector3.TransformCoordinates(new BABYLON.Vector3(x, y, z), view);
          half = Math.max(half, Math.abs(point.x), Math.abs(point.y));
        });
      });
    });
    half *= 1.18;
    const aspect = canvas.width / canvas.height;
    camera.orthoLeft = -half * Math.max(1, aspect);
    camera.orthoRight = -camera.orthoLeft;
    camera.orthoBottom = -half * Math.max(1, 1 / aspect);
    camera.orthoTop = -camera.orthoBottom;
    scene.activeCamera = camera;
    floor?.setEnabled(false);
    scene.render();

    const size = Math.min(canvas.width, canvas.height);
    context.drawImage(canvas, (canvas.width - size) / 2, (canvas.height - size) / 2, size, size,
      0, 0, IMAGE_SIZE, IMAGE_SIZE);
    return image.toDataURL("image/png");
  } finally {
    scene.activeCamera = previousCamera;
    floor?.setEnabled(showFloor);
    camera.dispose();
    scene.render();
  }
}
