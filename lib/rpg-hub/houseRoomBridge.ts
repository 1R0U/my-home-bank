// 自分の家の中（Issue #386）の RN ⇄ WebView ブリッジ。
//
// 3Dの部屋を描いてキャラクターを歩かせるのは WebView 側（webview/rpg-hub/houseRoom.ts）、
// 家具の機能（きがえ・階段・外へ）を実行するのは RN 側（components/MyHouseScreen.tsx）。
//
// 流れ:
//   1. WebView が ready を送る
//   2. RN が setLook（キャラクターの見た目）と setFloor（どの階を、どこに立って始めるか）を送る
//   3. スティックを動かすと、RN が move（左右の倒し具合）を送り、WebView がキャラクターを歩かせる
//   4. 使える家具に近づいた・離れたとき、WebView が nearby を送る。RN がボタンを出し、押されたら機能を実行する
//   5. WebView は階を作るたびに、名札を出す位置（画面上の座標）を tags で送る
//   6. もようがえ（Issue #425）: RN が setEditing を送ると、家具を指でつまんで動かせるようになる。
//      WebView は選んだ家具を furnitureSelected、動かし終えた位置を furnitureMoved で送る。
//      RN が配置を直して保存し、setLayout で送り直す（WebView は配置を自分では変えない）
//   7. RN が renderThumbnails を送ると、WebView は置ける家具を1つずつ画像に描き、thumbnail で返す。
//      もようがえの一覧に、絵文字ではなく部屋に置いたときと同じ見た目を出すため
//   8. もようがえの一覧から家具を部屋へドラッグしている間、RN が dragFurniture（move）で指の位置を送り、
//      WebView は置かれる位置に半透明の家具を出す。指を離すと drop を送り、WebView は置きたい位置を
//      furnitureDropped で返す。RN が配置を直して保存し、setLayout で送り直す
//   9. 名札をタップすると、RN が walkTo を送り、WebView がその家具の前まで歩かせる。
//      着いたら WebView が arrived を送り、RN が家具の機能を実行する（Issue #422）
//
// 我が家タウンのブリッジ（bridge.ts）と同じく、受け取った値は必ず検証する。
// このモジュールは React Native / DOM / Babylon に依存しない純粋関数のみ。

import { HOUSE_PLACEABLE_FURNITURE, parseHouseLayout, type HouseLayout, type HousePlaceableKind } from "./houseLayout.ts";
import { HOUSE_FLOORS, type HouseFloor } from "./houseRoom.ts";
import { parseCharacterLook, type PortraitLook } from "./portraitBridge.ts";

/** RN → WebView。 */
export type HouseRoomIntent =
  /** キャラクターの見た目。変わるたびに送る */
  | { look: PortraitLook; type: "setLook" }
  /** 映す階と、キャラクターが立つ位置（部屋の横幅に対する割合） */
  | { floor: HouseFloor; standX: number; type: "setFloor" }
  /** 家の中の配置（置いた家具とクローゼットの位置）。setFloor より先に送り、変わるたびに送り直す */
  | { layout: HouseLayout; type: "setLayout" }
  /** もようがえ中か。もようがえ中は歩かず、家具を指でつまんで動かせる */
  | { editing: boolean; type: "setEditing" }
  /** 置ける家具の絵（もようがえの一覧に出す）を描いてほしい */
  | { type: "renderThumbnails" }
  /**
   * もようがえの一覧から家具をドラッグしている。viewX / viewY は部屋の枠（WebView）の左上を原点とした
   * 指の位置（React Native の長さの単位）。move は動かしている途中、drop は部屋の上で離した、
   * cancel は部屋の外で離した・やめた（位置は使わない）
   */
  | { kind: HousePlaceableKind; phase: "cancel" | "drop" | "move"; type: "dragFurniture"; viewX: number; viewY: number }
  /** スティックの左右の倒し具合（-1 で左いっぱい、1 で右いっぱい、0 で離した） */
  | { dx: number; type: "move" }
  /** うろうろ歩くかどうか。別の画面へ行っている間は止める */
  | { active: boolean; type: "setActive" }
  /** 家具の前まで歩かせる（名札をタップしたとき）。スティックを動かすと取りやめる */
  | { furnitureId: string; type: "walkTo" }
  /** walkTo で向かっている途中なら、その場で取りやめる（途中で別の家具を使ったとき） */
  | { type: "stopWalk" };

