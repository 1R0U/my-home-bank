// 自分の家の中の「もようがえ」（Issue #425）を受け持つ WebView 側の処理。
//
// - もようがえ中は、動かせる家具（置いた家具とクローゼット）を指でつまんで左右に動かせる
// - 選んだ家具を縁取り、選んだ・選ぶのをやめたことを RN へ知らせる（furnitureSelected）
// - 動かし終えた位置を RN へ知らせる（furnitureMoved）。配置を直して保存するのは RN で、
//   直した配置が setLayout で送り直されてくるまで、ここでは配置そのものを変えない
// - もようがえの一覧から家具を部屋へドラッグしている間は、置かれる位置に半透明の家具（ゴースト）を出し、
//   離した位置を RN へ知らせる（furnitureDropped）
//
// 部屋とキャラクターを描くのは houseRoom.ts。部屋を作り直すたびに `onRoomBuilt` を呼んでもらう。
// houseRoom.ts と一緒に esbuild でバンドルされ、グローバルの BABYLON を参照する。

import { findFreeX, isMovableFurniture, type HouseLayout, type HousePlaceableKind } from "../../lib/rpg-hub/houseLayout";
import { ROOM_DEPTH, ROOM_WIDTH, toRoomWorldX, type HouseFloor, type HouseFurniture, type HouseFurnitureKind } from "../../lib/rpg-hub/houseRoom";
import type { HouseRoomEvent, HouseRoomIntent } from "../../lib/rpg-hub/houseRoomBridge";
import { HOUSE_FURNITURE_SHAPES } from "../../lib/rpg-hub/houseRoomParts";
import { createPartMesh, toColor3 } from "./partMesh";

declare const BABYLON: any;

/** もようがえで選んだ家具の縁取りの色と太さ */
const SELECTED_OUTLINE_COLOR = "#ffd23f";
const SELECTED_OUTLINE_WIDTH = 0.04;
/** 一覧からドラッグしている家具（ゴースト）の透け具合。置いた家具と見分けられるように */
const GHOST_VISIBILITY = 0.55;
/** 指をこれ以上（部屋の横幅に対する割合）動かしたら、家具を動かしたとみなす。触っただけで位置がずれないように */
const DRAG_THRESHOLD = 0.005;

/** 部屋に組み立てた家具1つ */
export type FurnitureNode = { meshes: any[]; node: any };

/**
 * 家具を置く奥行きの位置。奥の壁にぴったり付ける。
 * @param kind - 家具の種類
 * @returns 3Dの奥行きの座標
 */
export function getFurnitureZ(kind: HouseFurnitureKind): number {
  return -ROOM_DEPTH + HOUSE_FURNITURE_SHAPES[kind].depth / 2 + 0.01;
}

type Deps = {
  /** 部屋を映しているカメラ。指の位置を部屋の中の位置に直すのに使う */
  camera: any;
  /** 部屋に組み立てた家具（家具のIDから引く）。部屋を作り直すと中身が入れ替わる */
  furnitureNodes: ReadonlyMap<string, FurnitureNode>;
  /** いま映している階。まだ映していなければ null */
  getFloor: () => HouseFloor | null;
  /** いまの配置 */
  getLayout: () => HouseLayout;
  /** いま映している階の家具 */
  getRoomFurniture: () => readonly HouseFurniture[];
  postToRN: (event: HouseRoomEvent) => void;
  scene: any;
};

/** RN から届く、一覧からのドラッグの知らせ */
type DragFurnitureIntent = Extract<HouseRoomIntent, { type: "dragFurniture" }>;

/**
 * もようがえの処理を用意する。指の操作の受け取りもここで始める。
 * @param deps - 部屋の状態を読むための関数など
 * @returns もようがえを切り替える・部屋を作り直したことを伝えるための関数
 */
