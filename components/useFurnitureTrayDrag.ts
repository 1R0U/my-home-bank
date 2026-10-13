import { useCallback, useRef, useState, type RefObject } from "react";
import { Animated, type View } from "react-native";
import type { HousePlaceableKind } from "../lib/rpg-hub/houseLayout";
import type { HouseRoomViewHandle } from "./rpg-hub-web/HouseRoomView";

/** 一覧から持ち上げた家具を、指に重ねて出す大きさ */
export const DRAGGED_FURNITURE_SIZE = 72;

/**
 * 部屋（WebView）へ指の位置を送り直す、指の動きの下限（React Native の長さの単位）。
 * わずかな揺れのたびに送らないための間引き（WebVirtualPad の INPUT_EPSILON と同じ考え方）
 */
const MIN_SEND_DISTANCE = 2;

type Frame = { height: number; width: number; x: number; y: number };

/** 持ち上げている家具。位置は state に持たず、Animated の値で動かす（指が動くたびに画面を描き直さないため） */
export type TrayDragState = {
  /** その階に置ける所があるか。無ければ、部屋の上でも指に重ねた家具を出したまま「おけないよ」と出す */
  canPlace: boolean;
  kind: HousePlaceableKind;
  /** 指が部屋の上にあるか */
  overRoom: boolean;
};

type Options = {
  /** その家具を、今の階のどこかに置けるか */
  canPlace: (kind: HousePlaceableKind) => boolean;
  /** 持ち上げた（選んでいた家具を選ぶのをやめるなど） */
  onLift: () => void;
  roomRef: RefObject<HouseRoomViewHandle | null>;
};

/**
 * もようがえの一覧から部屋へ家具をドラッグする操作（Issue #425）。
 *
 * 指に重ねて出す家具の位置は `position`（Animated.ValueXY）で動かし、state を変えるのは
 * 「持ち上げた・部屋の上に入った・出た・離した」ときだけにする（1R0Uレビュー指摘：指が動くたびに
 * 画面全体を描き直していた）。部屋の上では、置かれる位置に部屋の中で半透明の家具を出してもらう。
 * @returns 部屋の枠・画面に付ける ref、一覧に渡すハンドラ、持ち上げている家具と位置
 */
export function useFurnitureTrayDrag({ canPlace, onLift, roomRef }: Options) {
  const position = useRef(new Animated.ValueXY()).current;
  const [dragging, setDragging] = useState<TrayDragState | null>(null);
  const draggingRef = useRef<TrayDragState | null>(null);
  // 部屋の枠と画面の、画面全体での位置。持ち上げたときに測り、指が部屋の上にあるかを決める
  const roomFrameViewRef = useRef<View>(null);
  const roomFrameRef = useRef<Frame | null>(null);
  const screenViewRef = useRef<View>(null);
  const screenOriginRef = useRef({ x: 0, y: 0 });
  /** 最後に部屋へ送った指の位置。部屋の外にいる間は null */
  const lastSentRef = useRef<{ viewX: number; viewY: number } | null>(null);
  /** 最後に分かった指の位置（画面全体）。画面の位置を測り終えたときに、指に重ねた家具をここへ置き直す */
  const lastPointerRef = useRef({ pageX: 0, pageY: 0 });

  const update = (next: TrayDragState | null) => {
    draggingRef.current = next;
    setDragging(next);
  };

  /** 指に重ねる家具を、指の少し上（指で隠れないように）へ動かす */
  const moveOverlay = (pageX: number, pageY: number) => {
    position.setValue({
      x: pageX - screenOriginRef.current.x - DRAGGED_FURNITURE_SIZE / 2,
      y: pageY - screenOriginRef.current.y - DRAGGED_FURNITURE_SIZE * 1.2,
    });
  };

  /**
   * 画面全体での指の位置を、部屋の枠の中の位置にする。
   * @returns 部屋の枠の左上を原点とした位置。指が部屋の外なら null
   */
  const toRoomView = (pageX: number, pageY: number) => {
    const frame = roomFrameRef.current;
    if (!frame) return null;
    const viewX = pageX - frame.x;
    const viewY = pageY - frame.y;
    if (viewX < 0 || viewY < 0 || viewX > frame.width || viewY > frame.height) return null;
    return { viewX, viewY };
  };

  const onDragStart = useCallback(
    (kind: HousePlaceableKind, pageX: number, pageY: number) => {
      roomFrameRef.current = null;
      lastSentRef.current = null;
      lastPointerRef.current = { pageX, pageY };
      roomFrameViewRef.current?.measureInWindow((x, y, width, height) => {
        roomFrameRef.current = { height, width, x, y };
      });
      screenViewRef.current?.measureInWindow((x, y) => {
        screenOriginRef.current = { x, y };
        // 測り終えるまでに指が動いていることがあるので、持ち上げた位置ではなく、いまの指の位置へ置き直す
        // （持ち上げた位置へ戻すと、次に指が動くまで一瞬元の位置に見える。1R0Uレビュー指摘）
        moveOverlay(lastPointerRef.current.pageX, lastPointerRef.current.pageY);
      });
      moveOverlay(pageX, pageY);
      onLift();
      update({ canPlace: canPlace(kind), kind, overRoom: false });
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [canPlace, onLift],
  );

  const onDragMove = useCallback(
    (pageX: number, pageY: number) => {
      const current = draggingRef.current;
      if (!current) return;
      lastPointerRef.current = { pageX, pageY };
      moveOverlay(pageX, pageY);
      const point = toRoomView(pageX, pageY);
      if ((point !== null) !== current.overRoom) update({ ...current, overRoom: point !== null });

      if (!point) {
        // 部屋の外へ出たら、部屋の中の半透明の家具を消してもらう（出たときに1回だけ）
        if (lastSentRef.current) roomRef.current?.dragFurniture(current.kind, "cancel", 0, 0);
        lastSentRef.current = null;
        return;
      }
      const last = lastSentRef.current;
      if (last && Math.hypot(point.viewX - last.viewX, point.viewY - last.viewY) < MIN_SEND_DISTANCE) return;
      lastSentRef.current = point;
      roomRef.current?.dragFurniture(current.kind, "move", point.viewX, point.viewY);
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [roomRef],
  );

  const onDragEnd = useCallback(
    (pageX: number, pageY: number, cancelled: boolean) => {
      const current = draggingRef.current;
      update(null);
      lastSentRef.current = null;
      if (!current) return;
      const point = cancelled ? null : toRoomView(pageX, pageY);
      roomRef.current?.dragFurniture(current.kind, point ? "drop" : "cancel", point?.viewX ?? 0, point?.viewY ?? 0);
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [roomRef],
  );

  /**
   * 持ち上げている家具を、置かずに片付ける。もようがえを終えたときなど、一覧ごと消えるときに呼ぶ。
   * 一覧が消えると、指を離した知らせ（onDragEnd）が届かないことがあり、指に重ねた家具が残ってしまうため
   * （CodeRabbitレビュー指摘）
   */
  const cancel = useCallback(() => {
    const current = draggingRef.current;
    update(null);
    lastSentRef.current = null;
    if (current) roomRef.current?.dragFurniture(current.kind, "cancel", 0, 0);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [roomRef]);

  return { cancel, dragging, onDragEnd, onDragMove, onDragStart, position, roomFrameViewRef, screenViewRef };
}