/** 名札を出す位置。WebView の左上を原点とした、画面上の座標（React Native の長さの単位と同じ） */
export type HouseRoomTag = { id: string; x: number; y: number };

/** WebView → RN。 */
export type HouseRoomEvent =
  /** 描く準備ができた。これを受け取ってから setLook / setFloor を送る */
  | { event: "ready" }
  /** 使える家具に近づいた（furnitureId）・離れた（null）。RN がボタンを出し分ける */
  | { event: "nearby"; floor: HouseFloor; furnitureId: string | null }
  /** キャラクターがタップされた */
  | { event: "characterTapped" }
  /** walkTo で歩かせた家具の前に着いた */
  | { event: "arrived"; floor: HouseFloor; furnitureId: string }
  /**
   * 名札を出す位置。階を作ったとき・姿を作ったときに、描き終わったところで測って送る。
   * `hasCharacter` は、その描画にキャラクターが映っていたか。RN は部屋と姿が映った合図に使う
   */
  | { event: "tags"; floor: HouseFloor; hasCharacter: boolean; tags: HouseRoomTag[] }
  /** もようがえ中に、家具を選んだ（furnitureId）・家具の無い所を触って選ぶのをやめた（null） */
  | { event: "furnitureSelected"; floor: HouseFloor; furnitureId: string | null }
  /** もようがえ中に、家具を動かし終えた。x は指を離した位置（部屋の横幅に対する割合） */
  | { event: "furnitureMoved"; floor: HouseFloor; furnitureId: string; x: number }
  /** もようがえの一覧からドラッグした家具を、部屋の上で離した。x は置きたい位置（部屋の横幅に対する割合） */
  | { event: "furnitureDropped"; floor: HouseFloor; kind: HousePlaceableKind; x: number }
  /** 置ける家具の絵。PNG の data URL */
  | { dataUrl: string; event: "thumbnail"; kind: HousePlaceableKind }
  /**
   * WebView 側で発生した例外。
   * `fatal` は、準備ができたあとでも部屋を使えなくなった失敗（キャラクターや部屋を1度も作れなかった）。
   * RN 側は代わりのボタンへ切り替える。付いていない失敗は、前の姿・前の部屋のまま使い続けられる
   */
  | { event: "error"; fatal?: true; message: string };

type IntentParseResult = { intent: HouseRoomIntent; success: true } | { errors: string[]; success: false };
type EventParseResult = { event: HouseRoomEvent; success: true } | { errors: string[]; success: false };

/** 受け取る名札の数の上限。部屋の家具の数を十分に上回る値。壊れた値で大量に描かないため */
const MAX_TAGS = 32;

/** 家具の絵の data URL の頭。PNG だけを受け取る */
const THUMBNAIL_PREFIX = "data:image/png;base64,";
/** 家具の絵の大きさの上限（文字数）。小さな絵なので十分に大きい値。壊れた値で大きな文字列を持たないため */
const MAX_THUMBNAIL_LENGTH = 1_000_000;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isFiniteNumber(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value);
}

function isNonEmptyString(value: unknown): value is string {
  return typeof value === "string" && value.length > 0;
}

function findPlaceableKind(value: unknown): HousePlaceableKind | undefined {
  return HOUSE_PLACEABLE_FURNITURE.find((item) => item.kind === value)?.kind;
}

function isHouseFloor(value: unknown): value is HouseFloor {
  return typeof value === "string" && (HOUSE_FLOORS as readonly string[]).includes(value);
}

/**
 * 文字列なら JSON として読む。
 * @param raw - 受け取った値
 * @returns 読んだ値。JSON として読めなければ undefined
 */
function parseJson(raw: unknown): unknown {
  if (typeof raw !== "string") return raw;
  try {
    return JSON.parse(raw);
  } catch {
    return undefined;
  }
}

