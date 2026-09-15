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

import { RPG_HUB_ASSETS } from "../../lib/rpg-hub/assets";
import { getBuildingParts, type BuildingPart } from "../../lib/rpg-hub/buildingParts";
import { findNearbyInteractiveId, moveWithinMap } from "../../lib/rpg-hub/movement";
import { createNpcWanderState, stepNpcWander, type NpcWanderState } from "../../lib/rpg-hub/npcWander";
import {
  HOP_HEIGHT,
  createPlayerMotionState,
  getHopLift,
  stepPlayerMotion,
} from "../../lib/rpg-hub/playerMotion";
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

/**
 * 描画解像度の上限（端末のピクセル密度の何倍まで描くか）。
 * 上げるほど輪郭がなめらかになるが、塗る面積が倍率の2乗で増える。
 */
const MAX_PIXEL_RATIO = 2;

/** 平行光の向き。影の落ちる向きもこれで決まる。 */
const SUN_DIRECTION = { x: -0.35, y: -1, z: -0.75 };

/**
 * 影を落とす範囲の半分の幅。カメラに映る範囲（縦 ORTHO_HALF_HEIGHT × 2 ＋ 建物の高さ）を
 * 覆えればよい。広げるほど同じ解像度で影が粗くなる。
 */
const SHADOW_AREA_HALF = 11;

/**
 * 影の解像度。SHADOW_AREA_HALF × 2 の範囲をこの枚数で割った細かさになる。
 * **重かったらここを 512 に下げるか、SHADOW_ENABLED を false にする。**
 */
const SHADOW_MAP_SIZE = 1024;

/**
 * 影を描くかどうか。
 * 影があると物が地面に乗って見えるが、描画のパスが1回増える。
 * 低スペック端末で重い場合にすぐ戻せるよう、1か所にまとめてある。
 */
const SHADOW_ENABLED = true;

/** 影の濃さ。1で真っ黒。地面の色が分かる程度に残す。 */
const SHADOW_DARKNESS = 0.42;

/** 平行光をプレイヤーからどれだけ引いた位置に置くか（影の範囲の中心決めに使う）。 */
const SUN_DISTANCE = 35;

/**
 * プレイヤー（カエル）の原点の高さ。
 * パーツはローカル原点を中心に組んであるため、手の底（-0.33）を地面のすぐ下へ持ち上げる。
 * わずかに埋めるのは、地面との境目が浮いて見えないようにするため（装飾物の groundedY と同じ）。
 */
const PLAYER_CENTER_Y = 0.28;

/**
 * NPCの移動判定で、プレイヤーを表す仮の障害物の一辺。
 * 住人（0.7）と同じにして、人ひとりぶんとして扱う。
 */
const PLAYER_BLOCK_SIZE = 0.7;

/** 上の仮の障害物のid。マップのidと重ならないようにする。 */
const PLAYER_OBSTACLE_ID = "__player__";

