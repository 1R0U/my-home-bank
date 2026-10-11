import { useMemo, useState } from "react";
import { Pressable, ScrollView, Text, View } from "react-native";
import { getAssetLabel } from "../../lib/rpg-hub/catalog";
import { type DecorationIconKind, groupDecorations } from "../../lib/rpg-hub/decorationMenu";
import DecorationIcon from "./DecorationIcon";
import { decorationStyles as styles } from "./decorationStyles";
import { MAX_PLACED_DECORATIONS } from "../../lib/rpg-hub/placement";

type DecorationModeProps = {
  /** 置ける装飾のアセットID（カタログの順） */
  assetIds: readonly string[];
  /** 置けなかったときの理由。無ければ null */
  message: string | null;
  /** 近くにある、置いた装飾のid。無ければ null */
  nearbyPlacedId: string | null;
  onExit: () => void;
  onPlace: () => void;
  onRemove: () => void;
  onSelect: (assetId: string) => void;
  /** すでに置いてある数 */
  placedCount: number;
  /** 置く・しまうの処理中か */
  placing: boolean;
  selectedAssetId: string;
};

/**
 * 装飾を置く・しまうための操作パネル（Issue #224）。
 *
 * **置く場所はタップで指定せず、プレイヤーの正面に置く。** 歩いて位置を決める形に
 * したので、画面全体に張った仮想パッドと取り合いにならない。このパネルは画面の下側
 * だけを占め、上半分のドラッグはこれまでどおり移動に使える。
 * @param props - 表示内容と操作
 * @returns 操作パネル
 */
