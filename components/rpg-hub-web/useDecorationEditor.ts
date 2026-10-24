import { type MutableRefObject, type RefObject, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Animated } from "react-native";
import { getAssetLabel, getPlaceableDecorations } from "../../lib/rpg-hub/catalog";
import { checkFurnitureChange, checkMove, checkNewPlacement, rotateQuarterTurn } from "../../lib/rpg-hub/decorationEdit";
import {
  getFurnitureLabel,
  getFurnitureRotationCenter,
  type HouseFurnitureLayout,
  isDefaultObjectId,
  isEditableId,
  isMovableFurnitureId,
  isStorableDefaultObjectId,
  isStorableFurnitureId,
} from "../../lib/rpg-hub/houseFurniture";
import { isTownDecorationId } from "../../lib/rpg-hub/townDecorations";
import { type EditArea, getEditArea, getEditStandPoint } from "../../lib/rpg-hub/editView";
import { isBlocked } from "../../lib/rpg-hub/movement";
import { PLACEMENT_REJECTION_MESSAGES } from "../../lib/rpg-hub/placement";
import {
  createEditDragIntent,
  createPlacePlayerIntent,
  createResetEditViewIntent,
  createSetEditModeIntent,
  createSetEditSelectionIntent,
  createSetMapIntent,
  type RpgHubEvent,
} from "../../lib/rpg-hub/bridge";
import { availableDecorationCount } from "../../lib/storeAssets";
import { playSoundEffect } from "../../lib/audio";
import type { MapObject, Season } from "../../types/map";
import type { RpgHubWebHandle } from "./RpgHubWebView";

/** 置いた装飾を書き換える操作（usePlacedDecorations）。 */
type PlacedDecorationActions = {
  place: (decoration: { assetId: string; rotationY: number; scale: number; x: number; z: number }) => Promise<void>;
  remove: (objectId: string) => Promise<void>;
  update: (objectId: string, change: { rotationY?: number; x?: number; z?: number }) => Promise<void>;
};

type Options = {
  actions: PlacedDecorationActions;
  /** 家の中の家具・町の飾りの位置と向きを保存する・しまう（useHouseFurnitureLayouts） */
  furnitureActions: {
    save: (layout: HouseFurnitureLayout) => Promise<void>;
    store: (furnitureId: string) => Promise<void>;
  };
  currentSeasonRef: MutableRefObject<Season>;
  objects: MapObject[];
  ownedAssets: readonly { asset_id: string; quantity: number }[];
  placedDecorations: MapObject[];
  player: { x: number; z: number };
  /** 開くたびに持ち物を取り直す（ストアで買った直後でも出るように） */
  reloadOwnedAssets: () => Promise<void>;
  sceneGeneration: number;
  webViewRef: RefObject<RpgHubWebHandle>;
};

/** 一覧から引っぱっている装飾。指の位置は `ghostPosition`（描き直さずに動かす）。 */
export type DecorationDrag = { assetId: string };

export type DecorationEditor = {
  /** 選べる装飾ごとの、まだ置いていない数 */
  availableCounts: Record<string, number>;
  /** 置ける装飾（持っているもの。カタログの順） */
  assetIds: string[];
  /** 置く・しまうの処理中 */
  busy: boolean;
  /** 一覧から引っぱっている装飾。引っぱっていなければ null */
  drag: DecorationDrag | null;
  /** 編集モード中か */
  editing: boolean;
  /** 引っぱっている指の位置（3D表示の左上から）。DecorationDragGhost が読む */
  ghostPosition: Animated.ValueXY;
  /** 置けなかった・保存できなかったときの理由 */
  message: string | null;
  /** 選んでいる物（置いた装飾か、動かせる家具か、町の飾り） */
  selected: MapObject | null;
  /** 選んでいる物の名前と、しまえるか（クローゼットはしまえない）。パネルに出す */
  selectedInfo: { canRemove: boolean; label: string } | null;
  /** シーンからのイベントのうち、編集モードのものを処理する。処理したら true */
  handleEvent: (event: RpgHubEvent) => boolean;
  onDragCancel: () => void;
  onDragEnd: (pageX: number, pageY: number) => void;
  onDragMove: (pageX: number, pageY: number) => void;
  onDragStart: (assetId: string, pageX: number, pageY: number) => void;
  onPanelHeightChange: (height: number) => void;
  /** 3D表示の画面上の位置と高さ（指の位置を3D表示の中の位置へ直すのに使う） */
  onSceneFrameChange: (frame: { height: number; x: number; y: number }) => void;
  /** 上に重ねたUI（地図・メニュー）の下端の、画面上の位置 */
  onTopOverlayBottomChange: (bottom: number) => void;
  deselect: () => void;
  exit: () => void;
  removeSelected: () => void;
  /** 指で変えたズームと移動をやめ、範囲全体が収まる見え方へ戻す */
  resetView: () => void;
  rotateSelected: () => void;
  start: () => void;
  /** 画面の下からどれだけを、かざるパネルが隠しているか */
  panelHeight: number;
};

