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
// もようがえ（Issue #425）の間はキャラクターを消す。家具をつまんで動かすなど、もようがえの処理は
// houseRoomEditing.ts が受け持つ。配置（置いた家具とクローゼットの位置）は RN から setLayout で届く。
//
// キャラクターの組み立ては肖像・更衣室のプレビューと同じ `createCharacter` を使い、
// 町で見る姿とずれないようにする。手足の振り方も町と同じ（walkCycle.ts）。
//
// scene.ts と同じく esbuild でバンドルし（scripts/build-rpg-scene.mjs）、Babylon 本体は
// 同じ HTML に UMD でインラインされている前提でグローバルの BABYLON を参照する。

import { getBuildingParts } from "../../lib/rpg-hub/catalog";
import { CHARACTER_TYPE_ASSET_IDS } from "../../lib/rpg-hub/characterTypes";
import { DEFAULT_HOUSE_LAYOUT, getRoomFurniture, type HouseLayout } from "../../lib/rpg-hub/houseLayout";
import {
  findHouseFurniture,
  findNearbyFurniture,
  getFurnitureStandX,
  nextHouseGoal,
  IDLE_BEFORE_WANDER_MS,
  pickWanderPauseMs,
  STICK_SPEED_PER_MS,
  pickWanderTarget,
  ROOM_DEPTH,
  stepByStick,
  stepTowardX,
  toRoomWorldX,
  WALK_LINE_Z,
  WALK_SPEED_PER_MS,
  type HouseFloor,
  type HouseFurniture,
} from "../../lib/rpg-hub/houseRoom";
import {
  encodeHouseRoomMessage,
  parseHouseRoomIntent,
  type HouseRoomEvent,
  type HouseRoomTag,
} from "../../lib/rpg-hub/houseRoomBridge";
import { createRoomShellParts, HOUSE_FURNITURE_SHAPES } from "../../lib/rpg-hub/houseRoomParts";
import type { PortraitLook } from "../../lib/rpg-hub/portraitBridge";
import { getWalkBob, stepWalkPhase } from "../../lib/rpg-hub/walkCycle";
import { turnToward } from "../../lib/rpg-hub/angles";
import { renderFurnitureThumbnails } from "./furnitureThumbnail";
import { createHouseRoomEditing, getFurnitureZ, type FurnitureNode } from "./houseRoomEditing";
import { createHouseRoomCamera, createHouseRoomLighting } from "./houseRoomStage";
import { applyLimbSwing, createCharacter, createPartMesh, prepareLimbMeshes, type LimbMesh } from "./partMesh";

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

  // --- カメラ（真横から少しだけ見下ろす、固定の平行投影）と照明 ---
  const view = createHouseRoomCamera(engine, scene);
  const camera = view.camera;
  const lighting = createHouseRoomLighting(scene);
  const shadowGenerator = lighting.shadowGenerator;
  const applySeason = lighting.applySeason;

  // --- 部屋（階ごと・配置が変わるたびに作り直す） ---
  let floor: HouseFloor | null = null;
  let roomRoot: any = null;
  let layout: HouseLayout = DEFAULT_HOUSE_LAYOUT;
  /** いま映している階の家具（はじめから付いている物と、置いた家具） */
  let roomFurniture: HouseFurniture[] = [];
  /** 家具のIDから、組み立てた3Dの家具 */
  const furnitureNodes = new Map<string, FurnitureNode>();

  // --- もようがえ（家具をつまんで動かす・一覧からのドラッグ） ---
  const editing = createHouseRoomEditing({
    camera,
    furnitureNodes,
    getFloor: () => floor,
    getLayout: () => layout,
    getRoomFurniture: () => roomFurniture,
    postToRN,
    scene,
  });

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

    furnitureNodes.clear();
    roomFurniture = getRoomFurniture(nextFloor, layout);
    roomFurniture.forEach((furniture) => {
      const shape = HOUSE_FURNITURE_SHAPES[furniture.kind];
      const node = new BABYLON.TransformNode(`furniture-${furniture.id}`, scene);
      node.parent = roomRoot;
      // 奥の壁にぴったり付けて置く
      node.position.set(toRoomWorldX(furniture.x), 0, getFurnitureZ(furniture.kind));
      const meshes = shape.parts.map((part, index) => {
        const mesh = createPartMesh(part, scene, `furniture-${furniture.id}-${index}`, part.color);
        mesh.parent = node;
        mesh.metadata = { furnitureId: furniture.id };
        // 壁に掛ける物（窓）は影を落とさない。壁に貼りついているので落としても見えず、ちらつくだけ
        addShadow(mesh, !shape.onWall);
        return mesh;
      });
      furnitureNodes.set(furniture.id, { meshes, node });
    });
    floor = nextFloor;
    editing.onRoomBuilt();
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
    if (!characterRoot) {
      characterRoot = new BABYLON.TransformNode("character-root", scene);
      // もようがえ中に初めて作ったときも、消したままにする
      characterRoot.setEnabled(!editing.isEditing());
    }
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
    /** 名札をタップして向かっている家具（walkTo）。向かっていなければ null。着いたら RN へ知らせる */
    goal: null as { furnitureId: string; x: number } | null,
    walkPhase: 0,
    x: 0.5,
  };

  /** 最後に RN へ知らせた近くの家具。undefined はまだ知らせていない（階を作り直したときなど） */
  let sentNearbyId: string | null | undefined;

  /** 使える家具に近づいた・離れたときだけ RN へ知らせる */
  function sendNearbyIfChanged(): void {
    if (!floor) return;
    // もようがえ中は家具を使えない（ボタンを出さない）
    const nearbyId = editing.isEditing() ? null : (findNearbyFurniture(roomFurniture, motion.x)?.id ?? null);
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

    if (editing.isEditing()) {
      // もようがえ中は歩かず、こちら（カメラ）を向いて待つ
      motion.target = null;
      // 名札をタップして向かっている途中でも、もようがえを始めたら取りやめる
      motion.goal = null;
      motion.pauseMs = IDLE_BEFORE_WANDER_MS;
      motion.facingY = turnToward(motion.facingY, 0, TURN_PER_MS * stepMs);
    } else if (motion.stick !== 0) {
      // スティックで歩かせている間は、うろうろをやめ、離してからしばらくは歩き出さない。
      // 名札をタップして向かっている途中でも、スティックを動かしたらそちらを優先する
      motion.target = null;
      motion.goal = null;
      motion.pauseMs = IDLE_BEFORE_WANDER_MS;
      const nextX = stepByStick(motion.x, motion.stick, stepMs);
      // 壁際で押し続けても、その場で足踏みしないよう、動いたときだけ歩く
      moving = nextX !== motion.x;
      stepTempo = (Math.abs(motion.stick) * STICK_SPEED_PER_MS) / WALK_SPEED_PER_MS;
      faceToward(motion.x, motion.x + motion.stick, stepMs);
      motion.x = nextX;
    } else if (motion.goal !== null) {
      // 名札をタップした家具へは、スティックを倒しきったときと同じ速さで向かう（うろうろより速く）
      const result = stepTowardX(motion.x, motion.goal.x, stepMs, STICK_SPEED_PER_MS);
      moving = !result.arrived;
      stepTempo = STICK_SPEED_PER_MS / WALK_SPEED_PER_MS;
      faceToward(motion.x, result.x, stepMs);
      motion.x = result.x;
      if (result.arrived && floor) {
        const furnitureId = motion.goal.furnitureId;
        motion.goal = null;
        motion.pauseMs = IDLE_BEFORE_WANDER_MS;
        // 着いた位置の「近くの家具」を先に知らせてから、着いたことを知らせる
        sendNearbyIfChanged();
        postToRN({ event: "arrived", floor, furnitureId });
      }
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
    roomFurniture.forEach((furniture) => {
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
    // この描画にキャラクターが映っていたかも送る。RN は部屋と姿が映った合図にする
    postToRN({ event: "tags", floor, hasCharacter: characterRoot !== null, tags });
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

  /** 家具の絵を描いている途中か。続けて頼まれても、同じ絵を2回描かない */
  let renderingThumbnails = false;

  /** 置ける家具の絵を描いて、1つずつ RN へ送る。描けなかった絵は、RN 側が絵文字で代わりに出す */
  function sendThumbnails(): void {
    if (renderingThumbnails) return;
    renderingThumbnails = true;
    renderFurnitureThumbnails(engine, (kind, dataUrl) => postToRN({ dataUrl, event: "thumbnail", kind }))
      .catch((error: unknown) => {
        postToRN({ event: "error", message: `家具の絵を描けませんでした: ${error instanceof Error ? error.message : String(error)}` });
      })
      .finally(() => {
        renderingThumbnails = false;
      });
  }

  /** 描画ループを回す・止める。描画ループを作るのは下のほう（main の最後）なので、ここでは入れ物だけ用意する */
  let setRenderingActive: (active: boolean) => void = () => {};

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
        // 姿を描き終わったことを RN へ知らせるため、次の描画の後でも名札の位置を送る
        sendTagsAfterRender();
      } else if (intent.type === "setLayout") {
        layout = intent.layout;
        // 階を映す前に届いたときは、覚えておいて setFloor で使う
        if (floor) {
          buildRoom(floor);
          sentNearbyId = undefined;
          sendTagsAfterRender();
        }
      } else if (intent.type === "setEditing") {
        editing.setEditing(intent.editing);
        motion.stick = 0;
        // もようがえ中はキャラクターを消す。家具の前に立っていると、家具が隠れてつまめないため
        characterRoot?.setEnabled(!intent.editing);
      } else if (intent.type === "renderThumbnails") {
        sendThumbnails();
      } else if (intent.type === "dragFurniture") {
        editing.dragFromTray(intent);
      } else if (intent.type === "setFloor") {
        editing.onFloorChange();
        buildRoom(intent.floor);
        motion.x = intent.standX;
        motion.target = null;
        motion.goal = null;
        motion.facingY = 0;
        motion.pauseMs = IDLE_BEFORE_WANDER_MS;
        // 新しい階では、近くの家具を必ず知らせ直す（前の階のボタンを残さない）
        sentNearbyId = undefined;
        sendTagsAfterRender();
      } else if (intent.type === "move") {
        motion.stick = intent.dx;
        // スティックで歩かせたら、名札をタップして向かっていた家具は取りやめる（RN 側と合わせる）
        motion.goal = nextHouseGoal(motion.goal, intent);
      } else if (intent.type === "stopWalk") {
        motion.goal = nextHouseGoal(motion.goal, intent);
      } else if (intent.type === "walkTo") {
        // もようがえで動かした家具（クローゼットなど）も、今の配置から探す
        const furniture = floor ? findHouseFurniture(roomFurniture, intent.furnitureId) : undefined;
        // 階を切り替えた直後に届いた、前の階の家具への指示は使わない
        if (!furniture) return;
        motion.target = null;
        motion.goal = { furnitureId: furniture.id, x: getFurnitureStandX(furniture) };
      } else {
        motion.active = intent.active;
        // 別の画面（きがえ）へ行っている間は描かない。更衣室のプレビューも WebGL で描くので、
        // 見えない部屋まで描き続けると古い端末で重くなる（1R0Uレビュー指摘）
        setRenderingActive(intent.active);
        // 別の画面へ行くときは、スティックを離したことにする（戻ったときに歩き続けないように）
        if (!intent.active) {
          motion.stick = 0;
          motion.goal = null;
        }
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      // キャラクターを1度も作れていない・部屋を作れなかったときは、歩くことも家具に近づくこともできない。
      // RN 側に代わりのボタンへ切り替えてもらう（CodeRabbitレビュー指摘：準備のあとの失敗だと、
      // 部屋もボタンも出ないまま外へ出られなくなっていた）
      // 配置を送り直して部屋を作り直せなかったときも、部屋が消えたままになるので同じく扱う
      const fatal =
        (intent.type === "setLook" && !characterRoot) ||
        intent.type === "setFloor" ||
        (intent.type === "setLayout" && floor !== null);
      postToRN(fatal ? { event: "error", fatal: true, message } : { event: "error", message });
    }
  }

  // react-native-webview の postMessage は Android / iOS で window / document の
  // どちらに message を飛ばすか差があるため両方で受ける（scene.ts と同じ）。
  window.addEventListener("message", (e) => handleIntent((e as MessageEvent).data));
  document.addEventListener("message", (e) => handleIntent((e as unknown as MessageEvent).data));
  window.addEventListener("resize", () => {
    engine.resize();
    view.fit();
    sendTagsAfterRender();
  });

  let lastTime = performance.now();
  /** 描画ループで失敗したか。失敗したら描き直さない（毎フレーム同じ失敗を送り続けないように） */
  let renderFailed = false;
  /** 描画ループが回っているか */
  let rendering = false;

  function renderFrame(): void {
    try {
      const now = performance.now();
      step(now - lastTime);
      lastTime = now;
      scene.render();
    } catch (error) {
      // 準備ができたあとでも、描き続けられなければキャラクターも止まり、家具にも近づけない。
      // 描画を止めて fatal を送り、RN 側に代わりのボタンへ切り替えてもらう（1R0Uレビュー指摘）
      renderFailed = true;
      stopRendering();
      postToRN({ event: "error", fatal: true, message: error instanceof Error ? error.message : String(error) });
    }
  }

  function startRendering(): void {
    if (rendering || renderFailed) return;
    // 止めていた間の時間を、1フレームぶんの経過として数えない
    lastTime = performance.now();
    rendering = true;
    engine.runRenderLoop(renderFrame);
  }

  function stopRendering(): void {
    if (!rendering) return;
    rendering = false;
    engine.stopRenderLoop(renderFrame);
  }

  setRenderingActive = (active) => (active ? startRendering() : stopRendering());
  startRendering();

  scene.executeWhenReady(() => {
    postToRN({ event: "ready" });
  });
}

window.onerror = (message) => {
  postToRN({ event: "error", message: String(message) });
};

main();
