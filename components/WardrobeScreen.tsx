import { Ionicons } from "@expo/vector-icons";
import { Stack, useNavigation } from "expo-router";
import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import {
  ActivityIndicator,
  Alert,
  Pressable,
  ScrollView,
  Text,
  View,
  useWindowDimensions,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import ScreenHeader from "./ScreenHeader";
import { WardrobePreview } from "./rpg-hub-web/WardrobePreview";
import { ACTIVE_ICON_COLOR, MUTED_ICON_COLOR, PREVIEW_DISABLED_NOTICE } from "../constants/ui";
import { getAssetLabel, getWearableSlot } from "../lib/rpg-hub/catalog";
import { getDefaultPaletteColor } from "../lib/rpg-hub/characterTypes";
import {
  EDITABLE_PALETTE_SLOTS,
  PALETTE_COLOR_OPTIONS,
  PALETTE_SLOT_LABELS,
} from "../lib/rpg-hub/palette";
import { getPortraitKey, type PortraitLook } from "../lib/rpg-hub/portraitBridge";
import {
  applyEquipmentDraft,
  applyPaletteDraft,
  getEquipmentChanges,
  getPaletteChanges,
  type EquipmentDraft,
  type PaletteDraft,
} from "../lib/rpg-hub/wardrobe";
import { useCharacterAppearance } from "../lib/useCharacterAppearance";
import { useCharacterPalette } from "../lib/useCharacterPalette";
import { useWardrobe } from "../lib/useWardrobe";
import { useCurrentUser, useDataAccess } from "../store";
import { useAppearanceStore } from "../store/appearanceStore";
import { useMapStore } from "../store/mapStore";
import { useWardrobeStore } from "../store/wardrobeStore";
import {
  EQUIPMENT_SLOTS,
  EQUIPMENT_SLOT_LABELS,
  type AssetId,
  type EquipmentSlot,
  type PaletteSlot,
} from "../types/map";

/**
 * 枠ごとのアイコン（Issue #235）。
 * 参考にした着せ替えアプリの「カテゴリをアイコン付きの一覧で見せる」レイアウトに
 * 合わせるためのもので、意味の対応は目安（例: せなかに今あるものはまだ無い）。
 */
const EQUIPMENT_SLOT_ICONS: Record<EquipmentSlot, string> = {
  back: "shirt-outline",
  face: "glasses-outline",
  head: "school-outline",
};

/** 「もとのいろ」の表示名（子供が読むので漢字を使わない）。 */
const DEFAULT_COLOR_LABEL = "もとのいろ";

/**
 * 開いている選択肢。装備の枠と色の枠を同じ画面に並べ、一度に1つだけ開く（Issue #381）。
 * 枠の名前どうしは重ならないが、どちらの枠かを取り違えないよう種類も持たせる。
 */
type OpenSection = { kind: "equipment"; slot: EquipmentSlot } | { kind: "palette"; slot: PaletteSlot };

/** プレビューの高さ（画面の高さに対する割合）。選択肢の一覧が隠れすぎない程度にする */
const PREVIEW_HEIGHT_RATIO = 0.38;
/** プレビューの高さの下限。小さい端末でも指で回せる大きさを残す */
const MIN_PREVIEW_HEIGHT = 220;
/** プレビューの高さの上限。大きい端末で選択肢の一覧を押し出しすぎない */
const MAX_PREVIEW_HEIGHT = 380;

/**
 * 着せ替え画面（Issue #222 / #235 / #344 / #381）。
 *
 * 上にキャラクターのプレビュー、下に枠（カテゴリ）の一覧を並べる。枠はアイコン付きで、
 * タップした枠だけ選択肢（なし＋持っているもの）を展開する。
 * 装備の枠の下に、色の枠（からだのいろ・さしいろ）も並べる（Issue #381）。色の選択肢は
 * 「もとのいろ」（そのキャラクターの元の色）＋決めた候補（`PALETTE_COLOR_OPTIONS`）。
 *
 * **選んだだけでは保存しない（Issue #344）。** 選んだもの・色はプレビューのキャラクターに
 * 着せて見せるだけで、「けってい」を押したときに変わった枠をまとめて保存する。
 * いろいろ試してから決められるようにするため。
 *   - 何も変えていない（変えてから元に戻した場合も含む）ときは「けってい」を押せない
 *   - 確定せずに画面を離れようとしたら、変更を捨ててよいかを確かめる
 * 保存した装備・色のRPGハブへの反映は、RPGハブ側が `useWardrobe` / `useCharacterPalette`
 * の結果を見て行う。
 *
 * **どうぶつ（キャラクターの姿そのもの）はここでは扱わない。** 別の仕組み
 * （`character_appearances` / `CharacterSelectScreen.tsx`）で選ぶため、着せ替え品とは別軸。
 * プレビューには今の種類で出す。
 */
export default function WardrobeScreen() {
  const { canUseRealData } = useDataAccess();
  const userId = useCurrentUser()?.id ?? null;
  const navigation = useNavigation();
  const { height: windowHeight } = useWindowDimensions();
  const { isReady: isWardrobeReady, saveEquipment } = useWardrobe();
  const { isReady: isTypeReady } = useCharacterAppearance();
  const { isReady: isPaletteReady, save: savePalette } = useCharacterPalette();
  const savedEquipment = useWardrobeStore((state) => state.equipment);
  const ownedAssetIds = useWardrobeStore((state) => state.ownedAssetIds);
  const characterType = useAppearanceStore((state) => state.characterType);
  const savedPalette = useAppearanceStore((state) => state.palette);
  const season = useMapStore((state) => state.currentSeason);

  // 選び直したが、まだ保存していない枠だけを持つ。見せるときは保存済みの装備に重ねる
  // （触っていない枠は、保存済みの装備が読み直しで変わればそれに従う）
  const [draft, setDraft] = useState<EquipmentDraft>({});
  // 色も同じく、選び直したがまだ保存していない枠だけを持つ（Issue #381）
  const [paletteDraft, setPaletteDraft] = useState<PaletteDraft>({});
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // 確定できたことを知らせる。次に選び直したら消す
  const [didSave, setDidSave] = useState(false);
  // 選択肢を開いている枠。一度に1つだけ開く（以前は全部の枠を常に展開していて、
  // 枠が増えるほど縦に長くなっていた）。
  const [openSection, setOpenSection] = useState<OpenSection | null>(null);

  // 下書きの対象を記録し、切り替わった直後の描画でも前の人・種類の下書きを使わない。
  const draftOwnerRef = useRef({ userId, characterType });
  const isDraftUserCurrent = draftOwnerRef.current.userId === userId;
  const isDraftPaletteCurrent = isDraftUserCurrent &&
    draftOwnerRef.current.characterType === characterType;
  // 保存中に対象が切り替わったら、元に戻った場合も古い保存結果を表示しない。
  const saveTargetRef = useRef({ userId, characterType });
  if (saveTargetRef.current.userId !== userId ||
      saveTargetRef.current.characterType !== characterType) {
    saveTargetRef.current = { userId, characterType };
  }
  useEffect(() => {
    if (isDraftPaletteCurrent) return;
    draftOwnerRef.current = { userId, characterType };
    if (!isDraftUserCurrent) setDraft({});
    setPaletteDraft({});
    setDidSave(false);
    setError(null);
    setOpenSection(null);
  }, [characterType, isDraftPaletteCurrent, isDraftUserCurrent, userId]);

  const shownEquipment = applyEquipmentDraft(savedEquipment, isDraftUserCurrent ? draft : {});
  const changes = getEquipmentChanges(savedEquipment, shownEquipment);
  const currentPalette = isTypeReady && isPaletteReady ? savedPalette : {};
  const palette = applyPaletteDraft(currentPalette, isDraftPaletteCurrent ? paletteDraft : {});
  const paletteChanges = getPaletteChanges(currentPalette, palette);
  const isDirty = changes.length > 0 || paletteChanges.length > 0;

  // 種類・色・装備の読み込みが終わるまではプレビューを出さない。途中の値（既定のカエルや
  // 何も着ていない姿）を映してから切り替わると、ちらついて見えるため（CharacterAvatar と同じ）
  const isLookReady = isWardrobeReady && isTypeReady && isPaletteReady;
  const canConfirm = canUseRealData && isLookReady && isDirty && !isSaving;
  // 見た目が同じ間は同じオブジェクトを使う。変わるたびに作り直すと、WebView へ同じ姿を
  // 送り直してキャラクターを作り直してしまう
  const lookKey = getPortraitKey({ characterType, equipment: shownEquipment, palette, season });
  const look = useMemo<PortraitLook>(
    () => ({ characterType, equipment: shownEquipment, palette, season }),
    // lookKey が同じなら中身も同じ（getPortraitKey の約束）
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [lookKey],
  );

  const previewHeight = Math.min(
    MAX_PREVIEW_HEIGHT,
    Math.max(MIN_PREVIEW_HEIGHT, Math.round(windowHeight * PREVIEW_HEIGHT_RATIO)),
  );

  // 確定せずに離れようとしたら確かめる。戻るボタン・Android の戻る操作のどちらで
  // 離れても、画面が消える直前にここを通る
  useEffect(() => {
    if (!isDirty && !isSaving) return undefined;
    return navigation.addListener("beforeRemove", (event: any) => {
      event.preventDefault();
      // **保存中は離れさせない。** 「やめる」を選べても保存は止まらないので、
      // 捨てたつもりの変更が保存されてしまう。終わるまで待ってもらう
      if (isSaving) {
        Alert.alert("ほぞんしています", "おわるまで まってね。");
        return;
      }
      Alert.alert("きがえを やめますか？", "えらんだものは ほぞんされません。", [
        { style: "cancel", text: "つづける" },
        {
          onPress: () => navigation.dispatch(event.data.action),
          style: "destructive",
          text: "やめる",
        },
      ]);
    });
  }, [isDirty, isSaving, navigation]);

  const handleSelect = (slot: EquipmentSlot, assetId: AssetId | null) => {
    if (isSaving) return;
    setDraft((current) => ({ ...current, [slot]: assetId }));
    setDidSave(false);
  };

  // 色は種類と保存済みの色を読み込むまで選ばせない。読み込み前の値（既定のカエルや
  // 前の利用者の色）を元に、選択中の表示や「変わったか」を決めてしまうため
  const canSelectColor = isTypeReady && isPaletteReady && !isSaving;

  const handleSelectColor = (slot: PaletteSlot, color: string | null) => {
    if (!canSelectColor) return;
    setPaletteDraft((current) => ({ ...current, [slot]: color }));
    setDidSave(false);
  };

  const isOpen = (kind: OpenSection["kind"], slot: string) =>
    openSection?.kind === kind && openSection.slot === slot;

  const handleConfirm = async () => {
    if (!canConfirm) return;
    const savingTarget = saveTargetRef.current;
    setIsSaving(true);
    setError(null);
    try {
      // 変えていない側は呼ばない（呼んでも何もしないが、読み直しを1回減らせる）
      if (changes.length > 0) await saveEquipment(changes);
      if (saveTargetRef.current !== savingTarget) return;
      if (paletteChanges.length > 0) await savePalette(paletteChanges);
      // 保存中に利用者や種類が変わっていたら、結果を今の対象の画面に出さない。
      if (saveTargetRef.current !== savingTarget) return;
      // 保存したものは読み直した保存済みの装備・色として出るので、下書きは捨てる
      setDraft({});
      setPaletteDraft({});
      setDidSave(true);
    } catch (e: unknown) {
      if (saveTargetRef.current !== savingTarget) return;
      // 下書きは残す。保存できた枠は読み直した装備・色に入り、残りは変更のまま押し直せる
      setError(e instanceof Error ? e.message : "保存できませんでした");
    } finally {
      setIsSaving(false);
    }
  };

  // 持っているものがある枠だけを出す。空の枠を並べても選べるものが無い
  const slots = EQUIPMENT_SLOTS.filter((slot) =>
    ownedAssetIds.some((assetId) => getWearableSlot(assetId) === slot),
  );
  // 色の枠を使わない種類には、透明な「もとのいろ」の選択肢を出さない。
  const paletteSlots = EDITABLE_PALETTE_SLOTS.filter((slot) =>
    getDefaultPaletteColor(characterType, slot) !== null,
  );

  return (
    <SafeAreaView className="flex-1 bg-slate-50" edges={["top", "bottom"]}>
      {/* 変えている間は iOS のスワイプで戻れないようにする。スワイプで消えかけた画面は
          確認を出しても元に戻らないことがあるため、戻るボタンから確かめる */}
      <Stack.Screen options={{ gestureEnabled: !isDirty, headerShown: false }} />
      <ScreenHeader title="きがえ" />

      <View className="px-4 pb-3">
        {isLookReady ? (
          <WardrobePreview height={previewHeight} look={look} />
        ) : (
          <View
            className="items-center justify-center rounded-2xl bg-sky-100"
            style={{ height: previewHeight }}
          >
            <ActivityIndicator />
          </View>
        )}
      </View>

      <ScrollView className="flex-1" contentContainerClassName="px-4 pb-4">
        {!canUseRealData && (
          <Text className="mb-4 text-xs text-slate-500">{PREVIEW_DISABLED_NOTICE}</Text>
        )}
        {error && (
          <View className="mb-4 rounded-2xl bg-red-50 px-4 py-3">
            <Text className="font-bold text-red-700">きがえを保存できませんでした</Text>
            <Text className="mt-1 text-xs text-red-600">{error}</Text>
          </View>
        )}

        {slots.length === 0 ? (
          <View className="mb-4 rounded-2xl bg-white px-4 py-6">
            <Text className="text-base text-slate-700">まだ着られるものがありません。</Text>
          </View>
        ) : (
          <View className="mb-4 overflow-hidden rounded-2xl bg-white">
            {slots.map((slot, index) => {
              const choices = ownedAssetIds.filter((assetId) => getWearableSlot(assetId) === slot);
              const options = [null, ...choices];
              const selected = shownEquipment[slot] ?? null;
              const selectedLabel = selected === null ? "なし" : (getAssetLabel(selected) ?? selected);
              const open = isOpen("equipment", slot);

              return (
                <View key={slot}>
                  <SectionHeader
                    accessibilityLabel={`${EQUIPMENT_SLOT_LABELS[slot]}（いま: ${selectedLabel}）`}
                    icon={
                      <Ionicons
                        color={open ? ACTIVE_ICON_COLOR : MUTED_ICON_COLOR}
                        name={EQUIPMENT_SLOT_ICONS[slot] as keyof typeof Ionicons.glyphMap}
                        size={20}
                      />
                    }
                    isLast={index === slots.length - 1}
                    isOpen={open}
                    onPress={() => setOpenSection(open ? null : { kind: "equipment", slot })}
                    title={EQUIPMENT_SLOT_LABELS[slot]}
                    value={selectedLabel}
                  />

                  {open && (
                    <View className="flex-row flex-wrap gap-2 border-b border-slate-100 bg-slate-50 px-4 py-4">
                      {options.map((assetId) => {
                        const isSelected = selected === assetId;
                        const label = assetId === null ? "なし" : (getAssetLabel(assetId) ?? assetId);

                        return (
                          <Pressable
                            accessibilityLabel={`${EQUIPMENT_SLOT_LABELS[slot]}を${label}にする`}
                            accessibilityRole="button"
                            accessibilityState={{
                              // disabled と同じ条件にする。ずれていると、支援技術が
                              // 「押せる」と読み上げるのに押しても何も起きない
                              disabled: isSaving,
                              selected: isSelected,
                            }}
                            className={`rounded-2xl border-2 px-5 py-3 ${
                              isSelected
                                ? "border-emerald-600 bg-emerald-50"
                                : "border-slate-200 bg-white"
                            } ${isSaving ? "opacity-50" : "active:bg-slate-100"}`}
                            disabled={isSaving}
                            key={assetId ?? "none"}
                            onPress={() => handleSelect(slot, assetId)}
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
                  )}
                </View>
              );
            })}
          </View>
        )}

        <View className="overflow-hidden rounded-2xl bg-white">
          {!isTypeReady || !isPaletteReady ? (
            <View className="items-center py-4">
              <ActivityIndicator accessibilityLabel="いろをよみこんでいます" />
            </View>
          ) : paletteSlots.map((slot, index) => {
            const defaultColor = getDefaultPaletteColor(characterType, slot);
            const selected = palette[slot] ?? null;
            const options = [
              { hex: null, label: DEFAULT_COLOR_LABEL, swatch: defaultColor },
              ...PALETTE_COLOR_OPTIONS.map((option) => ({ ...option, swatch: option.hex })),
            ];
            const selectedLabel =
              selected === null
                ? DEFAULT_COLOR_LABEL
                : (PALETTE_COLOR_OPTIONS.find((option) => option.hex === selected)?.label ?? selected);
            const open = isOpen("palette", slot);

            return (
              <View key={slot}>
                <SectionHeader
                  accessibilityLabel={`${PALETTE_SLOT_LABELS[slot]}（いま: ${selectedLabel}）`}
                  icon={
                    <View
                      className="h-6 w-6 rounded-full border border-slate-300"
                      style={{ backgroundColor: selected ?? defaultColor ?? undefined }}
                    />
                  }
                  isLast={index === paletteSlots.length - 1}
                  isOpen={open}
                  onPress={() => setOpenSection(open ? null : { kind: "palette", slot })}
                  title={PALETTE_SLOT_LABELS[slot]}
                  value={selectedLabel}
                />

                {open && (
                  <View className="flex-row flex-wrap gap-3 border-b border-slate-100 bg-slate-50 px-4 py-4">
                    {options.map((option) => {
                      const isSelected = selected === option.hex;

                      return (
                        <Pressable
                          accessibilityLabel={`${PALETTE_SLOT_LABELS[slot]}を${option.label}にする`}
                          accessibilityRole="button"
                          accessibilityState={{
                            // disabled と同じ条件にする（装備の選択肢と同じ理由）
                            disabled: !canSelectColor,
                            selected: isSelected,
                          }}
                          className={`w-16 items-center ${
                            canSelectColor ? "active:opacity-80" : "opacity-50"
                          }`}
                          disabled={!canSelectColor}
                          key={option.hex ?? "default"}
                          onPress={() => handleSelectColor(slot, option.hex)}
                        >
                          <View
                            className={`h-12 w-12 rounded-full border-4 ${
                              isSelected ? "border-emerald-600" : "border-white"
                            }`}
                            style={{ backgroundColor: option.swatch ?? undefined }}
                          />
                          <Text
                            className={`mt-1 text-center text-xs ${
                              isSelected ? "font-bold text-emerald-700" : "text-slate-600"
                            }`}
                          >
                            {option.label}
                          </Text>
                        </Pressable>
                      );
                    })}
                  </View>
                )}
              </View>
            );
          })}
        </View>
      </ScrollView>

      <View className="border-t border-slate-200 bg-white px-4 pt-3">
        {didSave && !isDirty ? (
          <Text className="mb-2 text-center text-sm font-bold text-emerald-700">きがえたよ！</Text>
        ) : null}
        <Pressable
          accessibilityLabel="けってい"
          accessibilityRole="button"
          // disabled と同じ条件にする（選択肢のボタンと同じ理由）
          accessibilityState={{ busy: isSaving, disabled: !canConfirm }}
          className={`items-center rounded-2xl py-4 ${
            canConfirm ? "bg-emerald-600 active:bg-emerald-700" : "bg-slate-300"
          }`}
          disabled={!canConfirm}
          onPress={handleConfirm}
          testID="wardrobe-confirm"
        >
          {isSaving ? (
            <ActivityIndicator color="#ffffff" />
          ) : (
            <Text className={`text-lg font-bold ${canConfirm ? "text-white" : "text-slate-500"}`}>
              けってい
            </Text>
          )}
        </Pressable>
      </View>
    </SafeAreaView>
  );
}

type SectionHeaderProps = {
  accessibilityLabel: string;
  /** 左の丸に出すもの（装備はアイコン、色はいまの色の見本） */
  icon: ReactNode;
  /** 一覧の最後の行か（最後の行には区切り線を引かない） */
  isLast: boolean;
  isOpen: boolean;
  onPress: () => void;
  title: string;
  /** いま選んでいるものの名前 */
  value: string;
};

/**
 * 枠（カテゴリ）の行。タップで選択肢を開閉する（Issue #235 / #381）。
 * 装備の枠と色の枠で同じ見た目にそろえるため、行の部分だけを切り出してある。
 */
function SectionHeader({
  accessibilityLabel,
  icon,
  isLast,
  isOpen,
  onPress,
  title,
  value,
}: SectionHeaderProps) {
  return (
    <Pressable
      accessibilityLabel={accessibilityLabel}
      accessibilityRole="button"
      accessibilityState={{ expanded: isOpen }}
      className={`flex-row items-center gap-3 px-4 py-4 ${
        !isLast ? "border-b border-slate-100" : ""
      } ${isOpen ? "bg-emerald-50" : "active:bg-slate-50"}`}
      onPress={onPress}
    >
      <View
        className={`h-10 w-10 items-center justify-center rounded-full ${
          isOpen ? "bg-emerald-100" : "bg-slate-100"
        }`}
      >
        {icon}
      </View>
      <View className="flex-1">
        <Text className="text-base font-bold text-slate-900">{title}</Text>
        <Text className="mt-0.5 text-xs text-slate-500">{value}</Text>
      </View>
      <Ionicons color={MUTED_ICON_COLOR} name={isOpen ? "chevron-up" : "chevron-down"} size={18} />
    </Pressable>
  );
}