/**
 * 意図・イベントを postMessage で送るための文字列にする。
 * @param message - 送る意図またはイベント
 * @returns JSON 文字列
 */
export function encodeHouseRoomMessage(message: HouseRoomIntent | HouseRoomEvent): string {
  return JSON.stringify(message);
}

/**
 * WebView 側で受け取った意図を検証する。
 * @param raw - message イベントで受け取った値
 * @returns 成功時は検証済みの意図、失敗時はエラーメッセージ配列
 */
export function parseHouseRoomIntent(raw: unknown): IntentParseResult {
  const value = parseJson(raw);
  if (!isRecord(value)) return { errors: ["オブジェクト形式ではありません"], success: false };

  if (value.type === "setLook") {
    const look = parseCharacterLook(value.look);
    if ("errors" in look) return { errors: look.errors, success: false };
    return { intent: { look: look.look, type: "setLook" }, success: true };
  }
  if (value.type === "setFloor") {
    if (!isHouseFloor(value.floor)) return { errors: ["floorが不正です"], success: false };
    if (!isFiniteNumber(value.standX) || value.standX < 0 || value.standX > 1) {
      return { errors: ["standXは0〜1の数で指定してください"], success: false };
    }
    return { intent: { floor: value.floor, standX: value.standX, type: "setFloor" }, success: true };
  }
  if (value.type === "setLayout") {
    if (!isRecord(value.layout)) return { errors: ["layoutが不正です"], success: false };
    return { intent: { layout: parseHouseLayout(value.layout), type: "setLayout" }, success: true };
  }
  if (value.type === "setEditing") {
    if (typeof value.editing !== "boolean") return { errors: ["editingは真偽値で指定してください"], success: false };
    return { intent: { editing: value.editing, type: "setEditing" }, success: true };
  }
  if (value.type === "renderThumbnails") return { intent: { type: "renderThumbnails" }, success: true };
  if (value.type === "dragFurniture") {
    const kind = findPlaceableKind(value.kind);
    if (!kind) return { errors: ["kindが不正です"], success: false };
    if (value.phase !== "cancel" && value.phase !== "drop" && value.phase !== "move") {
      return { errors: ["phaseが不正です"], success: false };
    }
    if (!isFiniteNumber(value.viewX) || !isFiniteNumber(value.viewY)) {
      return { errors: ["viewX・viewYは数で指定してください"], success: false };
    }
    return {
      intent: { kind, phase: value.phase, type: "dragFurniture", viewX: value.viewX, viewY: value.viewY },
      success: true,
    };
  }
  if (value.type === "move") {
    if (!isFiniteNumber(value.dx) || value.dx < -1 || value.dx > 1) {
      return { errors: ["dxは-1〜1の数で指定してください"], success: false };
    }
    return { intent: { dx: value.dx, type: "move" }, success: true };
  }
  if (value.type === "setActive") {
    if (typeof value.active !== "boolean") return { errors: ["activeは真偽値で指定してください"], success: false };
    return { intent: { active: value.active, type: "setActive" }, success: true };
  }
  if (value.type === "stopWalk") return { intent: { type: "stopWalk" }, success: true };
  if (value.type === "walkTo") {
    if (!isNonEmptyString(value.furnitureId)) return { errors: ["furnitureIdが不正です"], success: false };
    return { intent: { furnitureId: value.furnitureId, type: "walkTo" }, success: true };
  }
  return { errors: [`未知のtypeです: ${String(value.type)}`], success: false };
}

/**
 * RN 側で受け取ったイベントを検証する。
 * @param raw - onMessage で受け取った値
 * @returns 成功時は検証済みのイベント、失敗時はエラーメッセージ配列
 */