export default function DecorationMode(props: DecorationModeProps) {
  // 処理中は押せなくする。押せてしまうと、同じ場所に重なった装飾ができたり、
  // 上限を1つ超えたりする（数はDB側では数えていない）
  const canPlaceMore = props.placedCount < MAX_PLACED_DECORATIONS && !props.placing;

  // 1段目は種類（き・しげみ…）、2段目はその種類の中のどれにするか。
  // 開いている種類が無ければ1段目を出す
  const groups = useMemo(() => groupDecorations(props.assetIds), [props.assetIds]);
  const [openKind, setOpenKind] = useState<DecorationIconKind | null>(null);
  const openGroup = groups.find((group) => group.kind === openKind) ?? null;

  /**
   * 種類を開く。選んでいるものがその種類に無ければ、最初の1つを選んでおく。
   * 開いただけで何も選ばれていないと、「ここに おく」で前の種類のものが置かれてしまう。
   * @param kind - 開く種類
   */
  const openGroupOf = (kind: DecorationIconKind) => {
    const group = groups.find((candidate) => candidate.kind === kind);
    if (!group) return;
    setOpenKind(kind);
    if (!group.assetIds.includes(props.selectedAssetId)) props.onSelect(group.assetIds[0]);
  };

  return (
    // 板の上をなぞった指を、下の仮想パッドに拾わせない。拾わせると、スティックの輪が
    // パネルの上に重なって出る（Issue #370）。触り始めを板が受け取り、動かしても
    // 仮想パッドへ渡さない（渡すかどうかは onResponderTerminationRequest で決まる）
    <View
      onResponderTerminationRequest={() => false}
      onStartShouldSetResponder={() => true}
      style={styles.box}
    >
      <View style={styles.sign}>
        <Text style={styles.signText}>{openGroup ? `かざる ▸ ${openGroup.label}` : "かざる"}</Text>
      </View>
      <Text style={styles.count}>
        {props.placedCount} / {MAX_PLACED_DECORATIONS} こ
      </Text>

      {props.message && <Text style={styles.message}>{props.message}</Text>}

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
              accessibilityLabel="しゅるいの いちらんに もどる"
              accessibilityRole="button"
              onPress={() => setOpenKind(null)}
              style={styles.slot}
            >
              <View style={[styles.slotPicture, styles.backPicture]}>
                <Text style={styles.backArrow}>‹</Text>
              </View>
              <Text style={styles.slotLabel}>もどる</Text>
            </Pressable>
            {openGroup.assetIds.map((assetId) => (
              <DecorationSlot
                accessibilityLabel={`${labelOf(assetId)}をえらぶ`}
                assetId={assetId}
                key={assetId}
                label={labelOf(assetId)}
                onPress={() => props.onSelect(assetId)}
                selected={assetId === props.selectedAssetId}
              />
            ))}
          </>
        ) : (
          groups.map((group) => {
            const containsSelected = group.assetIds.includes(props.selectedAssetId);
            // 1つしかない種類は、開かずにそのまま選ぶ。名前もその装飾の名前を出す
            if (group.assetIds.length === 1) {
              const [assetId] = group.assetIds;
              return (
                <DecorationSlot
                  accessibilityLabel={`${labelOf(assetId)}をえらぶ`}
                  assetId={assetId}
                  key={group.kind}
                  label={labelOf(assetId)}
                  onPress={() => props.onSelect(assetId)}
                  selected={containsSelected}
                />
              );
            }
            return (
              <DecorationSlot
                accessibilityLabel={`${group.label}を ひらく`}
                // 選んでいるものがこの種類に入っていれば、その絵を出す。何を選んだかが1段目でも分かる
                assetId={containsSelected ? props.selectedAssetId : group.assetIds[0]}
                count={group.assetIds.length}
                key={group.kind}
                label={group.label}
                onPress={() => openGroupOf(group.kind)}
                selected={containsSelected}
              />
            );
          })
        )}
      </ScrollView>

      <View style={styles.actions}>
        <Pressable
          accessibilityLabel="ここにおく"
          accessibilityRole="button"
          accessibilityState={{ disabled: !canPlaceMore }}
          disabled={!canPlaceMore}
          onPress={props.onPlace}
          style={({ pressed }) => [
            styles.placeButton,
            !canPlaceMore && styles.placeButtonDisabled,
            pressed && styles.placeButtonPressed,
          ]}
        >
          <Text style={styles.placeButtonText}>ここに おく</Text>
        </Pressable>
        {props.nearbyPlacedId && (
          <Pressable
            accessibilityLabel="ちかくのかざりをしまう"
            accessibilityRole="button"
            onPress={props.onRemove}
            style={({ pressed }) => [styles.subButton, styles.removeButton, pressed && styles.subButtonPressed]}
          >
            <Text style={styles.subButtonText}>しまう</Text>
          </Pressable>
        )}
        <Pressable
          accessibilityLabel="かざるのをやめる"
          accessibilityRole="button"
          onPress={props.onExit}
          style={({ pressed }) => [styles.subButton, pressed && styles.subButtonPressed]}
        >
          <Text style={styles.subButtonText}>やめる</Text>
        </Pressable>
      </View>

      <Text style={styles.hint}>あるいて ばしょを きめてから「ここに おく」を おしてね</Text>
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

type DecorationSlotProps = {
  accessibilityLabel: string;
  /** 絵に使う装飾 */
  assetId: string;
  /** 中に入っている数。種類のまとまりのときだけ出す */
  count?: number;
  label: string;
  onPress: () => void;
  selected: boolean;
};

/**
 * 棚に並ぶ1つぶん（絵と名前）。
 * @param props - 出す内容と押したときの処理
 * @returns 棚の1つぶん
 */
function DecorationSlot(props: DecorationSlotProps) {
  return (
    <Pressable
      accessibilityLabel={props.accessibilityLabel}
      accessibilityRole="button"
      accessibilityState={{ selected: props.selected }}
      onPress={props.onPress}
      style={styles.slot}
    >
      <View style={[styles.slotPicture, props.selected && styles.slotPictureSelected]}>
        <DecorationIcon assetId={props.assetId} />
        {props.count !== undefined && (
          <View style={styles.countBadge}>
            <Text style={styles.countBadgeText}>{props.count}</Text>
          </View>
        )}
      </View>
      <Text numberOfLines={2} style={styles.slotLabel}>
        {props.label}
      </Text>
    </Pressable>
  );
}
