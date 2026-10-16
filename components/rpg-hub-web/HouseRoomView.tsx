import { File, Paths } from "expo-file-system";
import { forwardRef, useCallback, useEffect, useImperativeHandle, useRef, useState } from "react";
import { ActivityIndicator, Pressable, Text, View } from "react-native";
import { WebView } from "react-native-webview";
import { readAssetText } from "./assetText";
import { UI_COLORS } from "../../constants/ui";
import { buildHouseRoomHtml, HOUSE_ROOM_BACKGROUND } from "./sceneHtml";
import { findHouseFurniture, type HouseFloor } from "../../lib/rpg-hub/houseRoom";
import { getRoomFurniture, type HouseLayout, type HousePlaceableKind } from "../../lib/rpg-hub/houseLayout";
import {
  encodeHouseRoomMessage,
  parseHouseRoomEvent,
  type HouseRoomIntent,
  type HouseRoomTag,
} from "../../lib/rpg-hub/houseRoomBridge";
import type { PortraitLook } from "../../lib/rpg-hub/portraitBridge";

// Metro には txt を assetExts に追加済み（metro.config.js）。
// どちらも postinstall で生成される（scripts/sync-babylon.mjs / scripts/build-rpg-scene.mjs）。
const babylonAsset = require("../../assets/babylon/babylon.txt");
const houseRoomAsset = require("../../assets/rpg-hub/houseRoom.txt");

/** 名札の横幅（React Native の長さの単位）。位置を家具の真上の中央へ合わせるのに使う */
const TAG_WIDTH = 76;

/**
 * 家の中を描く HTML をキャッシュへ書き出し、その URI を返す。
 * 8MB超の Babylon UMD を文字列 prop として渡さないため（RpgHubWebView と同じ）。
 * @returns 書き出した HTML の URI
 */
async function writeHouseRoomHtml(): Promise<string> {
  const [babylonSource, houseRoomSource] = await Promise.all([
    readAssetText(babylonAsset, "babylon.txt"),
    readAssetText(houseRoomAsset, "houseRoom.txt"),
  ]);
  const htmlFile = new File(Paths.cache, "rpg-hub-house-room.html");
  if (htmlFile.exists) htmlFile.delete();
  htmlFile.create();
  htmlFile.write(buildHouseRoomHtml(babylonSource, houseRoomSource));
  return htmlFile.uri;
}

/** 書き出しはアプリを開いている間に1回だけ行う（WardrobePreview と同じ）。失敗したら次の機会にやり直す */
let htmlPromise: Promise<string> | null = null;

function prepareHouseRoomHtml(): Promise<string> {
  if (!htmlPromise) {
    htmlPromise = writeHouseRoomHtml().catch((error: unknown) => {
      htmlPromise = null;
      throw error;
    });
  }
  return htmlPromise;
}

export type HouseRoomViewHandle = {
  /**
   * もようがえの一覧から家具をドラッグしていることを伝える。部屋がまだ映っていなければ何もしない。
   * @param kind - ドラッグしている家具
   * @param phase - move は動かしている途中、drop は部屋の上で離した、cancel はやめた
   * @param viewX - 部屋の枠の左上を原点とした、指の横の位置
   * @param viewY - 部屋の枠の左上を原点とした、指の縦の位置
   */
  dragFurniture: (kind: HousePlaceableKind, phase: "cancel" | "drop" | "move", viewX: number, viewY: number) => void;
  /**
   * スティックの左右の倒し具合を伝える。部屋がまだ映っていなければ何もしない。
   * @param dx - -1 で左いっぱい、1 で右いっぱい、0 で離した
   */
  move: (dx: number) => void;
  /** 名札をタップして向かっている途中なら、その場で取りやめる。部屋がまだ映っていなければ何もしない */
  stopWalk: () => void;
  /**
   * 家具の前まで歩かせる。着いたら `onArrived` で知らせる。部屋がまだ映っていなければ何もしない。
   * @param furnitureId - 向かう家具のID
   * @returns 歩かせる指示を送れたら true。部屋がまだ映っていない・映せなかったときは false
   */
  walkTo: (furnitureId: string) => boolean;
};

