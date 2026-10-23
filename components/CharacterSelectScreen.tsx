import { router, Stack } from "expo-router";
import { useEffect, useMemo, useState } from "react";
import { ActivityIndicator, Pressable, ScrollView, Text, View, useWindowDimensions } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import Furigana from "./Furigana";
import ScreenHeader from "./ScreenHeader";
import { WardrobePreview, getWardrobePreviewHeight } from "./rpg-hub-web/WardrobePreview";
import { PREVIEW_DISABLED_NOTICE_FOR_CHILD } from "../constants/ui";
import { playSoundEffect } from "../lib/audio";
import { CHARACTER_TYPES, CHARACTER_TYPE_LABELS, type CharacterType } from "../lib/rpg-hub/characterTypes";
import { getPortraitKey, type PortraitLook } from "../lib/rpg-hub/portraitBridge";
import { useCharacterAppearance } from "../lib/useCharacterAppearance";
import { useCharacterPalette } from "../lib/useCharacterPalette";
import { useWardrobe } from "../lib/useWardrobe";
import { useAppearanceStore } from "../store/appearanceStore";
import { useCurrentUser, useDataAccess } from "../store";
import { useMapStore } from "../store/mapStore";
import { useWardrobeStore } from "../store/wardrobeStore";

/** プレビューの文言。更衣室向けの文言は「けってい」ボタンを前提にしているため差し替える */
const PREVIEW_MESSAGES = {
  label: "キャラクターのプレビュー",
  loadError: "プレビューを{表示|ひょうじ}できませんでした。キャラクターは、このまま えらべます。",
  lookError: "えらんだキャラクターを うつせませんでした。",
};

/**
 * キャラクター選択画面（Issue #287）。
 *
 * 種類（形）を選ぶとその場でDBへ保存する。見た目への反映はRPGハブ側
 * （`useCharacterAppearance` の結果）を見て行うため、この画面は保存だけを受け持つ。
 *
 * **色はここでは選ばない（Issue #381）。** 更衣室（`WardrobeScreen`）で、プレビューを
 * 見ながら装備と一緒に選ぶ。以前はこの画面でも選べたが、入口が2つあると保存の仕方
 * （この画面は押すとすぐ保存、更衣室は「けってい」で保存）が違って紛らわしいため、まとめた。
 *
 * **選んだキャラクターを3Dで見せる（Issue #446）。** 更衣室と同じプレビュー（`WardrobePreview`）に、
 * その人の色・装備を着せて映す。**映すのは、種類・色・装備がすべて読み込み済みの姿だけ。**
 * 色は種類ごとに保存しているので、押した種類の保存と色の読み込みが終わるまでは前の姿を
 * 映したままにし、1回で切り替える（元の色の姿を挟んでから自分の色へ変わると、ちらついて見えるため）。
 * 押したボタンは保存の完了を待たずに選択中として見せ、押したことが伝わるようにする。
 *
 * **町へ戻ったときは選び直した姿になる（Issue #483）。** 裏に残った町の画面も、
 * 種類が変わったらシーンを作り直す。準備が終わるまでは「いどうちゅう」を出す。
 */
