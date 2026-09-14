// RPGハブ（WebView + Babylon.js）の WebView 側シーン。
//
// このファイルは esbuild でバンドルされ（scripts/build-rpg-scene.mjs）、
// 自己完結 HTML のインラインスクリプトとして WebView に読み込まれる。
// Babylon 本体は同じ HTML に UMD でインラインされている前提で、グローバルの
// BABYLON を参照する（バンドル対象には含めない）。
//
// 責務の分離（docs/RPG_HUB_ARCHITECTURE.md 5.3）:
//   - プレイヤー位置の「正」はこのゲームループが保持する。描画・衝突・接近判定・
//     カメラ追従は毎フレーム同じ値を参照する
//   - RN へ送るのは間引いた位置スナップショットと、接近対象・遷移の変化のみ
//   - 移動・衝突・接近判定のルールは lib/rpg-hub/movement.ts をそのまま使う。
//     RN 側のテスト（tests/rpgHub.test.mjs）が保証しているロジックと同一にするため

import { getBuildingParts, type BuildingPart } from "../../lib/rpg-hub/buildingParts";
import { PLAYER_COLLISION_RADIUS, findNearbyBuildingId, moveWithinMap } from "../../lib/rpg-hub/movement";
import { SEASON_COLORS } from "../../lib/rpg-hub/season";
import {
  encodeEvent,
  parseIntent,
  type Direction,
  type RpgHubEvent,
} from "../../lib/rpg-hub/bridge";
import type { MapObject, Season } from "../../types/map";

// Babylon UMD がグローバルに載せる名前空間。型は使わず any で受ける
// （@babylonjs/core の型を入れると RN 側のバンドルにも影響するため）。
declare const BABYLON: any;

declare global {
  interface Window {
    ReactNativeWebView?: { postMessage: (message: string) => void };
  }
}

/** 位置スナップショットを RN へ送る最小間隔（ms）。毎フレーム送らないための間引き。 */
const POSITION_SNAPSHOT_INTERVAL_MS = 100;

/** 移動量の基準。RN 側 VirtualPad の MOVE_INTERVAL_MS(50ms) / MAX_STEP(0.12) と揃える。 */
const INPUT_STEP_INTERVAL_MS = 50;

/** カメラのプレイヤーからのオフセット。R3F 版の CAMERA_OFFSET と同じ。 */
const CAMERA_OFFSET = { x: 9, y: 11, z: 9 };

/** 正射影カメラの表示範囲。R3F 版の zoom: 45 相当の見え方に合わせる。 */
const ORTHO_HALF_HEIGHT = 7.5;

/** プレイヤーの見た目。R3F 版 Player.tsx の capsuleGeometry に合わせる。 */
const PLAYER_HEIGHT = 0.7 + PLAYER_COLLISION_RADIUS * 2;
const PLAYER_CENTER_Y = 0.65;

function postToRN(event: RpgHubEvent): void {
  window.ReactNativeWebView?.postMessage(encodeEvent(event));
}

/**
 * #rrggbb を Babylon の Color3 に変換する。
 * @param hex - 16進カラーコード
 * @returns Babylon.Color3
 */
function toColor3(hex: string): any {
  return BABYLON.Color3.FromHexString(hex);
}

/**
 * パーツ定義1つ分から Babylon のメッシュを生成する。
 * @param part - パーツ定義
 * @param scene - Babylon シーン
 * @param name - メッシュ名
 * @returns 生成したメッシュ
 */
function createPartMesh(part: BuildingPart, scene: any, name: string): any {
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
      { diameter: part.diameter, tessellation: 16, thickness: part.thickness },
      scene,
    );
  }

  mesh.position.set(part.position.x, part.position.y, part.position.z);
  if (part.rotation) {
    mesh.rotation.set(part.rotation.x, part.rotation.y, part.rotation.z);
  }

  const material = new BABYLON.StandardMaterial(`${name}-mat`, scene);
  material.diffuseColor = toColor3(part.color);
  // プリミティブのみの見た目なので、鏡面反射は切って平坦に見せる。
  material.specularColor = new BABYLON.Color3(0, 0, 0);
  mesh.material = material;

  return mesh;
}