type Props = {
  /** うろうろ歩くかどうか。別の画面へ行っている間は止める */
  active: boolean;
  /** もようがえ中か。もようがえ中は歩かず、動かせる家具を指でつまんで動かせる（Issue #425） */
  editing: boolean;
  /** 映す階 */
  floor: HouseFloor;
  /** 家の中の配置。読み込みが終わるまでは null で、その間は部屋を映し始めない */
  layout: HouseLayout | null;
  /** キャラクターの見た目。読み込みが終わるまでは null */
  look: PortraitLook | null;
  /** walkTo で歩かせた家具の前に着いた */
  onArrived: (furnitureId: string) => void;
  /** キャラクターがタップされた */
  onCharacterTapped: () => void;
  /** 部屋を表示できなかった。家具に近づけないので、呼び出し側は代わりのボタンを出す */
  onFailed: () => void;
  /** もようがえ中に家具を動かし終えた。x は指を離した位置（置けるかどうかは呼び出し側で確かめる） */
  onFurnitureMoved: (furnitureId: string, x: number) => void;
  /** もようがえ中に家具を選んだ（家具のID）・選ぶのをやめた（null） */
  onFurnitureSelected: (furnitureId: string | null) => void;
  /** もようがえの一覧からドラッグした家具を、部屋の上で離した。x は置きたい位置（置けるかどうかは呼び出し側で確かめる） */
  onFurnitureDropped: (kind: HousePlaceableKind, x: number) => void;
  /** 置ける家具の絵が描けた（もようがえの一覧に出す）。dataUrl は PNG の data URL */
  onFurnitureThumbnail: (kind: HousePlaceableKind, dataUrl: string) => void;
  /** 使える家具に近づいた（家具のID）・離れた（null） */
  onNearbyChange: (furnitureId: string | null) => void;
  /**
   * 部屋とキャラクターが映った（WebView が作り直されたときにも、また呼ぶ）。
   * WebView の ready ではまだ映っていない。部屋と姿は ready の後に送るため
   */
  onShown?: () => void;
  /** 家具の名札がタップされた（家具のID） */
  onTagPressed: (furnitureId: string) => void;
  /** 階を映し始めるときにキャラクターが立つ位置（部屋の横幅に対する割合） */
  standX: number;
};

/**
 * 自分の家の中を、3Dの部屋を真横から見た固定の視点で映す（Issue #386）。
 *
 * 描く・歩かせるのは WebView（webview/rpg-hub/houseRoom.ts）。スティックの入力は呼び出し側から
 * `move` で受け取って渡す。家具の機能の実行は、呼び出し側（MyHouseScreen）が
 * `onNearbyChange` で近くの家具を知って、ボタンを出して受け持つ。
 *
 * 機能のある家具（きがえ・階段・外へ）には、3Dの家具の真上に RN の名札を重ねる。
 * 名札の位置は WebView が測って送ってくる（tags）。名札をタップすると `onTagPressed` で知らせる
 * （呼び出し側が `walkTo` で家具の前まで歩かせ、着いたら機能を実行する。Issue #422）。
 */
