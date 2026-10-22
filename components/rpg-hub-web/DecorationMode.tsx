import { type ReactNode, useMemo, useRef, useState } from "react";
import { type LayoutChangeEvent, PanResponder, Pressable, ScrollView, Text, View } from "react-native";
import { getAssetLabel } from "../../lib/rpg-hub/catalog";
import { type DecorationIconKind, groupDecorations } from "../../lib/rpg-hub/decorationMenu";
import DecorationIcon from "./DecorationIcon";
import { decorationStyles as styles, PANEL_BOTTOM_GAP } from "./decorationStyles";
import { MAX_PLACED_DECORATIONS } from "../../lib/rpg-hub/placement";

/** 一覧から装飾を上へ引っぱる操作。座標はどれも画面の左上から。 */
export type DecorationDragHandlers = {
  onDragCancel: () => void;
  onDragEnd: (pageX: number, pageY: number) => void;
  onDragMove: (pageX: number, pageY: number) => void;
  onDragStart: (assetId: string, pageX: number, pageY: number) => void;
};

type DecorationModeProps = DecorationDragHandlers & {
  /** 置ける装飾のアセットID（カタログの順） */
  assetIds: readonly string[];
  /** 装飾ごとの、まだ置いていない所有数 */
  availableCounts: Readonly<Record<string, number>>;
  /** 置く・しまうの処理中か */
  busy: boolean;
  /** 置けなかったときの理由。無ければ null */
  message: string | null;
  /**
   * パネルが画面の下からどれだけの高さを隠しているか（下の余白も含む）が変わったときに呼ぶ。
   * 画面はこれを使って、3Dの部屋がパネルに隠れないようカメラの映す範囲を決める。
   */
  onCoveredHeightChange?: (height: number) => void;
  /** 選んでいる装飾の選択を外す */
  onDeselect: () => void;
  /** 編集モードを終える */
  onExit: () => void;
  onRemove: () => void;
  /** 指で変えたズームと移動をやめ、範囲全体が見える見え方へ戻す */
  onResetView: () => void;
  onRotate: () => void;
  /** すでに置いてある数 */
  placedCount: number;
  /**
   * タップして選んでいる物の名前と、しまえるか。選んでいなければ null。
   * 家の中の家具はしまえない（動かす・回すだけ。Issue #477）ので「しまう」を出さない
   */
  selected: { canRemove: boolean; label: string } | null;
};

/**
 * かざるの編集モードの操作パネル（Issue #477）。
 *
 * - 何も選んでいないとき: 持っている装飾の一覧。絵を**上へ引っぱって**部屋のマスへ置く
 * - 置いた装飾をタップして選んだとき: 「まわす」「しまう」「やめる」
 *
 * 置いた装飾の長押しで持ち上げて動かす操作は3D側（webview/rpg-hub/decorationEditor.ts）が受け持つ。
 * **パネルの高さは中身を切り替えても変えない。** 変わると、部屋を収め直すためにカメラが動くため。
 * @param props - 表示内容と操作
 * @returns 操作パネル
 */
