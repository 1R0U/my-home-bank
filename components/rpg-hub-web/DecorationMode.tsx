import { Pressable, ScrollView, Text, View } from "react-native";
import { getAssetLabel } from "../../lib/rpg-hub/catalog";
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
  const canPlaceMore = props.placedCount < MAX_PLACED_DECORATIONS;

  return (
    <View className="absolute bottom-0 left-0 right-0 bg-white/95 px-4 pb-6 pt-3">
      <View className="mb-2 flex-row items-center justify-between">
        <Text className="text-base font-bold text-slate-900">かざる</Text>
        <Text className="text-xs text-slate-500">
          {props.placedCount} / {MAX_PLACED_DECORATIONS} こ
        </Text>
      </View>

      {props.message && (
        <Text className="mb-2 text-sm font-bold text-red-600">{props.message}</Text>
      )}

      <ScrollView
        className="mb-3"
        contentContainerClassName="gap-2 pr-2"
        horizontal
        showsHorizontalScrollIndicator={false}
      >
        {props.assetIds.map((assetId) => {
          const isSelected = assetId === props.selectedAssetId;

          return (
            <Pressable
              accessibilityLabel={`${getAssetLabel(assetId) ?? assetId}をえらぶ`}
              accessibilityRole="button"
              accessibilityState={{ selected: isSelected }}
              className={`rounded-2xl border-2 px-4 py-2 ${
                isSelected ? "border-emerald-600 bg-emerald-50" : "border-slate-200 bg-white"
              }`}
              key={assetId}
              onPress={() => props.onSelect(assetId)}
            >
              <Text
                className={`text-sm font-bold ${
                  isSelected ? "text-emerald-700" : "text-slate-700"
                }`}
              >
                {getAssetLabel(assetId) ?? assetId}
              </Text>
            </Pressable>
          );
        })}
      </ScrollView>

      <View className="flex-row gap-2">
        <Pressable
          accessibilityLabel="ここにおく"
          accessibilityRole="button"
          accessibilityState={{ disabled: !canPlaceMore }}
          className={`flex-1 items-center rounded-full py-3 ${
            canPlaceMore ? "bg-emerald-600 active:bg-emerald-700" : "bg-slate-300"
          }`}
          disabled={!canPlaceMore}
          onPress={props.onPlace}
        >
          <Text className="text-base font-bold text-white">ここにおく</Text>
        </Pressable>
        {props.nearbyPlacedId && (
          <Pressable
            accessibilityLabel="ちかくのかざりをしまう"
            accessibilityRole="button"
            className="items-center rounded-full bg-amber-500 px-6 py-3 active:bg-amber-600"
            onPress={props.onRemove}
          >
            <Text className="text-base font-bold text-white">しまう</Text>
          </Pressable>
        )}
        <Pressable
          accessibilityLabel="かざるのをやめる"
          accessibilityRole="button"
          className="items-center rounded-full bg-slate-200 px-6 py-3 active:bg-slate-300"
          onPress={props.onExit}
        >
          <Text className="text-base font-bold text-slate-700">やめる</Text>
        </Pressable>
      </View>

      <Text className="mt-2 text-xs text-slate-500">
        あるいて ばしょを きめてから「ここにおく」を おしてね
      </Text>
    </View>
  );
}