export const HouseRoomView = forwardRef<HouseRoomViewHandle, Props>(function HouseRoomView(
  {
    active,
    editing,
    floor,
    layout,
    look,
    onArrived,
    onCharacterTapped,
    onFailed,
    onFurnitureDropped,
    onFurnitureMoved,
    onFurnitureSelected,
    onFurnitureThumbnail,
    onNearbyChange,
    onShown,
    onTagPressed,
    standX,
  },
  ref,
) {
  const webViewRef = useRef<WebView>(null);
  const [uri, setUri] = useState<string | null>(null);
  // ready のたびに増える世代。WebView が作り直されたときにも、見た目と階を送り直す
  const [sceneGeneration, setSceneGeneration] = useState(0);
  const isReadyRef = useRef(false);
  const [error, setError] = useState<string | null>(null);
  // どの世代の WebView が測った名札か。作り直す前の名札を、作り直した部屋が映った合図にしないため
  const [tags, setTags] = useState<{
    floor: HouseFloor;
    generation: number;
    hasCharacter: boolean;
    tags: HouseRoomTag[];
  } | null>(null);
  const sceneGenerationRef = useRef(sceneGeneration);
  sceneGenerationRef.current = sceneGeneration;

  // 階を映し始める位置は、階が変わったときだけ使う。standX が変わっただけで送り直すと、
  // 歩いている途中のキャラクターが元の位置へ戻ってしまう
  const standXRef = useRef(standX);
  standXRef.current = standX;

  const send = useCallback((intent: HouseRoomIntent) => {
    webViewRef.current?.postMessage(encodeHouseRoomMessage(intent));
  }, []);

  useEffect(() => {
    let cancelled = false;
    prepareHouseRoomHtml()
      .then((preparedUri) => {
        if (!cancelled) setUri(preparedUri);
      })
      .catch((e: unknown) => {
        if (!cancelled) setError(e instanceof Error ? e.message : String(e));
      });
    return () => {
      cancelled = true;
    };
  }, []);

  // 映ったと知らせた世代
  const shownGenerationRef = useRef(0);

  useEffect(() => {
    if (sceneGeneration === 0 || !look) return;
    send({ look, type: "setLook" });
  }, [look, sceneGeneration, send]);

  // 配置は階より先に送る（WebView は届いた配置で階を作る）。変わるたびに送り直すと、今の階を作り直す
  useEffect(() => {
    if (sceneGeneration === 0 || !layout) return;
    send({ layout, type: "setLayout" });
  }, [layout, sceneGeneration, send]);

  const hasLayout = layout !== null;
  useEffect(() => {
    if (sceneGeneration === 0 || !hasLayout) return;
    setTags(null);
    send({ floor, standX: standXRef.current, type: "setFloor" });
  }, [floor, hasLayout, sceneGeneration, send]);

  useEffect(() => {
    if (sceneGeneration === 0) return;
    send({ editing, type: "setEditing" });
  }, [editing, sceneGeneration, send]);

  // 家具の絵は部屋を映し始めてから頼む（部屋が映るのを待たせないように）
  useEffect(() => {
    if (sceneGeneration === 0 || !hasLayout) return;
    send({ type: "renderThumbnails" });
  }, [hasLayout, sceneGeneration, send]);

  // 部屋と姿が映ったら知らせる（PR #421 CodeRabbitレビュー対応）。WebView は階や姿を作って
  // 描き終わったところで名札の位置（tags）を送り、そのときキャラクターが映っていたかも付けてくる。
  // 今の WebView・今の階の名札で、キャラクターが映っていたら、部屋と姿がそろったとみなす
  useEffect(() => {
    if (sceneGeneration === 0 || shownGenerationRef.current === sceneGeneration) return;
    if (tags?.floor !== floor || tags.generation !== sceneGeneration || !tags.hasCharacter) return;
    shownGenerationRef.current = sceneGeneration;
    onShown?.();
  }, [floor, onShown, sceneGeneration, tags]);

  useEffect(() => {
    if (sceneGeneration === 0) return;
    send({ active, type: "setActive" });
  }, [active, sceneGeneration, send]);

  const move = useCallback(
    (dx: number) => {
      if (!isReadyRef.current || error !== null) return;
      send({ dx: Math.min(1, Math.max(-1, dx)), type: "move" });
    },
    [error, send],
  );

  const dragFurniture = useCallback(
    (kind: HousePlaceableKind, phase: "cancel" | "drop" | "move", viewX: number, viewY: number) => {
      if (!isReadyRef.current || error !== null) return;
      send({ kind, phase, type: "dragFurniture", viewX, viewY });
    },
    [error, send],
  );

  const walkTo = useCallback(
    (furnitureId: string) => {
      if (!isReadyRef.current || error !== null) return false;
      send({ furnitureId, type: "walkTo" });
      return true;
    },
    [error, send],
  );

  const stopWalk = useCallback(() => {
    if (!isReadyRef.current || error !== null) return;
    send({ type: "stopWalk" });
  }, [error, send]);

  useImperativeHandle(ref, () => ({ dragFurniture, move, stopWalk, walkTo }), [dragFurniture, move, stopWalk, walkTo]);

  useEffect(() => {
    if (error !== null) onFailed();
  }, [error, onFailed]);

  const isLoading = error === null && (sceneGeneration === 0 || !hasLayout);
  // 階を切り替えた直後は、前の階の名札を出さない。もようがえ中は、動かしている家具と名札がずれるので出さない
  const shownTags = tags?.floor === floor && !editing ? tags.tags : [];
  const roomFurniture = layout ? getRoomFurniture(floor, layout) : [];

  return (
    <View
      className="flex-1 overflow-hidden rounded-3xl"
      style={{ backgroundColor: HOUSE_ROOM_BACKGROUND }}
      testID="house-room-view"
    >
      {uri && error === null ? (
        <WebView
          ref={webViewRef}
          source={{ uri }}
          originWhitelist={["*"]}
          allowFileAccess
          allowFileAccessFromFileURLs
          javaScriptEnabled
          // WebGL の描画が真っ黒になるのを防ぐ（RpgHubWebView と同じ）
          androidLayerType="hardware"
          scrollEnabled={false}
          bounces={false}
          // 3Dの部屋はスクリーンリーダーで読めないので、家具の名前は名札で、使うことは下のボタンでできるようにしてある
          accessibilityElementsHidden
          importantForAccessibility="no-hide-descendants"
          onLoadStart={() => {
            isReadyRef.current = false;
          }}
          onMessage={(event) => {
            const result = parseHouseRoomEvent(event.nativeEvent.data);
            if ("errors" in result) {
              console.warn("[house-room] 不正なイベント:", result.errors);
              return;
            }
            const received = result.event;
            if (received.event === "ready") {
              isReadyRef.current = true;
              setSceneGeneration((generation) => generation + 1);
            } else if (received.event === "nearby") {
              // 階を切り替えた直後に届いた、前の階の知らせは使わない
              if (received.floor === floor) onNearbyChange(received.furnitureId);
            } else if (received.event === "arrived") {
              // 階を切り替えた直後に届いた、前の階の知らせは使わない
              if (received.floor === floor) onArrived(received.furnitureId);
            } else if (received.event === "characterTapped") {
              onCharacterTapped();
            } else if (received.event === "furnitureSelected") {
              if (received.floor === floor) onFurnitureSelected(received.furnitureId);
            } else if (received.event === "furnitureMoved") {
              if (received.floor === floor) onFurnitureMoved(received.furnitureId, received.x);
            } else if (received.event === "furnitureDropped") {
              if (received.floor === floor) onFurnitureDropped(received.kind, received.x);
            } else if (received.event === "thumbnail") {
              onFurnitureThumbnail(received.kind, received.dataUrl);
            } else if (received.event === "tags") {
              setTags({
                floor: received.floor,
                generation: sceneGenerationRef.current,
                hasCharacter: received.hasCharacter,
                tags: received.tags,
              });
            } else {
              console.warn("[house-room] WebView 側のエラー:", received.message);
              // 準備ができる前の失敗は、待っていても映らないので表示を切り替える。
              // 準備のあとでも、部屋やキャラクターを作れなかった失敗（fatal）は同じく切り替える
              if (!isReadyRef.current || received.fatal) setError(received.message);
            }
          }}
          onError={(event) => {
            setError(event.nativeEvent.description || "WebView の読み込みに失敗しました");
          }}
          style={{ backgroundColor: "transparent", flex: 1 }}
        />
      ) : null}
      {shownTags.map((tag) => {
        const furniture = findHouseFurniture(roomFurniture, tag.id);
        if (!furniture?.tag) return null;
        return (
          // 名札をタップすると、その家具まで歩いてから使う。名札の上から指を動かしたときは、
          // まわりのスティック（WebVirtualPad）がドラッグを引き取るので、タップにはならない
          <Pressable
            key={`${floor}-${tag.id}`}
            accessibilityHint="かぐの まえまで あるいて つかいます"
            accessibilityLabel={`${furniture.label}（${furniture.tag}）`}
            accessibilityRole="button"
            className="absolute items-center rounded-full bg-amber-300 px-2 py-1 active:bg-amber-400"
            // 名札は小さいので、押せる範囲を少しだけ広げる。広げすぎると、スティックを使おうとして
            // 名札の近くを軽く触っただけで家具へ歩き出してしまう（1R0Uレビュー指摘）
            hitSlop={4}
            onPress={() => onTagPressed(tag.id)}
            style={{ left: tag.x - TAG_WIDTH / 2, top: tag.y - 28, width: TAG_WIDTH }}
          >
            <Text className="text-xs font-bold text-amber-950">{furniture.tag}</Text>
          </Pressable>
        );
      })}
      {isLoading ? (
        <View className="absolute inset-0 items-center justify-center" pointerEvents="none">
          <ActivityIndicator color={UI_COLORS.white} />
        </View>
      ) : null}
      {error !== null ? (
        <View className="absolute inset-0 items-center justify-center px-6">
          <Text className="text-center text-sm font-bold text-white">
            おへやを ひょうじできませんでした。{"\n"}したの ボタンで そとへ でたり、きがえたり できます。
          </Text>
        </View>
      ) : null}
    </View>
  );
});
