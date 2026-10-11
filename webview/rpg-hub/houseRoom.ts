// 自分の家の中（Issue #386）を描く WebView 側のスクリプト。
//
// たまごっちの「マイハウス」のように、3Dで作った部屋を真横から見た固定の視点で映す。
// 手前の壁と天井は作らず、ドールハウスの断面のように中を覗く。
// キャラクターは RN のスティックの入力（move）で左右に歩き、しばらく入力が無いとうろうろ歩き出す。
//
// **家具の機能（きがえ・階段・外へ）は RN 側が実行する。** ここは使える家具に近づいた・
// 離れたことを知らせる（nearby）まで。部屋の中身と歩き方は lib/rpg-hub/houseRoom.ts、
// 家具の形は lib/rpg-hub/houseRoomParts.ts から読む。
//
// キャラクターの組み立ては肖像・更衣室のプレビューと同じ `createCharacter` を使い、
// 町で見る姿とずれないようにする。手足の振り方も町と同じ（walkCycle.ts）。
//
// scene.ts と同じく esbuild でバンドルし（scripts/build-rpg-scene.mjs）、Babylon 本体は
// 同じ HTML に UMD でインラインされている前提でグローバルの BABYLON を参照する。

import { getBuildingParts } from "../../lib/rpg-hub/catalog";
import { CHARACTER_TYPE_ASSET_IDS } from "../../lib/rpg-hub/characterTypes";
import {
  findNearbyFurniture,
  HOUSE_ROOMS,
  IDLE_BEFORE_WANDER_MS,
  pickWanderPauseMs,
  STICK_SPEED_PER_MS,
  pickWanderTarget,
  ROOM_DEPTH,
  ROOM_HEIGHT,
  ROOM_WIDTH,
  stepByStick,
  stepTowardX,
  toRoomWorldX,
  WALK_LINE_Z,
  WALK_SPEED_PER_MS,
  type HouseFloor,
} from "../../lib/rpg-hub/houseRoom";
import {
  encodeHouseRoomMessage,
  parseHouseRoomIntent,
  type HouseRoomEvent,
  type HouseRoomTag,
} from "../../lib/rpg-hub/houseRoomBridge";
import { createRoomShellParts, HOUSE_FURNITURE_SHAPES } from "../../lib/rpg-hub/houseRoomParts";
import type { PortraitLook } from "../../lib/rpg-hub/portraitBridge";
import { SEASON_LIGHTING } from "../../lib/rpg-hub/seasonalLook";
import { getWalkBob, stepWalkPhase } from "../../lib/rpg-hub/walkCycle";
import { turnToward } from "../../lib/rpg-hub/angles";
import { applyLimbSwing, createCharacter, createPartMesh, prepareLimbMeshes, toColor3, type LimbMesh } from "./partMesh";

declare const BABYLON: any;

declare global {
  interface Window {
    ReactNativeWebView?: { postMessage: (message: string) => void };
  }
}

/**
 * キャラクターを町より大きく描く。部屋全体を映すので、町と同じ大きさだと表情が見えない。
 * 家具（クローゼットの高さ 2.4）と並べて、たまごっちのように少し大きめに見える程度
 */
const CHARACTER_SCALE = 1.5;

/** 歩く動作の速さ（ラジアン / ミリ秒）。町のプレイヤーと同じ（playerMotion.ts） */
const STEP_SPEED_PER_MS = 0.012;
/** 体の弾みの高さ。町のプレイヤー（0.05）に拡大率を掛ける */
const BOB_HEIGHT = 0.05 * CHARACTER_SCALE;
/** 向きを変える速さ（ラジアン / ミリ秒）。町のプレイヤーと同じ */
const TURN_PER_MS = 0.015;
/** 1回の更新で進める時間の上限（ミリ秒）。画面復帰などで一気に進まないように */
const MAX_STEP_MS = 50;

/** キャラクターをタップしたときに跳ねる時間と高さ */
const JUMP_MS = 420;
const JUMP_HEIGHT = 0.6;

