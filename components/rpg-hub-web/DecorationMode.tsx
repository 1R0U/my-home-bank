import { Pressable, ScrollView, Text, View } from "react-native";
import { getAssetLabel } from "../../lib/rpg-hub/catalog";
import { getDecorationIconKind } from "../../lib/rpg-hub/decorationIcon";
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
        <Text style={styles.signText}>かざる</Text>
      </View>
      <Text style={styles.count}>
        {props.placedCount} / {MAX_PLACED_DECORATIONS} こ
      </Text>

      {props.message && <Text style={styles.message}>{props.message}</Text>}

      <ScrollView
        contentContainerStyle={styles.shelfContent}
        horizontal
        showsHorizontalScrollIndicator={false}
        style={styles.shelf}
      >
        {props.assetIds.map((assetId) => {
          const isSelected = assetId === props.selectedAssetId;
          const label = getAssetLabel(assetId) ?? assetId;
          const iconKind = getDecorationIconKind(assetId);

          return (
            <Pressable
              accessibilityLabel={`${label}をえらぶ`}
              accessibilityRole="button"
              accessibilityState={{ selected: isSelected }}
              key={assetId}
              onPress={() => props.onSelect(assetId)}
              style={styles.slot}
            >
              <View style={[styles.slotPicture, isSelected && styles.slotPictureSelected]}>
                {iconKind && <DecorationIcon kind={iconKind} />}
              </View>
              <Text numberOfLines={2} style={styles.slotLabel}>
                {label}
              </Text>
            </Pressable>
          );
        })}
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