export default function DecorationMode(props: DecorationModeProps) {
  // 1段目は種類（き・しげみ…）、2段目はその種類の中のどれにするか。
  // 開いている種類が無ければ1段目を出す
  const groups = useMemo(() => groupDecorations(props.assetIds), [props.assetIds]);
  const [openKind, setOpenKind] = useState<DecorationIconKind | null>(null);
  const openGroup = groups.find((group) => group.kind === openKind) ?? null;
  // 絵をタップしただけのときに出す案内（引っぱると置けることを知らせる）
  const [tapHint, setTapHint] = useState(false);
  const atLimit = props.placedCount >= MAX_PLACED_DECORATIONS;
  const selecting = props.selected !== null;

  const signText = props.selected
    ? `かざる ▸ ${props.selected.label}`
    : openGroup
      ? `かざる ▸ ${openGroup.label}`
      : "かざる";

  /**
   * 1つぶんの装飾の欄。上へ引っぱれる。
   * @param assetId - 装飾
   * @returns 欄
   */
  const itemSlot = (assetId: string) => {
    const available = props.availableCounts[assetId] ?? 0;
    const placeable = available > 0 && !atLimit;
    return (
      <DecorationSlot
        accessibilityHint="うえに ひっぱると、へやに おけます"
        accessibilityLabel={`${labelOf(assetId)}　あと${available}こ`}
        assetId={assetId}
        badge={available}
        disabled={!placeable}
        drag={{ assetId, enabled: placeable && !props.busy, handlers: props }}
        key={assetId}
        label={labelOf(assetId)}
        onPress={() => setTapHint(true)}
      />
    );
  };

  let hint: string;
  if (selecting) hint = "「まわす」で むきを かえられるよ";
  else if (props.assetIds.length === 0) hint = "ストアの「かざり」の棚で買うと使えるよ";
  else if (tapHint) hint = "えを うえに ひっぱって おいてね";
  else hint = "えを ひっぱって おく・ながおしで うごかす・2ほんゆびで おおきく";

  return (
    <View
      onLayout={(event: LayoutChangeEvent) => {
        // 下の余白（styles.dock.bottom）の分も隠れている扱いにする
        props.onCoveredHeightChange?.(event.nativeEvent.layout.height + PANEL_BOTTOM_GAP);
      }}
      pointerEvents="box-none"
      style={styles.dock}
      testID="decoration-panel"
    >
      {/*
        パネルのすぐ上の1行。置けなかった理由と「もとに もどす」を出す。
        **高さを決めてあるので、文言が出ても消えてもパネル全体の高さは変わらない**（変わるとカメラが動く）
      */}
      <View pointerEvents="box-none" style={styles.floatRow}>
        <View pointerEvents="none" style={styles.messageSlot}>
          {props.message && <Text style={styles.message}>{props.message}</Text>}
        </View>
        {/* ズーム・移動しすぎたときに、自分で全体の見え方へ戻せるようにする */}
        <Pressable
          accessibilityLabel="みえかたをもとにもどす"
          accessibilityRole="button"
          onPress={props.onResetView}
          style={({ pressed }) => [styles.resetViewButton, pressed && styles.resetViewButtonPressed]}
        >
          <Text style={styles.resetViewText}>もとに もどす</Text>
        </Pressable>
      </View>
      <View style={styles.box}>
        <View style={styles.sign}>
          <Text numberOfLines={1} style={styles.signText}>
            {signText}
          </Text>
        </View>
        <Text style={styles.count}>
          {props.placedCount} / {MAX_PLACED_DECORATIONS} こ
        </Text>

        <View style={styles.content}>
          {selecting ? (
            <View style={styles.actions}>
              <ActionButton accessibilityLabel="むきをまわす" label="まわす" onPress={props.onRotate} primary />
              {props.selected?.canRemove && (
                <ActionButton
                  accessibilityLabel="えらんだかざりをしまう"
                  disabled={props.busy}
                  label="しまう"
                  onPress={props.onRemove}
                />
              )}
              <ActionButton accessibilityLabel="えらぶのをやめる" label="やめる" onPress={props.onDeselect} />
            </View>
          ) : (
            <ScrollView
              contentContainerStyle={styles.shelfContent}
              horizontal
              // 段を切り替えたら左端から見せる。前の段のスクロール位置を持ち越さない
              key={openGroup?.kind ?? "groups"}
              showsHorizontalScrollIndicator={false}
              style={styles.shelf}
            >
              {openGroup ? (
                <>
                  <Pressable
                    accessibilityLabel="しゅるいのいちらんにもどる"
                    accessibilityRole="button"
                    onPress={() => setOpenKind(null)}
                    style={styles.slot}
                  >
                    <View style={[styles.slotPicture, styles.backPicture]}>
                      <Text style={styles.backArrow}>‹</Text>
                    </View>
                    <Text style={styles.slotLabel}>もどる</Text>
                  </Pressable>
                  {openGroup.assetIds.map(itemSlot)}
                </>
              ) : (
                groups.map((group) =>
                  // 1つしかない種類は、開かずにそのまま引っぱれるようにする
                  group.assetIds.length === 1 ? (
                    itemSlot(group.assetIds[0])
                  ) : (
                    <DecorationSlot
                      accessibilityLabel={`${group.label}をひらく`}
                      assetId={group.assetIds[0]}
                      count={group.assetIds.length}
                      drag={null}
                      key={group.kind}
                      label={group.label}
                      onPress={() => setOpenKind(group.kind)}
                    />
                  ),
                )
              )}
            </ScrollView>
          )}
        </View>

        <View style={styles.footer}>
          <Text numberOfLines={2} style={styles.footerHint}>
            {hint}
          </Text>
          <Pressable
            accessibilityLabel="かざるのをおわる"
            accessibilityRole="button"
            onPress={props.onExit}
            style={({ pressed }) => [styles.subButton, styles.exitButton, pressed && styles.subButtonPressed]}
          >
            <Text style={styles.subButtonText}>おわる</Text>
          </Pressable>
        </View>
      </View>
    </View>
  );
}

/**
 * 装飾の名前。カタログに名前が無ければアセットIDをそのまま出す。
 * @param assetId - 装飾のアセットID
 * @returns 名前
 */
function labelOf(assetId: string): string {
  return getAssetLabel(assetId) ?? assetId;
}

type ActionButtonProps = {
  accessibilityLabel: string;
  disabled?: boolean;
  label: string;
  onPress: () => void;
  /** 目立たせる（いちばんよく使うボタン） */
  primary?: boolean;
};

/**
 * 選んだ装飾に対する操作のボタン。
 * @param props - 文言と押したときの処理
 * @returns ボタン
 */