/** カメラの見下ろす角度（ラジアン）。真横だと床が線になるので、少しだけ上から見る */
const CAMERA_TILT = 0.3;
/** 部屋のまわりに取る余白（ワールド座標） */
const FRAME_MARGIN = 0.35;
/**
 * 画面の縦方向に映したい範囲の半分。床の手前の縁から、奥の壁の上の縁までを
 * カメラの傾きで見たときの高さ（床の手前の縁は z = 0.2、壁の上の縁は y = ROOM_HEIGHT, z = -ROOM_DEPTH）。
 */
const CONTENT_HALF_HEIGHT =
  (ROOM_HEIGHT * Math.cos(CAMERA_TILT) + (ROOM_DEPTH + 0.2) * Math.sin(CAMERA_TILT)) / 2;

function postToRN(event: HouseRoomEvent): void {
  window.ReactNativeWebView?.postMessage(encodeHouseRoomMessage(event));
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

  const engine = new BABYLON.Engine(
    canvas,
    true,
    { powerPreference: "high-performance", preserveDrawingBuffer: false, stencil: false },
    true,
  );
  const scene = new BABYLON.Scene(engine);
  // 我が家タウンと同じく右手系にする。左手系だと左右が裏返った姿になる
  scene.useRightHandedSystem = true;
  // 背景は HTML 側の背景色を透かして見せる
  scene.clearColor = new BABYLON.Color4(0, 0, 0, 0);

  // --- カメラ（真横から少しだけ見下ろす、固定の平行投影） ---
  const camera = new BABYLON.FreeCamera("camera", new BABYLON.Vector3(0, 0, 20), scene);
  camera.mode = BABYLON.Camera.ORTHOGRAPHIC_CAMERA;
  camera.minZ = 0.1;
  camera.maxZ = 100;

  /**
   * 画面の縦横比に合わせて、部屋全体が収まるよう映す範囲を決める。
   * 縦に余るときは、部屋を下に寄せる（床が画面の真ん中に浮いて見えないように）。
   */
  function fitCamera(): void {
    const aspect = engine.getAspectRatio(camera) || 1;
    const halfWidthNeeded = ROOM_WIDTH / 2 + 0.2 + FRAME_MARGIN;
    const contentHalf = CONTENT_HALF_HEIGHT + FRAME_MARGIN;
    const halfHeight = Math.max(contentHalf, halfWidthNeeded / aspect);
    const halfWidth = halfHeight * aspect;
    // 画面の上向き（カメラの傾きぶん奥へ倒れている）
    const up = new BABYLON.Vector3(0, Math.cos(CAMERA_TILT), -Math.sin(CAMERA_TILT));
    const target = new BABYLON.Vector3(0, ROOM_HEIGHT / 2, -ROOM_DEPTH / 2).add(up.scale(halfHeight - contentHalf));
    const distance = 20;
    camera.position = new BABYLON.Vector3(
      0,
      target.y + Math.sin(CAMERA_TILT) * distance,
      target.z + Math.cos(CAMERA_TILT) * distance,
    );
    camera.setTarget(target);
    camera.orthoLeft = -halfWidth;
    camera.orthoRight = halfWidth;
    camera.orthoBottom = -halfHeight;
    camera.orthoTop = halfHeight;
  }
  fitCamera();

  // --- 照明と影 ---
  const ambient = new BABYLON.HemisphericLight("ambient", new BABYLON.Vector3(0.2, 1, 0.4), scene);
  // 手前の左上から差す光。奥の壁に家具とキャラクターの影が落ちて、立体に見える
  const sun = new BABYLON.DirectionalLight("sun", new BABYLON.Vector3(0.35, -0.8, -0.6), scene);
  sun.position = new BABYLON.Vector3(-4, 10, 8);
  const shadowGenerator = new BABYLON.ShadowGenerator(1024, sun);
  shadowGenerator.usePercentageCloserFiltering = true;
  shadowGenerator.darkness = 0.55;
  shadowGenerator.bias = 0.005;
  shadowGenerator.normalBias = 0.03;

  function applySeason(season: PortraitLook["season"]): void {
    const lighting = SEASON_LIGHTING[season];
    ambient.intensity = lighting.ambient.intensity;
    ambient.diffuse = toColor3(lighting.ambient.color);
    ambient.groundColor = toColor3(lighting.ambient.groundColor);
    sun.intensity = lighting.sun.intensity;
    sun.diffuse = toColor3(lighting.sun.color);
  }
  applySeason("spring");

  // --- 部屋（階ごとに作り直す） ---
  let floor: HouseFloor | null = null;
  let roomRoot: any = null;

  function addShadow(mesh: any, casts: boolean): void {
    mesh.receiveShadows = true;
    if (casts) shadowGenerator.getShadowMap().renderList.push(mesh);
  }

  function pruneShadowCasters(): void {
    const map = shadowGenerator.getShadowMap();
    map.renderList = map.renderList.filter((mesh: any) => !mesh.isDisposed());
  }

  function buildRoom(nextFloor: HouseFloor): void {
    if (roomRoot) roomRoot.dispose(false, true);
    pruneShadowCasters();
    roomRoot = new BABYLON.TransformNode("room", scene);

    createRoomShellParts(nextFloor).forEach((part, index) => {
      const mesh = createPartMesh(part, scene, `room-shell-${index}`, part.color);
      mesh.parent = roomRoot;
      mesh.isPickable = false;
      addShadow(mesh, false);
    });

    HOUSE_ROOMS[nextFloor].furniture.forEach((furniture) => {
      const shape = HOUSE_FURNITURE_SHAPES[furniture.kind];
      const node = new BABYLON.TransformNode(`furniture-${furniture.id}`, scene);
      node.parent = roomRoot;
      // 奥の壁にぴったり付けて置く
      node.position.set(toRoomWorldX(furniture.x), 0, -ROOM_DEPTH + shape.depth / 2 + 0.01);
      shape.parts.forEach((part, index) => {
        const mesh = createPartMesh(part, scene, `furniture-${furniture.id}-${index}`, part.color);
        mesh.parent = node;
        // 家具はタップしても何も起きない（スティックで近づいてボタンで使う）
        mesh.isPickable = false;
        // 壁に掛ける物（窓）は影を落とさない。壁に貼りついているので落としても見えず、ちらつくだけ
        addShadow(mesh, !shape.onWall);
      });
    });
    floor = nextFloor;
  }

  // --- キャラクター ---
  let characterRoot: any = null;
  let characterBody: any = null;
  let limbs: LimbMesh[] = [];
  /** キャラクターの原点から足の裏までの高さ（拡大後）。床に立たせるのに使う */
  let footOffset = 0;
  const characterMeshIds = new Set<number>();

  function buildCharacter(nextLook: PortraitLook): void {
    // 新しい姿を作り終えてから前の姿を捨てる（更衣室のプレビューと同じ理由）
    const body = createCharacter(nextLook, "character", scene);
    if (characterBody) characterBody.dispose(false, true);
    pruneShadowCasters();
    characterBody = body;
    if (!characterRoot) characterRoot = new BABYLON.TransformNode("character-root", scene);
    body.parent = characterRoot;
    body.scaling.set(CHARACTER_SCALE, CHARACTER_SCALE, CHARACTER_SCALE);
    body.position.set(0, 0, 0);

    characterMeshIds.clear();
    const parts = getBuildingParts(CHARACTER_TYPE_ASSET_IDS[nextLook.characterType]);
    const entries: LimbMesh[] = [];
    body.getChildMeshes(false).forEach((mesh: any) => {
      characterMeshIds.add(mesh.uniqueId);
      addShadow(mesh, true);
      // createCharacter は体のパーツを `character-part-<番号>` の名前で作る
      const match = /^character-part-(\d+)$/.exec(mesh.name);
      if (match) entries.push({ mesh, part: parts[Number(match[1])] });
    });
    limbs = prepareLimbMeshes(entries);

    // 足の裏の高さを測る。ルートの今の高さ（弾み・跳ねを含む）を引いて、体だけの値にする
    characterRoot.computeWorldMatrix(true);
    body.computeWorldMatrix(true);
    body.getChildMeshes(false).forEach((mesh: any) => mesh.computeWorldMatrix(true));
    const bounds = body.getHierarchyBoundingVectors(true);
    footOffset = characterRoot.position.y - bounds.min.y;
  }

  // --- 動き ---
  const motion = {
    active: true,
    facingY: 0,
    /** 跳ねている時間（ミリ秒）。跳ねていなければ null */
    jumpMs: null as number | null,
    /** 次にひとりで歩き出すまでの時間（ミリ秒）。スティックを動かすたびに長めに戻す */
    pauseMs: IDLE_BEFORE_WANDER_MS,
    /** スティックの左右の倒し具合（-1〜1）。0 なら離している */
    stick: 0,
    /** うろうろ歩くときの行き先。立ち止まっていれば null */
    target: null as number | null,
    walkPhase: 0,
    x: 0.5,
  };

  /** 最後に RN へ知らせた近くの家具。undefined はまだ知らせていない（階を作り直したときなど） */
  let sentNearbyId: string | null | undefined;

  /** 使える家具に近づいた・離れたときだけ RN へ知らせる */
  function sendNearbyIfChanged(): void {
    if (!floor) return;
    const nearbyId = findNearbyFurniture(floor, motion.x)?.id ?? null;
    if (nearbyId === sentNearbyId) return;
    sentNearbyId = nearbyId;
    postToRN({ event: "nearby", floor, furnitureId: nearbyId });
  }

  /** 向きを、進む方向（右なら +X、左なら -X）へ回す */
  function faceToward(fromX: number, toX: number, stepMs: number): void {
    if (toX === fromX) return;
    // 右手系で +X を向くのは π/2、-X は -π/2（playerMotion.ts と同じ基準）
    motion.facingY = turnToward(motion.facingY, toX > fromX ? Math.PI / 2 : -Math.PI / 2, TURN_PER_MS * stepMs);
  }

  function step(deltaMs: number): void {
    if (!characterRoot) return;
    const stepMs = Math.min(Math.max(deltaMs, 0), MAX_STEP_MS);
    let moving = false;
    /** 足を動かすテンポの倍率。速く歩くときは足も速く動かし、滑って見えないようにする */
    let stepTempo = 1;

    if (motion.stick !== 0) {
      // スティックで歩かせている間は、うろうろをやめ、離してからしばらくは歩き出さない
      motion.target = null;
      motion.pauseMs = IDLE_BEFORE_WANDER_MS;
      const nextX = stepByStick(motion.x, motion.stick, stepMs);
      // 壁際で押し続けても、その場で足踏みしないよう、動いたときだけ歩く
      moving = nextX !== motion.x;
      stepTempo = (Math.abs(motion.stick) * STICK_SPEED_PER_MS) / WALK_SPEED_PER_MS;
      faceToward(motion.x, motion.x + motion.stick, stepMs);
      motion.x = nextX;
    } else if (motion.target !== null) {
      const result = stepTowardX(motion.x, motion.target, stepMs);
      moving = !result.arrived;
      faceToward(motion.x, result.x, stepMs);
      motion.x = result.x;
      if (result.arrived) {
        motion.target = null;
        motion.pauseMs = pickWanderPauseMs(Math.random);
      }
    } else {
      // 立ち止まっている間は、こちら（カメラ）を向く
      motion.facingY = turnToward(motion.facingY, 0, TURN_PER_MS * stepMs);
      if (motion.active) {
        motion.pauseMs -= stepMs;
        if (motion.pauseMs <= 0) motion.target = pickWanderTarget(motion.x, Math.random);
      }
    }
    sendNearbyIfChanged();

    motion.walkPhase = stepWalkPhase(motion.walkPhase, stepMs, moving, STEP_SPEED_PER_MS * stepTempo);
    let jumpLift = 0;
    if (motion.jumpMs !== null) {
      motion.jumpMs += stepMs;
      if (motion.jumpMs >= JUMP_MS) motion.jumpMs = null;
      else jumpLift = Math.sin((motion.jumpMs / JUMP_MS) * Math.PI) * JUMP_HEIGHT;
    }

    characterRoot.position.set(
      toRoomWorldX(motion.x),
      footOffset + getWalkBob(motion.walkPhase, BOB_HEIGHT) + jumpLift,
      WALK_LINE_Z,
    );
    characterRoot.rotation.y = motion.facingY;
    applyLimbSwing(limbs, motion.walkPhase);
  }

  // --- 名札の位置 ---

  /** 名札を出す家具の、名札の位置（画面上の座標）を RN へ送る */
  function sendTags(): void {
    if (!floor) return;
    // 画面上の長さ（CSS の px ＝ React Native の長さの単位）でそのまま測る。
    // 描画の解像度（端末のピクセル密度ぶん大きい）で測ってから割り戻すと、端末によってずれる
    const viewport = camera.viewport.toGlobal(canvas.clientWidth, canvas.clientHeight);
    const transform = scene.getTransformMatrix();
    const tags: HouseRoomTag[] = [];
    HOUSE_ROOMS[floor].furniture.forEach((furniture) => {
      if (!furniture.tag) return;
      const shape = HOUSE_FURNITURE_SHAPES[furniture.kind];
      const point = BABYLON.Vector3.Project(
        new BABYLON.Vector3(toRoomWorldX(furniture.x), shape.tagY, -ROOM_DEPTH + shape.depth),
        BABYLON.Matrix.Identity(),
        transform,
        viewport,
      );
      tags.push({ id: furniture.id, x: point.x, y: point.y });
    });
    postToRN({ event: "tags", floor, tags });
  }

  /** 次に描き終わったところで名札の位置を送る（カメラの行列が新しくなってから測るため） */
  function sendTagsAfterRender(): void {
    scene.onAfterRenderObservable.addOnce(() => sendTags());
  }

  // --- タップ ---
  scene.onPointerObservable.add((pointerInfo: any) => {
    if (pointerInfo.type !== BABYLON.PointerEventTypes.POINTERPICK) return;
    const picked = pointerInfo.pickInfo?.pickedMesh;
    if (!picked) return;
    if (characterMeshIds.has(picked.uniqueId)) {
      if (motion.jumpMs === null) motion.jumpMs = 0;
      postToRN({ event: "characterTapped" });
    }
  });

  // --- RN からの意図 ---
  function handleIntent(raw: unknown): void {
    const result = parseHouseRoomIntent(raw);
    if ("errors" in result) {
      postToRN({ event: "error", message: result.errors.join(" / ") });
      return;
    }
    const intent = result.intent;
    try {
      if (intent.type === "setLook") {
        buildCharacter(intent.look);
        applySeason(intent.look.season);
      } else if (intent.type === "setFloor") {
        buildRoom(intent.floor);
        motion.x = intent.standX;
        motion.target = null;
        motion.facingY = 0;
        motion.pauseMs = IDLE_BEFORE_WANDER_MS;
        // 新しい階では、近くの家具を必ず知らせ直す（前の階のボタンを残さない）
        sentNearbyId = undefined;
        sendTagsAfterRender();
      } else if (intent.type === "move") {
        motion.stick = intent.dx;
      } else {
        motion.active = intent.active;
        // 別の画面へ行くときは、スティックを離したことにする（戻ったときに歩き続けないように）
        if (!intent.active) motion.stick = 0;
      }
    } catch (error) {
      postToRN({ event: "error", message: error instanceof Error ? error.message : String(error) });
    }
  }

  // react-native-webview の postMessage は Android / iOS で window / document の
  // どちらに message を飛ばすか差があるため両方で受ける（scene.ts と同じ）。
  window.addEventListener("message", (e) => handleIntent((e as MessageEvent).data));
  document.addEventListener("message", (e) => handleIntent((e as unknown as MessageEvent).data));
  window.addEventListener("resize", () => {
    engine.resize();
    fitCamera();
    sendTagsAfterRender();
  });

  let lastTime = performance.now();
  engine.runRenderLoop(() => {
    const now = performance.now();
    step(now - lastTime);
    lastTime = now;
    scene.render();
  });

  scene.executeWhenReady(() => {
    postToRN({ event: "ready" });
  });
}

window.onerror = (message) => {
  postToRN({ event: "error", message: String(message) });
};

main();