export default function CharacterSelectScreen() {
  const { canUseRealData } = useDataAccess();
  const { isReady: isTypeReady, select: selectCharacterType } = useCharacterAppearance();
  const { isReady: isPaletteReady } = useCharacterPalette();
  const { isReady: isWardrobeReady } = useWardrobe();
  const characterType = useAppearanceStore((state) => state.characterType);
  const savedPalette = useAppearanceStore((state) => state.palette);
  const equipment = useWardrobeStore((state) => state.equipment);
  const season = useMapStore((state) => state.currentSeason);
  const userId = useCurrentUser()?.id ?? null;
  const { height: windowHeight } = useWindowDimensions();

  // 保存中は連打で二重に書き込まないようにする
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // 押して保存している最中の種類。ボタンは保存の完了を待たずにこちらを選択中として見せる
  const [pendingType, setPendingType] = useState<CharacterType | null>(null);
  // プレビューに映している姿と、それが誰の姿か。読み込みが終わった姿だけを入れる
  const [shownLook, setShownLook] = useState<{ look: PortraitLook; userId: string | null } | null>(null);

  const handleSelectType = async (nextType: CharacterType) => {
    if (!canUseRealData || saving || nextType === characterType) return;
    setSaving(true);
    setPendingType(nextType);
    setError(null);
    try {
      await selectCharacterType(nextType);
      playSoundEffect("confirm");
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "{保存|ほぞん}できませんでした");
    } finally {
      setSaving(false);
      setPendingType(null);
    }
  };

  // ボタンで選択中として見せる種類
  const selectedType = pendingType ?? characterType;

  // 種類・色・装備の読み込みが終わり、保存中でもないときの姿。途中の値（既定のカエル、
  // 何も着ていない姿、前の種類の色）は映さない（更衣室と同じ）
  const isLookSettled = isTypeReady && isPaletteReady && isWardrobeReady && pendingType === null;
  // 見た目が同じ間は同じオブジェクトを使う。変わるたびに作り直すと、WebView へ同じ姿を
  // 送り直してキャラクターを作り直してしまう（更衣室と同じ）
  const lookKey = isLookSettled
    ? getPortraitKey({ characterType, equipment, palette: savedPalette, season })
    : null;
  const settledLook = useMemo<PortraitLook | null>(
    () => (lookKey ? { characterType, equipment, palette: savedPalette, season } : null),
    // lookKey が同じなら中身も同じ（getPortraitKey の約束）
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [lookKey],
  );
  // 読み込みが終わった姿だけを覚えて映す。読み込み中は前の姿を映したままにする
  // （プレビューを消すと WebView を作り直すことになり、押すたびに読み込み中に戻ってしまう）
  useEffect(() => {
    if (settledLook) setShownLook({ look: settledLook, userId });
  }, [settledLook, userId]);
  // 利用者が変わったら、前の人の姿は映さない
  const previewLook = shownLook?.userId === userId ? shownLook.look : null;
  const previewHeight = getWardrobePreviewHeight(windowHeight);

  return (
    <SafeAreaView className="flex-1 bg-slate-50" edges={["top", "bottom"]}>
      {/* プレビューを右へドラッグして回したときに前の画面へ戻らないよう、戻るスワイプは画面の左端からだけにする
          （iOS 26 以降は画面のどこからでも戻れるのが既定。更衣室と同じ。Issue #388） */}
      <Stack.Screen options={{ fullScreenGestureEnabled: false, headerShown: false }} />
      <ScreenHeader title="キャラクターをえらぶ" />

      <View className="px-4 pb-3">
        {previewLook ? (
          <WardrobePreview height={previewHeight} look={previewLook} messages={PREVIEW_MESSAGES} />
        ) : (
          <View
            className="items-center justify-center rounded-2xl bg-sky-100"
            style={{ height: previewHeight }}
          >
            <ActivityIndicator />
          </View>
        )}
      </View>

      <ScrollView className="flex-1" contentContainerClassName="px-4 pb-8">
        {!canUseRealData && (
          <Furigana className="mb-4 text-xs text-slate-500">{PREVIEW_DISABLED_NOTICE_FOR_CHILD}</Furigana>
        )}
        {error && (
          <View className="mb-4 rounded-2xl bg-red-50 px-4 py-3">
            <Furigana className="font-bold text-red-700">{"{保存|ほぞん}できませんでした"}</Furigana>
            <Furigana className="mt-1 text-xs text-red-600">{error}</Furigana>
          </View>
        )}

        <Furigana className="mb-3 text-xs text-slate-500">
          {"{我|わ}が{家|や}タウンにもどると、{選|えら}んだキャラクターになります。"}
        </Furigana>

        <View className="flex-row flex-wrap gap-2">
          {CHARACTER_TYPES.map((type) => {
            const isSelected = selectedType === type;
            const label = CHARACTER_TYPE_LABELS[type];

            return (
              <Pressable
                accessibilityLabel={`キャラクターを${label}にする`}
                accessibilityRole="button"
                accessibilityState={{
                  // disabled と同じ条件にする。ずれていると、支援技術が
                  // 「押せる」と読み上げるのに押しても何も起きない
                  disabled: !canUseRealData || saving,
                  selected: isSelected,
                }}
                className={`rounded-2xl border-2 px-5 py-3 ${
                  isSelected ? "border-emerald-600 bg-emerald-50" : "border-slate-200 bg-white"
                } ${canUseRealData ? "active:bg-slate-100" : "opacity-50"}`}
                disabled={!canUseRealData || saving}
                key={type}
                onPress={() => handleSelectType(type)}
              >
                <Text
                  className={`text-base font-bold ${
                    isSelected ? "text-emerald-700" : "text-slate-700"
                  }`}
                >
                  {label}
                </Text>
              </Pressable>
            );
          })}
        </View>

        <Pressable
          accessibilityLabel="きがえ（更衣室）で色を選ぶ"
          accessibilityRole="link"
          className="mt-8 min-h-11 justify-center rounded-xl px-3 py-3 active:bg-emerald-50"
          onPress={() => {
            playSoundEffect("confirm");
            router.push("/wardrobe");
          }}
        >
          <Furigana className="text-sm font-bold text-emerald-700 underline">
            {"{色|いろ}は、きがえ（{更衣室|こういしつ}）で{選|えら}べます。"}
          </Furigana>
        </Pressable>
      </ScrollView>
    </SafeAreaView>
  );
}