/** 跳ねたときの潰れ・伸びの強さ。跳び上がるほど縦に伸び、横に細くなる。 */
const HOP_STRETCH = 0.22;

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
function createPartMesh(part: BuildingPart, scene: any, name: string, color: string): any {
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

  mesh.position.set(part.position.x, part.position.y, part.position.z);
  if (part.rotation) {
    mesh.rotation.set(part.rotation.x, part.rotation.y, part.rotation.z);
  }

  const material = new BABYLON.StandardMaterial(`${name}-mat`, scene);
  material.diffuseColor = toColor3(color);
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

  const engine = new BABYLON.Engine(canvas, true, {
    // 画面をキャプチャしないので、描画バッファを保持する必要はない。
    // 保持を頼むと環境によっては MSAA（アンチエイリアス）が効かなくなる。
    // （Babylon のサンプルの写しで true になっていた）
    preserveDrawingBuffer: false,
    powerPreference: "high-performance",
    stencil: false,
  });
  const scene = new BABYLON.Scene(engine);

  // Three.js（R3F 版）は右手系。既存の MapObject の座標・entranceOffset・移動ロジックは
  // すべてその前提で作られているため、Babylon も右手系に揃えて値をそのまま使えるようにする。
  // 左手系のままだと Z 軸が反転し、建物の正面と入口の向きが裏返る。
  scene.useRightHandedSystem = true;

  const camera = new BABYLON.FreeCamera("camera", new BABYLON.Vector3(9, 11, 9), scene);
  camera.mode = BABYLON.Camera.ORTHOGRAPHIC_CAMERA;
  camera.minZ = 0.1;
  camera.maxZ = 100;

  // 照明の強さは、**上を向いた面の明るさが合計でほぼ 1.0 になる**ように決めている。
  // 1.0 を超えると素材の色がそのまま出ず、明るい色から順に白へ潰れる。
  // （環境光1.05＋平行光1.1 だった頃は上向きの面が実質2.15倍で、春の地面 #9bd18b も
  //   道の石色 #a39a8c も真っ白になり、道が見えなくなっていた。Issue #214）
  //
  // 環境光の groundColor は、光の当たらない面が真っ暗にならないよう少しだけ明るくする。
  const ambient = new BABYLON.HemisphericLight("ambient", new BABYLON.Vector3(0, 1, 0), scene);
  ambient.intensity = 0.42;
  ambient.groundColor = new BABYLON.Color3(0.4, 0.4, 0.4);
  // 平行光はX方向とZ方向で当たり方を変える。左右対称にすると、カメラから見える
  // +X面と+Z面が同じ明るさになり、箱の角が消えて平べったく見えるため。
  const sunDirection = new BABYLON.Vector3(SUN_DIRECTION.x, SUN_DIRECTION.y, SUN_DIRECTION.z);
  const sun = new BABYLON.DirectionalLight("sun", sunDirection, scene);
  sun.intensity = 0.72;

  // 影。物が地面に乗っているように見せるための、いちばん効く要素。
  // 平行光なので、影を落とす範囲は光の位置と ortho* で決まる。範囲をマップ全体ではなく
  // 固定の大きさにして毎フレームプレイヤーへ追従させることで、同じ解像度でも影を細かく保つ。
  const sunOffset = sunDirection.normalizeToNew().scale(-SUN_DISTANCE);
  let shadowGenerator: any = null;
  let shadowMap: any = null;
  if (SHADOW_ENABLED) {
    sun.autoUpdateExtends = false;
    sun.orthoLeft = -SHADOW_AREA_HALF;
    sun.orthoRight = SHADOW_AREA_HALF;
    sun.orthoBottom = -SHADOW_AREA_HALF;
    sun.orthoTop = SHADOW_AREA_HALF;
    sun.shadowMinZ = 1;
    sun.shadowMaxZ = SUN_DISTANCE * 2;
    shadowGenerator = new BABYLON.ShadowGenerator(SHADOW_MAP_SIZE, sun);
    // 影の縁をぼかす。WebGL2 が無い環境では Babylon が自動でポアソンサンプリングへ落ちる。
    shadowGenerator.usePercentageCloserFiltering = true;
    shadowGenerator.filteringQuality = BABYLON.ShadowGenerator.QUALITY_MEDIUM;
    shadowGenerator.darkness = SHADOW_DARKNESS;
    // 平らな面が自分の影で縞になる（シャドウアクネ）のを防ぐ。
    // 軒と壁の境目がギザギザになるのはこの値が足りないときで、上げると消える代わりに
    // 接地部分の影がわずかに痩せる。
    shadowGenerator.bias = 0.008;
    shadowGenerator.normalBias = 0.05;
    shadowMap = shadowGenerator.getShadowMap();
  }

  /**
   * メッシュを影の対象にする。
   * @param mesh - 対象のメッシュ
   * @param casts - 影を落とす側にするか（地面に貼りつく道のタイルなどは false）
   */
  function applyShadow(mesh: any, casts: boolean): void {
    if (!shadowMap) return;
    mesh.receiveShadows = true;
    if (casts) shadowMap.renderList.push(mesh);
  }

  // 歩ける範囲に上限がないため、地面メッシュはプレイヤーに合わせて動かす。
  // 単色なので動かしても見た目には分からず、端が見えることもない。
  const ground = BABYLON.MeshBuilder.CreateGround("ground", { height: 100, width: 100 }, scene);
  ground.position.y = -0.08;
  const groundMaterial = new BABYLON.StandardMaterial("ground-mat", scene);
  groundMaterial.specularColor = new BABYLON.Color3(0, 0, 0);
  ground.material = groundMaterial;
  ground.receiveShadows = true;

  // プレイヤーも建物・住人と同じパーツ定義から組み立てる。形をデータ側に1つだけ持つため。
  const player = new BABYLON.TransformNode("player", scene);
  player.position.set(0, PLAYER_CENTER_Y, 0);
  getBuildingParts(RPG_HUB_ASSETS.player).forEach((part, index) => {
    const mesh = createPartMesh(part, scene, `player-part-${index}`, part.color);
    // 自分をタップしても何も起きないうえ、後ろの建物が拾えなくなるため対象から外す。
    mesh.isPickable = false;
    mesh.parent = player;
    applyShadow(mesh, true);
  });

  // --- 状態（このゲームループが正とする値） ---
  let objects: MapObject[] = [];
  let position = { x: 0, z: 0 };
  let direction: Direction = "up";
  let input = { direction: null as Direction | null, x: 0, z: 0 };
  let inputEnabled = true;
  let nearbyId: string | null = null;
  let lastSnapshotAt = 0;
  let lastSnapshot = { x: Number.NaN, z: Number.NaN };
  // 向きと跳ねの位相。見た目だけの値で、当たり判定・接近判定には関わらない
  let playerMotion = createPlayerMotionState();

  /**
   * NPCの移動判定だけで使う、プレイヤーを表す仮の障害物。
   *
   * NPCは `objects` しか見ないため、これが無いとプレイヤーの上へ歩いて乗り上げる。
   * 乗り上げられるとプレイヤーは障害物の中に入った状態になり、動けなくなる
   * （movement.ts 側にも抜け出すための逃げ道を入れてあるが、そもそも重ならないようにする）。
   * 描画もタップ判定もしないので、マップデータには入れない。
   */
  const playerObstacle: MapObject = {
    collidable: true,
    collisionSize: { depth: PLAYER_BLOCK_SIZE, width: PLAYER_BLOCK_SIZE },
    id: PLAYER_OBSTACLE_ID,
    interactive: false,
    model: RPG_HUB_ASSETS.player,
    position: { x: 0, y: 0, z: 0 },
    type: "decoration",
  };
  /** NPCの移動判定に渡す一覧。マップのオブジェクト＋プレイヤー。 */
  let npcCollisionObjects: MapObject[] = [playerObstacle];

  /** オブジェクトID → 生成済みルートノード。setMap のたびに作り直す。 */
  const objectRoots = new Map<string, any>();
  // 歩き回るNPCの状態。位置の正はここが持ち、RN へは送らない（設計書6.3）。
  const npcStates = new Map<string, NpcWanderState>();
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
    npcStates.clear();
    // 破棄したメッシュが影のリストに残ると、そのぶん無駄に描こうとする
    if (shadowMap?.renderList) {
      shadowMap.renderList = shadowMap.renderList.filter((mesh: any) => !mesh.isDisposed());
    }
  }

  function buildObject(object: MapObject): void {
    const root = new BABYLON.TransformNode(`object-${object.id}`, scene);
    root.position.set(object.position.x, object.position.y, object.position.z);
    root.rotation.y = object.rotationY ?? 0;
    const scale = object.scale ?? 1;
    root.scaling.set(scale, scale, scale);

    getBuildingParts(object.model).forEach((part, index) => {
      const name = `object-${object.id}-part-${index}`;
      // パーツに差し替え枠があり、オブジェクト側に同じ枠の色があればそちらを使う。
      // 同じ形のNPCを、色だけ変えて何体も置けるようにするため。
      const color = (part.paletteSlot && object.palette?.[part.paletteSlot]) || part.color;
      const mesh = createPartMesh(part, scene, name, color);
      mesh.parent = root;
      if (object.interactive) {
        mesh.isPickable = true;
        pickableIds.set(name, object.id);
      } else {
        mesh.isPickable = false;
      }
      // 道のタイルは地面に貼りついた板なので、影を落とす側にすると自分の影で
      // 縞模様が出る。草むらは細すぎて影が点のノイズにしかならず、数のわりに
      // 影のパスを重くする。どちらも受けるだけにする。
      const castsShadow =
        object.model !== RPG_HUB_ASSETS.path && object.model !== RPG_HUB_ASSETS.grass;
      applyShadow(mesh, castsShadow);
    });

    objectRoots.set(object.id, root);
    if (object.type === "npc") {
      npcStates.set(object.id, createNpcWanderState(object, Math.random));
    }
  }

  function applyMap(nextObjects: MapObject[], season: Season): void {
    objects = nextObjects;
    npcCollisionObjects = [...nextObjects, playerObstacle];
    clearObjects();
    nextObjects.forEach(buildObject);
    applySeason(season);
    // マップが入れ替わったら接近対象も取り直す。
    updateNearby(true);
  }

  /**
   * NPCを1フレームぶん歩かせ、結果をメッシュとマップデータの両方へ反映する。
   *
   * `objects` の `position` にも書き戻すのは、当たり判定（NPC同士）と接近判定が
   * **動いた後の位置**を見るようにするため。書き戻さないと、当たり判定だけが
   * 最初の立ち位置に残る。
   * @param deltaMs - 前回からの経過時間（ミリ秒）
   */
  function moveNpcs(deltaMs: number): void {
    let moved = false;
    // NPCがプレイヤーを避けられるよう、仮の障害物を今の位置へ合わせる
    playerObstacle.position.x = position.x;
    playerObstacle.position.z = position.z;

    for (const object of objects) {
      if (object.type !== "npc") continue;
      const state = npcStates.get(object.id);
      if (!state) continue;

      const next = stepNpcWander(state, deltaMs, npcCollisionObjects, Math.random);
      npcStates.set(object.id, next);

      if (next.position.x !== state.position.x || next.position.z !== state.position.z) {
        object.position.x = next.position.x;
        object.position.z = next.position.z;
        moved = true;
      }

      const root = objectRoots.get(object.id);
      if (root) {
        root.position.x = next.position.x;
        root.position.z = next.position.z;
        root.rotation.y = next.rotationY;
      }
    }

    // NPCが近づいてきたときにも「はなす」を出したいので、動いたら接近対象を取り直す。
    if (moved) updateNearby(false);
  }

  function updateNearby(force: boolean): void {
    const nextNearbyId = findNearbyInteractiveId(position, objects);
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

  // --- 建物・NPCのタップ ---
  scene.onPointerObservable.add((pointerInfo: any) => {
    if (pointerInfo.type !== BABYLON.PointerEventTypes.POINTERPICK) return;
    if (!inputEnabled) return;
    const picked = pointerInfo.pickInfo?.pickedMesh;
    if (!picked) return;
    const objectId = pickableIds.get(picked.name);
    if (!objectId) return;
    const target = objects.find((object) => object.id === objectId);
    if (!target) return;
    if (target.type === "building") {
      postToRN({ event: "navigate", route: target.route });
      return;
    }
    if (target.type === "npc") {
      // 会話の中身は RN 側が dialogueId から引く。ここではどのNPCかだけを伝える。
      postToRN({ event: "talk", id: target.id });
    }
  });

  // --- ゲームループ ---
  scene.onBeforeRenderObservable.add(() => {
    const deltaMs = engine.getDeltaTime();
    const now = performance.now();

    let playerMoved = false;

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
        playerMoved = true;
        position = moved;
        direction = input.direction;
        updateNearby(false);
      }
    }

    // NPCを歩かせる。会話中や画面遷移中（inputEnabled が false）は止める。
    // 話しかけている最中に立ち去られないようにするため。
    if (inputEnabled && npcStates.size > 0) {
      moveNpcs(deltaMs);
    }

    // 体の向きは**押している方向**で決める（動けた向きではない）。壁へ斜めに当たったとき、
    // 動けた向きだとふさがれていない軸だけが残り、当たった瞬間に横を向いてしまう。
    // 跳ねるかどうかは実際に動けたかで決めるので、壁に押しつけている間は止まる。
    playerMotion = stepPlayerMotion(playerMotion, deltaMs, {
      direction: inputEnabled && input.direction ? { x: input.x, z: input.z } : null,
      moved: playerMoved,
    });
    const lift = getHopLift(playerMotion);
    player.position.x = position.x;
    player.position.z = position.z;
    player.position.y = PLAYER_CENTER_Y + lift;
    player.rotation.y = playerMotion.facingY;
    // 跳び上がるほど縦に伸ばし、横を細くする。着地している間は等倍に戻る
    const liftRatio = lift / HOP_HEIGHT;
    const stretch = liftRatio * HOP_STRETCH;
    player.scaling.set(1 - stretch * 0.5, 1 + stretch, 1 - stretch * 0.5);

    // 影を落とす範囲をプレイヤーへ追従させる。平行光は「位置」で範囲の中心が決まる
    if (shadowGenerator) {
      sun.position.set(
        position.x + sunOffset.x,
        sunOffset.y,
        position.z + sunOffset.z,
      );
    }

    ground.position.x = position.x;
    ground.position.z = position.z;

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

  /**
   * 端末のピクセル密度に合わせて、描画する解像度を決める。
   *
   * Babylon の既定では WebGL のバックバッファを **CSSピクセル数**で作る。スマホは
   * 実ピクセルがその2〜3倍あるため、そのままだと引き伸ばされて輪郭がギザギザになる。
   * 逆に3倍で描くと塗る面積が9倍になって重いので、2倍で頭打ちにしている。
   */
  function applyPixelRatio(): void {
    const ratio = Math.min(window.devicePixelRatio || 1, MAX_PIXEL_RATIO);
    engine.setHardwareScalingLevel(1 / ratio);
  }

  function applyOrthoSize(): void {
    const aspect = engine.getRenderWidth() / Math.max(1, engine.getRenderHeight());
    camera.orthoTop = ORTHO_HALF_HEIGHT;
    camera.orthoBottom = -ORTHO_HALF_HEIGHT;
    camera.orthoLeft = -ORTHO_HALF_HEIGHT * aspect;
    camera.orthoRight = ORTHO_HALF_HEIGHT * aspect;
  }

  applyPixelRatio();
  applyOrthoSize();
  applySeason("spring");

  engine.runRenderLoop(() => {
    scene.render();
  });

  window.addEventListener("resize", () => {
    // 画面の回転などでピクセル密度が変わることがあるため、毎回取り直す
    applyPixelRatio();
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
    if (intent.type === "placePlayer") {
      position = { x: intent.x, z: intent.z };
      // 跳ねかけの状態を持ち越さないよう作り直し、向きだけ指定されたものにする
      playerMotion = { ...createPlayerMotionState(), facingY: intent.facingY };
      // 間引きに引っかかって置き直しが RN へ伝わらないことがないよう、前回値を捨てる
      lastSnapshot = { x: Number.NaN, z: Number.NaN };
      updateNearby(true);
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