export function createHouseRoomEditing(deps: Deps) {
  const camera = deps.camera;
  const furnitureNodes = deps.furnitureNodes;
  const getFloor = deps.getFloor;
  const getLayout = deps.getLayout;
  const getRoomFurniture = deps.getRoomFurniture;
  const postToRN = deps.postToRN;
  const scene = deps.scene;
  let editing = false;
  /** もようがえで選んでいる家具のID */
  let selectedId: string | null = null;
  /** 指でつまんで動かしている家具。startX は動かし始めた位置、grabOffset は家具の中心から指までのずれ（割合） */
  let drag: { furniture: HouseFurniture; grabOffset: number; lastDesiredX: number; moved: boolean; startX: number } | null = null;
  /** 一覧から部屋へドラッグしている家具の、半透明の姿 */
  let ghost: { kind: HousePlaceableKind; node: any } | null = null;

  /**
   * 家具をタップできるかを、もようがえ中かどうかに合わせる。
   * ふだんの家具はタップしても何も起きない（スティックで近づいてボタンで使う）。
   * もようがえ中は、動かせる家具だけをつまめるようにし、選んだ家具を縁取る
   */
  function refreshFurniturePicking(): void {
    furnitureNodes.forEach((entry, furnitureId) => {
      const pickable = editing && isMovableFurniture(furnitureId);
      const selected = editing && furnitureId === selectedId;
      entry.meshes.forEach((mesh) => {
        mesh.isPickable = pickable;
        mesh.renderOutline = selected;
        if (selected) {
          mesh.outlineColor = toColor3(SELECTED_OUTLINE_COLOR);
          mesh.outlineWidth = SELECTED_OUTLINE_WIDTH;
        }
      });
    });
  }

  /** もようがえで選ぶ家具を変え、RN へ知らせる */
  function selectFurniture(furnitureId: string | null): void {
    if (furnitureId === selectedId) return;
    selectedId = furnitureId;
    refreshFurniturePicking();
    const floor = getFloor();
    if (floor) postToRN({ event: "furnitureSelected", floor, furnitureId });
  }

  /**
   * 動かしている途中の家具を、動かし始めた位置へ戻してやめる。
   * 指を離す前にもようがえを終えたときなど、RN へ知らせずにやめると、
   * 見た目だけが保存していない位置に残ってしまうため（1R0Uレビュー指摘）
   */
  function cancelDrag(): void {
    if (!drag) return;
    const cancelled = drag;
    drag = null;
    furnitureNodes
      .get(cancelled.furniture.id)
      ?.node.position.set(toRoomWorldX(cancelled.startX), 0, getFurnitureZ(cancelled.furniture.kind));
  }

  /**
   * 画面上の位置（canvas の左上を原点とした CSS の px ＝ React Native の長さの単位）を、
   * 部屋の横幅に対する割合にする（真横からの平行投影なので、カメラからの光線の横の座標そのまま）
   */
  function viewToRoomX(viewX: number, viewY: number): number {
    const ray = scene.createPickingRay(viewX, viewY, BABYLON.Matrix.Identity(), camera);
    return ray.origin.x / ROOM_WIDTH + 0.5;
  }

  /** 指の位置を、部屋の横幅に対する割合にする */
  function pointerToRoomX(): number {
    return viewToRoomX(scene.pointerX, scene.pointerY);
  }

  function clearGhost(): void {
    if (!ghost) return;
    ghost.node.dispose(false, true);
    ghost = null;
  }

  /**
   * 置かれる位置に、半透明の家具を出す。部屋を作り直しても消えないよう、部屋とは別に持つ。
   * @param kind - ドラッグしている家具
   * @param x - 置かれる位置（割合）。置ける所が無ければ null で、ゴーストを隠す
   */
  function showGhost(kind: HousePlaceableKind, x: number | null): void {
    if (!ghost || ghost.kind !== kind) {
      clearGhost();
      const node = new BABYLON.TransformNode(`ghost-${kind}`, scene);
      HOUSE_FURNITURE_SHAPES[kind].parts.forEach((part, index) => {
        const mesh = createPartMesh(part, scene, `ghost-${kind}-${index}`, part.color);
        mesh.parent = node;
        mesh.isPickable = false;
        mesh.visibility = GHOST_VISIBILITY;
      });
      ghost = { kind, node };
    }
    ghost.node.setEnabled(x !== null);
    if (x !== null) ghost.node.position.set(toRoomWorldX(x), 0, getFurnitureZ(kind));
  }

  // --- 部屋の家具を指でつまんで動かす ---
  scene.onPointerObservable.add((pointerInfo: any) => {
    const floor = getFloor();
    if (!editing || !floor) return;
    const types = BABYLON.PointerEventTypes;
    if (pointerInfo.type === types.POINTERDOWN) {
      const pick = scene.pick(scene.pointerX, scene.pointerY, (mesh: any) => mesh.isPickable && !!mesh.metadata?.furnitureId);
      const furnitureId: string | undefined = pick?.hit ? pick.pickedMesh.metadata.furnitureId : undefined;
      const furniture = furnitureId ? getRoomFurniture().find((item) => item.id === furnitureId) : undefined;
      if (!furniture) {
        drag = null;
        selectFurniture(null);
        return;
      }
      selectFurniture(furniture.id);
      drag = {
        furniture,
        grabOffset: pointerToRoomX() - furniture.x,
        lastDesiredX: furniture.x,
        moved: false,
        startX: furniture.x,
      };
    } else if (pointerInfo.type === types.POINTERMOVE && drag) {
      const desiredX = pointerToRoomX() - drag.grabOffset;
      if (!drag.moved && Math.abs(desiredX - drag.startX) < DRAG_THRESHOLD) return;
      drag.moved = true;
      drag.lastDesiredX = desiredX;
      // ほかの家具と重なる所へは動かさず、すぐ隣で止める。どこにも置けなければ元の位置のまま
      const x = findFreeX(floor, getLayout(), drag.furniture.kind, desiredX, drag.furniture.id) ?? drag.startX;
      furnitureNodes.get(drag.furniture.id)?.node.position.set(toRoomWorldX(x), 0, getFurnitureZ(drag.furniture.kind));
    } else if (pointerInfo.type === types.POINTERUP && drag) {
      const finished = drag;
      drag = null;
      if (finished.moved) {
        postToRN({ event: "furnitureMoved", floor, furnitureId: finished.furniture.id, x: finished.lastDesiredX });
      }
    }
  });

  return {
    isEditing: () => editing,

    /** もようがえを始める・終える。終えるときは、動かしている途中の家具も元へ戻す */
    setEditing(next: boolean): void {
      editing = next;
      cancelDrag();
      if (!editing) {
        selectFurniture(null);
        clearGhost();
      }
      refreshFurniturePicking();
    },

    /** 部屋を作り直した。作り直した部屋に選んでいた家具が無くなっていれば（しまったときなど）、選ぶのをやめる */
    onRoomBuilt(): void {
      drag = null;
      if (selectedId !== null && !furnitureNodes.has(selectedId)) selectFurniture(null);
      refreshFurniturePicking();
    },

    /** 別の階へ移る。選んでいた家具と、ドラッグ中の半透明の家具を片付ける */
    onFloorChange(): void {
      selectFurniture(null);
      clearGhost();
    },

    /** もようがえの一覧から家具をドラッグしている */
    dragFromTray(intent: DragFurnitureIntent): void {
      const floor = getFloor();
      if (intent.phase === "move") {
        const x = floor ? findFreeX(floor, getLayout(), intent.kind, viewToRoomX(intent.viewX, intent.viewY)) : null;
        showGhost(intent.kind, x);
        return;
      }
      clearGhost();
      if (intent.phase === "drop" && floor) {
        postToRN({ event: "furnitureDropped", floor, kind: intent.kind, x: viewToRoomX(intent.viewX, intent.viewY) });
      }
    },
  };
}