export function parseHouseRoomEvent(raw: unknown): EventParseResult {
  const value = parseJson(raw);
  if (!isRecord(value)) return { errors: ["オブジェクト形式ではありません"], success: false };

  if (value.event === "ready") return { event: { event: "ready" }, success: true };
  if (value.event === "characterTapped") return { event: { event: "characterTapped" }, success: true };
  if (value.event === "nearby") {
    if (!isHouseFloor(value.floor)) return { errors: ["floorが不正です"], success: false };
    // 離れたときは null が届く
    const furnitureId =
      value.furnitureId === null ? null : isNonEmptyString(value.furnitureId) ? value.furnitureId : undefined;
    if (furnitureId === undefined) return { errors: ["furnitureIdが不正です"], success: false };
    return { event: { event: "nearby", floor: value.floor, furnitureId }, success: true };
  }
  if (value.event === "furnitureSelected") {
    if (!isHouseFloor(value.floor)) return { errors: ["floorが不正です"], success: false };
    const furnitureId =
      value.furnitureId === null ? null : isNonEmptyString(value.furnitureId) ? value.furnitureId : undefined;
    if (furnitureId === undefined) return { errors: ["furnitureIdが不正です"], success: false };
    return { event: { event: "furnitureSelected", floor: value.floor, furnitureId }, success: true };
  }
  if (value.event === "furnitureMoved") {
    if (!isHouseFloor(value.floor)) return { errors: ["floorが不正です"], success: false };
    if (!isNonEmptyString(value.furnitureId)) return { errors: ["furnitureIdが不正です"], success: false };
    // 指は部屋の外まで動かせるので、範囲の外の値も受け取り、置ける位置へは RN 側で収める
    if (!isFiniteNumber(value.x)) return { errors: ["xが不正です"], success: false };
    return {
      event: { event: "furnitureMoved", floor: value.floor, furnitureId: value.furnitureId, x: value.x },
      success: true,
    };
  }
  if (value.event === "furnitureDropped") {
    if (!isHouseFloor(value.floor)) return { errors: ["floorが不正です"], success: false };
    const kind = findPlaceableKind(value.kind);
    if (!kind) return { errors: ["kindが不正です"], success: false };
    // 部屋の端で離すと 0〜1 の外になることがあるので、範囲の外の値も受け取り、置ける位置へは RN 側で収める
    if (!isFiniteNumber(value.x)) return { errors: ["xが不正です"], success: false };
    return { event: { event: "furnitureDropped", floor: value.floor, kind, x: value.x }, success: true };
  }
  if (value.event === "thumbnail") {
    const kind = findPlaceableKind(value.kind);
    if (!kind) return { errors: ["kindが不正です"], success: false };
    if (
      typeof value.dataUrl !== "string" ||
      !value.dataUrl.startsWith(THUMBNAIL_PREFIX) ||
      value.dataUrl.length > MAX_THUMBNAIL_LENGTH
    ) {
      return { errors: ["dataUrlが不正です"], success: false };
    }
    return { event: { dataUrl: value.dataUrl, event: "thumbnail", kind }, success: true };
  }
  if (value.event === "arrived") {
    if (!isHouseFloor(value.floor)) return { errors: ["floorが不正です"], success: false };
    if (!isNonEmptyString(value.furnitureId)) return { errors: ["furnitureIdが不正です"], success: false };
    return { event: { event: "arrived", floor: value.floor, furnitureId: value.furnitureId }, success: true };
  }
  if (value.event === "tags") {
    if (!isHouseFloor(value.floor)) return { errors: ["floorが不正です"], success: false };
    if (typeof value.hasCharacter !== "boolean") return { errors: ["hasCharacterが不正です"], success: false };
    if (!Array.isArray(value.tags) || value.tags.length > MAX_TAGS) {
      return { errors: ["tagsが不正です"], success: false };
    }
    const tags: HouseRoomTag[] = [];
    for (const tag of value.tags) {
      if (!isRecord(tag) || !isNonEmptyString(tag.id) || !isFiniteNumber(tag.x) || !isFiniteNumber(tag.y)) {
        return { errors: ["tagsの中身が不正です"], success: false };
      }
      tags.push({ id: tag.id, x: tag.x, y: tag.y });
    }
    return { event: { event: "tags", floor: value.floor, hasCharacter: value.hasCharacter, tags }, success: true };
  }
  if (value.event === "error") {
    const message = typeof value.message === "string" ? value.message : "";
    return { event: value.fatal === true ? { event: "error", fatal: true, message } : { event: "error", message }, success: true };
  }
  return { errors: [`未知のeventです: ${String(value.event)}`], success: false };
}