/**
 * かざるの編集モード（Issue #477）の状態と操作をまとめる。RpgHubScreen から使う。
 *
 * - 下の一覧から装飾を引っぱり、離したマスに置く（指の位置は `editDrag` でシーンへ送る）
 * - 置いた装飾をタップすると選ぶ。選んだら「まわす」「しまう」「やめる」を出す
 * - 置いた装飾を長押しすると持ち上がり、離したマスへ動く（シーン側で行い、`editDrop` が届く）
 *
 * **置けるかの最終判断はここで行う**（`checkNewPlacement` / `checkMove`）。置いたあとに建物へ
 * 行けるかの確認が重いので、シーンの目印は軽い判定だけを使っている。断ったときは、シーンが
 * 先に動かしていた見た目を戻すため、マップを送り直す。
 * @param options - 画面の状態と、置いた装飾を書き換える操作
 * @returns 編集モードの状態と操作
 */
export function useDecorationEditor(options: Options): DecorationEditor {
  const {
    actions,
    currentSeasonRef,
    furnitureActions,
    objects,
    ownedAssets,
    placedDecorations,
    player,
    reloadOwnedAssets,
    sceneGeneration,
    webViewRef,
  } = options;
  // 編集モード中に映す範囲。始めたときのプレイヤーの位置で決め、終わるまで動かさない
  // （編集中は歩かないので、途中で変える理由がない）
  const [area, setArea] = useState<EditArea | null>(null);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [drag, setDrag] = useState<DecorationDrag | null>(null);
  const [panelHeight, setPanelHeight] = useState(0);
  const [topOverlayBottom, setTopOverlayBottom] = useState(0);
  // 置く・しまうの処理中かどうか。**ref で持つのは、連打が React の commit を待たずに届くため**
  // （state だと同じ値を2回読んで二重に書き込み、上限を1つ超えたりする）
  const busyRef = useRef(false);
  // 3D表示の画面上の左上と高さ。指の位置を3D表示の中の位置へ直し、パネルの上で離したかを見る
  const sceneOriginRef = useRef({ x: 0, y: 0 });
  const sceneHeightRef = useRef(0);
  const ghostPosition = useRef(new Animated.ValueXY()).current;
  // シーンのイベントは古いクロージャで届くことがあるので、判定に使う最新の値は ref で読む
  const latestRef = useRef({ objects, placedDecorations, player });
  latestRef.current = { objects, placedDecorations, player };
  // 書き込みの操作は描画のたびに作り直される（usePlacedDecorations が毎回新しいオブジェクトを返す）。
  // 依存に入れるとイベントの処理まで毎回作り直すので、ref で最新を読む
  const actionsRef = useRef(actions);
  actionsRef.current = actions;
  const furnitureActionsRef = useRef(furnitureActions);
  furnitureActionsRef.current = furnitureActions;

  const editing = area !== null;

  const assetIds = useMemo(
    () =>
      getPlaceableDecorations().filter((assetId) =>
        ownedAssets.some((item) => item.asset_id === assetId && item.quantity > 0),
      ),
    [ownedAssets],
  );
  const availableCounts = useMemo(
    () =>
      Object.fromEntries(
        assetIds.map((assetId) => [assetId, availableDecorationCount(assetId, ownedAssets, placedDecorations)]),
      ),
    [assetIds, ownedAssets, placedDecorations],
  );
  // 置いた装飾だけでなく、動かせる家具・町の飾りも選べる（Issue #477・#509）。これらは objects にしかいない
  const selected = useMemo(
    () => (selectedId && isEditableId(selectedId) ? objects.find((object) => object.id === selectedId) ?? null : null),
    [objects, selectedId],
  );
  const selectedInfo = useMemo(() => {
    if (!selected) return null;
    if (isMovableFurnitureId(selected.id)) {
      return { canRemove: isStorableFurnitureId(selected.id), label: getFurnitureLabel(selected.id) };
    }
    return { canRemove: true, label: getAssetLabel(selected.model) ?? selected.model };
  }, [selected]);

  // 編集モードを始める・やめる。シーンが作り直されたとき（再読み込み）も送り直す。
  // 隠れている高さが変わったら（パネルの高さが決まったときなど）、範囲を収め直してもらう
  useEffect(() => {
    if (sceneGeneration === 0) return;
    webViewRef.current?.sendIntent(
      createSetEditModeIntent(area, { bottom: area ? panelHeight : 0, top: area ? topOverlayBottom : 0 }),
    );
  }, [area, panelHeight, sceneGeneration, topOverlayBottom, webViewRef]);

  useEffect(() => {
    if (sceneGeneration === 0) return;
    webViewRef.current?.sendIntent(createSetEditSelectionIntent(selected ? selected.id : null));
  }, [sceneGeneration, selected, webViewRef]);

  // しまった・別の人に切り替わったなどで、選んでいた装飾が無くなったら選択を外す
  useEffect(() => {
    if (selectedId && !selected) setSelectedId(null);
  }, [selected, selectedId]);

  /** シーンが先に動かしていた見た目を戻す（置けなかったとき）。マップをそのまま送り直す */
  const resyncScene = useCallback(() => {
    webViewRef.current?.sendIntent(createSetMapIntent(latestRef.current.objects, currentSeasonRef.current));
  }, [currentSeasonRef, webViewRef]);

  /**
   * 書き込みに失敗したときに、理由を出してログにも残す。
   *
   * Supabase のエラーは `Error` ではないので、画面には決まった文言を出す。**元のエラーは必ずログに残す。**
   * 残さないと、テーブルが無い・権限が無いといった原因が分からない（Issue #477 の実機確認で、
   * 本番DBにテーブルを作る前に家具を動かして「うごかせませんでした」だけが出た）。
   * @param e - 失敗の理由
   * @param fallback - `Error` でないときに出す文言
   */
  const reportWriteFailure = useCallback((e: unknown, fallback: string) => {
    console.warn(`[かざる] ${fallback}`, e);
    setMessage(e instanceof Error ? e.message : fallback);
  }, []);

  /**
   * 書き込みを1つずつ行う。処理中に届いた操作は断る（二重に置かない）。
   * @param write - 書き込み
   * @param failure - 失敗したときに出す文言
   * @returns 書き込んだら true。処理中で断ったら false
   */
  const runExclusive = useCallback((write: () => Promise<void>, failure: string): boolean => {
    if (busyRef.current) return false;
    busyRef.current = true;
    setBusy(true);
    write()
      .catch((e: unknown) => reportWriteFailure(e, failure))
      .finally(() => {
        busyRef.current = false;
        setBusy(false);
      });
    return true;
  }, [reportWriteFailure]);

  /**
   * 一覧から引っぱってきた装飾を置く。
   * @param assetId - 置く装飾
   * @param point - 指を離したマスの中心
   */
  const dropNew = useCallback(
    (assetId: string, point: { x: number; z: number }) => {
      const latest = latestRef.current;
      if (availableDecorationCount(assetId, ownedAssets, latest.placedDecorations) <= 0) {
        setMessage("このかざりはすべて配置済みです");
        return;
      }
      const result = checkNewPlacement(
        assetId,
        point,
        latest.objects,
        getEditStandPoint(latest.player, latest.objects),
        latest.placedDecorations.length,
      );
      if (result.rejection) {
        setMessage(PLACEMENT_REJECTION_MESSAGES[result.rejection]);
        return;
      }
      const candidate = result.candidate;
      setMessage(null);
      const accepted = runExclusive(
        () =>
          actionsRef.current
            .place({ assetId, rotationY: candidate.rotationY ?? 0, scale: 1, x: candidate.position.x, z: candidate.position.z })
            .then(() => playSoundEffect("decorate")),
        "おけませんでした",
      );
      if (!accepted) setMessage("いま おいています。すこし まってね");
    },
    [ownedAssets, runExclusive],
  );

  /**
   * 家具を動かす・回す（Issue #477）。置けなければ理由を出し、シーンが先に動かしていた見た目を戻す。
   * @param id - 家具のid
   * @param point - 置くマスの中心（回すだけなら今の位置）
   * @param rotationY - 向き（動かすだけなら今の向き）
   * @param failure - 置けないときに出す文言。省略時は置けない理由
   */
  const changeFurniture = useCallback(
    (id: string, point: { x: number; z: number }, rotationY: number, failure?: string) => {
      const latest = latestRef.current;
      const result = checkFurnitureChange(id, point, rotationY, latest.objects, getEditStandPoint(latest.player, latest.objects));
      if (result.rejection) {
        setMessage(failure ?? PLACEMENT_REJECTION_MESSAGES[result.rejection]);
        resyncScene();
        return;
      }
      const candidate = result.candidate;
      setMessage(null);
      playSoundEffect("decorate");
      // 画面は保存を待たずに動かす（useHouseFurnitureLayouts の save）。失敗したらDBから読み直して戻る
      furnitureActionsRef.current
        .save({ furnitureId: id, rotationY: candidate.rotationY ?? 0, x: candidate.position.x, z: candidate.position.z })
        .catch((e: unknown) => reportWriteFailure(e, "うごかせませんでした"));
    },
    [reportWriteFailure, resyncScene],
  );

  /**
   * 持ち上げて動かした装飾・家具・町の飾りを、離したマスへ動かす。
   * @param id - 動かした物のid
   * @param point - 指を離したマスの中心
   */
  const dropMoved = useCallback(
    (id: string, point: { x: number; z: number }) => {
      const latest = latestRef.current;
      if (isMovableFurnitureId(id)) {
        const furniture = latest.objects.find((object) => object.id === id);
        if (!furniture) {
          resyncScene();
          return;
        }
        // 同じマスへ下ろしただけなら、何もしない
        if (Math.abs(furniture.position.x - point.x) < 1e-6 && Math.abs(furniture.position.z - point.z) < 1e-6) return;
        changeFurniture(id, point, furniture.rotationY ?? 0);
        return;
      }
      // 町の飾り（Issue #509）は置いた装飾と同じ判定で動かし、保存先は家具と同じ（useHouseFurnitureLayouts）
      const town = isTownDecorationId(id);
      const moving = (town ? latest.objects : latest.placedDecorations).find((object) => object.id === id);
      if (!moving) {
        resyncScene();
        return;
      }
      // 同じマスへ下ろしただけなら、何もしない
      if (Math.abs(moving.position.x - point.x) < 1e-6 && Math.abs(moving.position.z - point.z) < 1e-6) return;
      const result = checkMove(
        id,
        point,
        latest.objects,
        getEditStandPoint(latest.player, latest.objects),
        latest.placedDecorations.length,
      );
      if (result.rejection || busyRef.current) {
        setMessage(result.rejection ? PLACEMENT_REJECTION_MESSAGES[result.rejection] : "いま おいています。すこし まってね");
        resyncScene();
        return;
      }
      const candidate = result.candidate;
      setMessage(null);
      playSoundEffect("decorate");
      // 画面は保存を待たずに動かす（usePlacedDecorations の update・useHouseFurnitureLayouts の save）。
      // 失敗したらDBから読み直して戻る
      const write = town
        ? furnitureActionsRef.current.save({
            furnitureId: id,
            rotationY: moving.rotationY ?? 0,
            x: candidate.position.x,
            z: candidate.position.z,
          })
        : actionsRef.current.update(id, { x: candidate.position.x, z: candidate.position.z });
      write.catch((e: unknown) => reportWriteFailure(e, "うごかせませんでした"));
    },
    [changeFurniture, reportWriteFailure, resyncScene],
  );

  const handleEvent = useCallback(
    (event: RpgHubEvent): boolean => {
      if (event.event === "editTap") {
        if (!editing) return true;
        const id = event.id && isEditableId(event.id) ? event.id : null;
        if (id) playSoundEffect("confirm");
        setSelectedId(id);
        setMessage(null);
        return true;
      }
      if (event.event === "editLift") {
        if (!editing) return true;
        playSoundEffect("menu");
        setSelectedId(null);
        setMessage(null);
        return true;
      }
      if (event.event === "editDrop") {
        if (!editing) {
          resyncScene();
          return true;
        }
        const point = { x: event.x, z: event.z };
        if (event.id) dropMoved(event.id, point);
        else dropNew(event.assetId, point);
        return true;
      }
      return false;
    },
    [dropMoved, dropNew, editing, resyncScene],
  );

  const start = useCallback(() => {
    void reloadOwnedAssets();
    setSelectedId(null);
    setMessage(null);
    setArea(getEditArea(latestRef.current.player));
  }, [reloadOwnedAssets]);

  const exit = useCallback(() => {
    playSoundEffect("cancel");
    // 編集中はキャラクターを消し、玄関に立っているものとして判定していた（getEditStandPoint）。
    // 元の場所に物を置いていたら、閉じ込められないよう玄関へ移す
    const latest = latestRef.current;
    const stand = getEditStandPoint(latest.player, latest.objects);
    if ("facingY" in stand && isBlocked(latest.player.x, latest.player.z, latest.objects)) {
      webViewRef.current?.sendIntent(createPlacePlayerIntent(stand.x, stand.z, stand.facingY));
    }
    setArea(null);
    setSelectedId(null);
    setMessage(null);
    setDrag(null);
  }, [webViewRef]);

  const resetView = useCallback(() => {
    playSoundEffect("cancel");
    webViewRef.current?.sendIntent(createResetEditViewIntent());
  }, [webViewRef]);

  const deselect = useCallback(() => {
    playSoundEffect("cancel");
    setSelectedId(null);
  }, []);

  const rotateSelected = useCallback(() => {
    if (!selected) return;
    const rotationY = rotateQuarterTurn(selected.rotationY ?? 0);
    if (isMovableFurnitureId(selected.id)) {
      // 家具は長方形のことがあり、回すと占めるマスが変わる。右奥のマスを軸にその場で回す
      // （今の中心を寄せ直すと、まわすたびに半マスずつずれていく）。
      // **置けない向きは飛ばして、次の向きを試す。** 壁ぎわでは正面が壁を向く向きに置けないので、
      // 飛ばさないとそこで止まって二度と回せなくなる
      const latest = latestRef.current;
      const stand = getEditStandPoint(latest.player, latest.objects);
      let next = selected.rotationY ?? 0;
      for (let step = 0; step < 3; step += 1) {
        next = rotateQuarterTurn(next);
        const center = getFurnitureRotationCenter(selected, next);
        if (!checkFurnitureChange(selected.id, center, next, latest.objects, stand).rejection) {
          changeFurniture(selected.id, center, next);
          return;
        }
      }
      playSoundEffect("cancel");
      setMessage("ここでは まわせません");
      return;
    }
    playSoundEffect("confirm");
    setMessage(null);
    // 町の飾りも装飾と同じく正方形のマスを占めるので、回しても置けるかは変わらない（Issue #509）
    const write = isTownDecorationId(selected.id)
      ? furnitureActionsRef.current.save({
          furnitureId: selected.id,
          rotationY,
          x: selected.position.x,
          z: selected.position.z,
        })
      : actionsRef.current.update(selected.id, { rotationY });
    write.catch((e: unknown) => reportWriteFailure(e, "まわせませんでした"));
  }, [changeFurniture, reportWriteFailure, selected]);

  const removeSelected = useCallback(() => {
    if (!selected) return;
    const id = selected.id;
    if (isDefaultObjectId(id)) {
      // クローゼットはしまえない（動かす・回すだけ）。ソファ・植木・町の飾りはしまうと持ち物に入る（Issue #506・#509）
      if (!isStorableDefaultObjectId(id)) return;
      setMessage(null);
      runExclusive(
        () =>
          furnitureActionsRef.current.store(id).then(() => {
            playSoundEffect("cancel");
            setSelectedId((current) => (current === id ? null : current));
            // しまった物が下の一覧に出るよう、持ち物を取り直す
            void reloadOwnedAssets();
          }),
        "しまえませんでした",
      );
      return;
    }
    setMessage(null);
    runExclusive(
      () =>
        actionsRef.current.remove(id).then(() => {
          playSoundEffect("cancel");
          setSelectedId((current) => (current === id ? null : current));
        }),
      "しまえませんでした",
    );
  }, [reloadOwnedAssets, runExclusive, selected]);

  /**
   * 画面上の指の位置を、3D表示の左上からの位置にする。
   * @param pageX - 画面の左端から
   * @param pageY - 画面の上端から
   * @returns 3D表示の中の位置
   */
  const toScene = (pageX: number, pageY: number) => ({
    x: pageX - sceneOriginRef.current.x,
    y: pageY - sceneOriginRef.current.y,
  });

  const onDragStart = useCallback(
    (assetId: string, pageX: number, pageY: number) => {
      if (!editing) return;
      const point = toScene(pageX, pageY);
      ghostPosition.setValue(point);
      setDrag({ assetId });
      setSelectedId(null);
      setMessage(null);
      webViewRef.current?.sendIntent(createEditDragIntent(assetId, "move", point.x, point.y));
    },
    // toScene は ref しか読まない
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [editing, ghostPosition, webViewRef],
  );

  // 指が動くたびに呼ばれるので、state は変えない（画面全体を描き直さない）
  const dragRef = useRef<DecorationDrag | null>(null);
  dragRef.current = drag;
  const onDragMove = useCallback(
    (pageX: number, pageY: number) => {
      const current = dragRef.current;
      if (!current) return;
      const point = toScene(pageX, pageY);
      ghostPosition.setValue(point);
      webViewRef.current?.sendIntent(createEditDragIntent(current.assetId, "move", point.x, point.y));
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [ghostPosition, webViewRef],
  );

  const onDragEnd = useCallback(
    (pageX: number, pageY: number) => {
      const current = dragRef.current;
      if (!current) return;
      setDrag(null);
      const point = toScene(pageX, pageY);
      // パネルの上で離したら、置くのをやめたことにする（3D表示の高さをまだ測れていなければ見ない）
      const sceneBottom = sceneOriginRef.current.y + sceneHeightRef.current;
      const overPanel = sceneHeightRef.current > 0 && panelHeight > 0 && pageY >= sceneBottom - panelHeight;
      webViewRef.current?.sendIntent(createEditDragIntent(current.assetId, overPanel ? "cancel" : "end", point.x, point.y));
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [panelHeight, webViewRef],
  );

  const onDragCancel = useCallback(() => {
    const current = dragRef.current;
    if (!current) return;
    setDrag(null);
    webViewRef.current?.sendIntent(createEditDragIntent(current.assetId, "cancel", 0, 0));
  }, [webViewRef]);

  const onSceneFrameChange = useCallback((frame: { height: number; x: number; y: number }) => {
    sceneOriginRef.current = { x: frame.x, y: frame.y };
    sceneHeightRef.current = frame.height;
  }, []);

  return {
    assetIds,
    availableCounts,
    busy,
    deselect,
    drag,
    editing,
    exit,
    ghostPosition,
    handleEvent,
    message,
    onDragCancel,
    onDragEnd,
    onDragMove,
    onDragStart,
    onPanelHeightChange: setPanelHeight,
    onSceneFrameChange,
    onTopOverlayBottomChange: setTopOverlayBottom,
    panelHeight,
    removeSelected,
    resetView,
    rotateSelected,
    selected,
    selectedInfo,
    start,
  };
}