function main(): void {
  const canvas = document.getElementById("renderCanvas") as HTMLCanvasElement | null;
  if (!canvas) {
    postToRN({ event: "error", message: "renderCanvas が見つかりません" });
    return;
  }
  if (typeof BABYLON === "undefined") {
    postToRN({ event: "error", message: "BABYLON グローバルが読み込まれていません" });
    return;
  }

  const engine = new BABYLON.Engine(canvas, true, { preserveDrawingBuffer: true, stencil: true });
  const scene = new BABYLON.Scene(engine);

  // Three.js（R3F 版）は右手系。既存の MapObject の座標・entranceOffset・移動ロジックは
  // すべてその前提で作られているため、Babylon も右手系に揃えて値をそのまま使えるようにする。
  // 左手系のままだと Z 軸が反転し、建物の正面と入口の向きが裏返る。
  scene.useRightHandedSystem = true;

  const camera = new BABYLON.FreeCamera("camera", new BABYLON.Vector3(9, 11, 9), scene);
  camera.mode = BABYLON.Camera.ORTHOGRAPHIC_CAMERA;
  camera.minZ = 0.1;
  camera.maxZ = 100;

  const ambient = new BABYLON.HemisphericLight("ambient", new BABYLON.Vector3(0, 1, 0), scene);
  ambient.intensity = 1.05;
  const sun = new BABYLON.DirectionalLight("sun", new BABYLON.Vector3(-0.5, -1, -0.5), scene);
  sun.intensity = 1.1;

  const ground = BABYLON.MeshBuilder.CreateGround("ground", { height: 100, width: 100 }, scene);
  ground.position.y = -0.08;
  const groundMaterial = new BABYLON.StandardMaterial("ground-mat", scene);
  groundMaterial.specularColor = new BABYLON.Color3(0, 0, 0);
  ground.material = groundMaterial;

  const player = BABYLON.MeshBuilder.CreateCapsule(
    "player",
    { height: PLAYER_HEIGHT, radius: PLAYER_COLLISION_RADIUS },
    scene,
  );
  player.position.set(0, PLAYER_CENTER_Y, 0);
  const playerMaterial = new BABYLON.StandardMaterial("player-mat", scene);
  playerMaterial.diffuseColor = toColor3("#ef4444");
  playerMaterial.specularColor = new BABYLON.Color3(0, 0, 0);
  player.material = playerMaterial;

  // --- 状態（このゲームループが正とする値） ---
  let objects: MapObject[] = [];
  let position = { x: 0, z: 0 };
  let direction: Direction = "up";
  let input = { direction: null as Direction | null, x: 0, z: 0 };
  let inputEnabled = true;
  let nearbyId: string | null = null;
  let lastSnapshotAt = 0;
  let lastSnapshot = { x: Number.NaN, z: Number.NaN };

  /** オブジェクトID → 生成済みルートノード。setMap のたびに作り直す。 */
  const objectRoots = new Map<string, any>();
  /** ピッキング用: メッシュ名 → 建物のオブジェクトID。 */
  const pickableIds = new Map<string, string>();

  function applySeason(season: Season): void {
    const colors = SEASON_COLORS[season];
    groundMaterial.diffuseColor = toColor3(colors.ground);
    const sky = toColor3(colors.sky);
    scene.clearColor = new BABYLON.Color4(sky.r, sky.g, sky.b, 1);
  }

  function clearObjects(): void {
    objectRoots.forEach((root) => root.dispose(false, true));
    objectRoots.clear();
    pickableIds.clear();
  }

  function buildObject(object: MapObject): void {
    const root = new BABYLON.TransformNode(`object-${object.id}`, scene);
    root.position.set(object.position.x, object.position.y, object.position.z);
    root.rotation.y = object.rotationY ?? 0;
    const scale = object.scale ?? 1;
    root.scaling.set(scale, scale, scale);

    getBuildingParts(object.model).forEach((part, index) => {
      const name = `object-${object.id}-part-${index}`;
      const mesh = createPartMesh(part, scene, name);
      mesh.parent = root;
      if (object.interactive) {
        mesh.isPickable = true;
        pickableIds.set(name, object.id);
      } else {
        mesh.isPickable = false;
      }
    });

    objectRoots.set(object.id, root);
  }

  function applyMap(nextObjects: MapObject[], season: Season): void {
    objects = nextObjects;
    clearObjects();
    nextObjects.forEach(buildObject);
    applySeason(season);
    // マップが入れ替わったら接近対象も取り直す。
    updateNearby(true);
  }

  function updateNearby(force: boolean): void {
    const nextNearbyId = findNearbyBuildingId(position, objects);
    if (!force && nextNearbyId === nearbyId) return;
    nearbyId = nextNearbyId;
    postToRN({ event: "nearby", id: nearbyId });
  }

  function sendPositionSnapshot(now: number): void {
    if (now - lastSnapshotAt < POSITION_SNAPSHOT_INTERVAL_MS) return;
    if (position.x === lastSnapshot.x && position.z === lastSnapshot.z) return;
    lastSnapshotAt = now;
    lastSnapshot = { x: position.x, z: position.z };
    postToRN({ direction, event: "position", x: position.x, z: position.z });
  }

  // --- 建物のタップ ---
  scene.onPointerObservable.add((pointerInfo: any) => {
    if (pointerInfo.type !== BABYLON.PointerEventTypes.POINTERPICK) return;
    if (!inputEnabled) return;
    const picked = pointerInfo.pickInfo?.pickedMesh;
    if (!picked) return;
    const objectId = pickableIds.get(picked.name);
    if (!objectId) return;
    const target = objects.find((object) => object.id === objectId);
    if (!target || target.type !== "building") return;
    postToRN({ event: "navigate", route: target.route });
  });

  // --- ゲームループ ---
  scene.onBeforeRenderObservable.add(() => {
    const deltaMs = engine.getDeltaTime();
    const now = performance.now();

    if (inputEnabled && input.direction) {
      // RN 側 VirtualPad は 50ms 間隔で移動量を刻む前提の値を送ってくる。
      // こちらは可変フレームレートなので、経過時間で比例させて同じ速度にする。
      // フレームが詰まった後に一度で大きく動かないよう、1ステップ分を上限にする。
      const ratio = Math.min(deltaMs, INPUT_STEP_INTERVAL_MS) / INPUT_STEP_INTERVAL_MS;
      const moved = moveWithinMap(
        position,
        { x: input.x * ratio, z: input.z * ratio },
        objects,
      );
      if (moved.x !== position.x || moved.z !== position.z) {
        position = moved;
        direction = input.direction;
        updateNearby(false);
      }
    }

    player.position.x = position.x;
    player.position.z = position.z;

    // 正射影カメラを毎フレームプレイヤーへ追従させる。R3F 版と同じ見た目にするため、
    // 視点はオフセット固定でプレイヤーを注視する。
    camera.position.set(
      position.x + CAMERA_OFFSET.x,
      CAMERA_OFFSET.y,
      position.z + CAMERA_OFFSET.z,
    );
    camera.setTarget(new BABYLON.Vector3(position.x, 0, position.z));

    sendPositionSnapshot(now);
  });

  function applyOrthoSize(): void {
    const aspect = engine.getRenderWidth() / Math.max(1, engine.getRenderHeight());
    camera.orthoTop = ORTHO_HALF_HEIGHT;
    camera.orthoBottom = -ORTHO_HALF_HEIGHT;
    camera.orthoLeft = -ORTHO_HALF_HEIGHT * aspect;
    camera.orthoRight = ORTHO_HALF_HEIGHT * aspect;
  }

  applyOrthoSize();
  applySeason("spring");

  engine.runRenderLoop(() => {
    scene.render();
  });

  window.addEventListener("resize", () => {
    engine.resize();
    applyOrthoSize();
  });

  // --- RN からの意図を受け取る ---
  function handleIntent(raw: unknown): void {
    const parsed = parseIntent(raw);
    if (!parsed.success) return;
    const intent = parsed.intent;

    if (intent.type === "setMap") {
      applyMap(intent.objects, intent.season);
      return;
    }
    if (intent.type === "setInput") {
      input = { direction: intent.direction, x: intent.x, z: intent.z };
      return;
    }
    if (intent.type === "setInputEnabled") {
      inputEnabled = intent.enabled;
      if (!intent.enabled) input = { direction: null, x: 0, z: 0 };
    }
  }

  // react-native-webview の postMessage は Android / iOS で window / document の
  // どちらに message を飛ばすか差があるため両方で受ける。
  window.addEventListener("message", (e) => handleIntent((e as MessageEvent).data));
  document.addEventListener("message", (e) => handleIntent((e as unknown as MessageEvent).data));

  scene.executeWhenReady(() => {
    postToRN({ event: "ready" });
  });
}

window.onerror = (message) => {
  postToRN({ event: "error", message: String(message) });
};

main();