function ActionButton(props: ActionButtonProps) {
  return (
    <Pressable
      accessibilityLabel={props.accessibilityLabel}
      accessibilityRole="button"
      accessibilityState={{ disabled: !!props.disabled }}
      disabled={props.disabled}
      onPress={props.onPress}
      style={({ pressed }) => [
        props.primary ? styles.placeButton : [styles.subButton, styles.actionButton],
        props.disabled && styles.placeButtonDisabled,
        pressed && (props.primary ? styles.placeButtonPressed : styles.subButtonPressed),
      ]}
    >
      <Text style={props.primary ? styles.placeButtonText : styles.subButtonText}>{props.label}</Text>
    </Pressable>
  );
}

/** 1つぶんの装飾の欄を上へ引っぱる操作。`enabled` が false の間は引っぱれない */
type SlotDrag = {
  assetId: string;
  enabled: boolean;
  handlers: DecorationDragHandlers;
};

type DecorationSlotProps = {
  accessibilityHint?: string;
  accessibilityLabel: string;
  /** 絵に使う装飾 */
  assetId: string;
  /** 残りの数。1つぶんの装飾のときだけ出す */
  badge?: number;
  /** 中に入っている数。種類のまとまりのときだけ出す */
  count?: number;
  /** 置き切った・上限に達したなど、いまは置けない。薄く出し、押せなくする */
  disabled?: boolean;
  /** 上へ引っぱって置ける欄なら、引っぱる装飾と操作。種類のまとまりの欄は null */
  drag: SlotDrag | null;
  label: string;
  onPress: () => void;
};

/**
 * 棚に並ぶ1つぶん（絵と名前）。`drag` があれば、上へ引っぱって部屋へ持っていける。
 * **引っぱれるかどうかで部品の組み立てを変えない。** 引っぱっている途中に置ける数が変わって
 * 組み立てが変わると、指を追っている部品が作り直されて、離したことが伝わらなくなる。
 * @param props - 出す内容と押したときの処理
 * @returns 棚の1つぶん
 */
function DecorationSlot(props: DecorationSlotProps) {
  const content = (
    <Pressable
      accessibilityHint={props.accessibilityHint}
      accessibilityLabel={props.accessibilityLabel}
      accessibilityRole="button"
      accessibilityState={{ disabled: !!props.disabled }}
      disabled={props.disabled}
      onPress={props.onPress}
      style={[styles.slot, props.disabled && styles.slotDimmed]}
    >
      <View style={styles.slotPicture}>
        <DecorationIcon assetId={props.assetId} />
        {props.count !== undefined && (
          <View style={styles.countBadge}>
            <Text style={styles.countBadgeText}>{props.count}</Text>
          </View>
        )}
        {props.badge !== undefined && (
          <View style={styles.countBadge}>
            <Text style={styles.countBadgeText}>{props.badge}</Text>
          </View>
        )}
      </View>
      <Text numberOfLines={2} style={styles.slotLabel}>
        {props.label}
      </Text>
    </Pressable>
  );
  return props.drag ? <DragSource drag={props.drag}>{content}</DragSource> : content;
}

/**
 * 子を上へ引っぱれるようにする。横へのなぞりは棚のスクロールに残し、
 * **上向きに動かしたときだけ**引っぱる操作として受け取る。
 * @param props - 引っぱる装飾と操作、包む子
 * @returns 引っぱれる子
 */
function DragSource(props: { children: ReactNode; drag: SlotDrag }) {
  // PanResponder は作り直さないので、最新の値は ref で読む
  const dragRef = useRef(props.drag);
  dragRef.current = props.drag;
  const responder = useMemo(
    () =>
      PanResponder.create({
        // 子の Pressable より先に取れるよう、捕まえる段階で判定する。上向きにはっきり動いたときだけ
        onMoveShouldSetPanResponderCapture: (_, gesture) =>
          dragRef.current.enabled && gesture.dy < -8 && Math.abs(gesture.dy) > Math.abs(gesture.dx),
        onPanResponderGrant: (_, gesture) =>
          dragRef.current.handlers.onDragStart(dragRef.current.assetId, gesture.moveX, gesture.moveY),
        onPanResponderMove: (_, gesture) => dragRef.current.handlers.onDragMove(gesture.moveX, gesture.moveY),
        onPanResponderRelease: (_, gesture) => dragRef.current.handlers.onDragEnd(gesture.moveX, gesture.moveY),
        onPanResponderTerminate: () => dragRef.current.handlers.onDragCancel(),
        // 引っぱっている途中で棚のスクロールに取られないようにする
        onPanResponderTerminationRequest: () => false,
      }),
    [],
  );
  return (
    // a11y-allow: panHandlers だけを渡しており、ラベルは含まない（ラベルは中の Pressable が持つ）
    <View {...responder.panHandlers}>{props.children}</View>
  );
}
