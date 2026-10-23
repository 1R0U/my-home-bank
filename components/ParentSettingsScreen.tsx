import { Ionicons } from "@expo/vector-icons";
import { Redirect } from "expo-router";
import { type ReactNode, useEffect, useRef, useState } from "react";
import { Pressable, ScrollView, Switch, Text, TextInput, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { GENDER_OPTIONS, UNSET_LABEL } from "../lib/profile";
import { AUDIO_CREDITS } from "../lib/audioCredits";
import { resolveSettingsRoute } from "../lib/rpg-hub/routes";
import { useActiveRole } from "../store";
import KeyboardAvoidingScreen from "./KeyboardAvoidingScreen";
import CharacterAvatar from "./CharacterAvatar";
import ScreenHeader from "./ScreenHeader";
import ChildFeaturePanel from "./settings/ChildFeaturePanel";
import FamilyChildrenPanel from "./settings/FamilyChildrenPanel";
import { useSettingsForm } from "./settings/useSettingsForm";
import { ERROR_TEXT_CLASS, MUTED_ICON_COLOR, PLACEHOLDER_TEXT_COLOR, UI_COLORS } from "../constants/ui";
import { useTutorial } from "./tutorial/TutorialContext";
import TutorialReplay from "./tutorial/TutorialReplay";
import TutorialPressable from "./tutorial/TutorialPressable";

type AccordionSectionProps = {
  title: string;
  defaultOpen?: boolean;
  children: ReactNode;
  tutorialId?: string;
  onLayout?: (event: any) => void;
};

function AccordionSection({ title, defaultOpen = false, children, tutorialId, onLayout }: AccordionSectionProps) {
  const [open, setOpen] = useState(defaultOpen);
  const tutorial = useTutorial();
  const highlighted = tutorialId && tutorial?.step?.id === tutorialId;

  return (
    <View onLayout={onLayout} className="mt-4 overflow-hidden rounded-2xl border border-slate-200 bg-white">
      <TutorialPressable tutorialId={tutorialId}
        accessibilityRole="button"
        accessibilityState={{ expanded: open }}
        className={`flex-row items-center justify-between px-4 py-4 active:bg-slate-50 ${highlighted ? "m-3 rounded-xl" : ""}`}
        onPress={() => setOpen((prev) => highlighted ? true : !prev)}
      >
        <Text className="text-base font-semibold text-slate-900">{title}</Text>
        <Ionicons color={UI_COLORS.slate500} name={open ? "chevron-up" : "chevron-down"} size={20} />
      </TutorialPressable>

      {open && <View className="gap-4 border-t border-slate-100 px-4 py-4">{children}</View>}
    </View>
  );
}

type SettingRowProps = {
  label: string;
  value: string;
};

function SettingRow({ label, value }: SettingRowProps) {
  return (
    <View
      accessibilityLabel={`${label} ${value}`}
      accessible
      className="flex-row items-center justify-between"
    >
      <Text className="text-sm text-slate-500">{label}</Text>
      <Text className="text-sm font-medium text-slate-900">{value}</Text>
    </View>
  );
}

/**
 * 大人用の設定画面（Issue #439）。子供用は `ChildSettingsScreen`。
 *
 * 入力・保存・ログアウトの処理は `useSettingsForm` を子供用と共有し、ここは見た目だけを持つ。
 */
export default function ParentSettingsScreen() {
  const tutorial = useTutorial();
  const scrollRef = useRef<ScrollView>(null);
  const [sectionPositions, setSectionPositions] = useState<Record<string, number>>({});
  const sectionId = tutorial?.step?.id;
  useEffect(() => {
    const y = sectionPositions[sectionId];
    if (tutorial?.mode === "running" && y !== undefined) scrollRef.current?.scrollTo({ y: Math.max(0, y - 40), animated: true });
  }, [tutorial?.mode, sectionId, sectionPositions]);
  /** 案内中は背景をスクロールできないため、説明する見出しを表示範囲へ移す。 */
  const sectionLayout = (id: string) => (event: any) => {
    const y = event.nativeEvent.layout.y;
    setSectionPositions((previous) => previous[id] === y ? previous : { ...previous, [id]: y });
  };
  const role = useActiveRole();
  const {
    canSaveName,
    canSignOut,
    draftBirthDate,
    draftGender,
    draftName,
    handleSaveName,
    handleSaveProfile,
    handleSignOut,
    handleToggleNotifications,
    isBusy,
    isSigningOut,
    notificationsEnabled,
    profileDraft,
    setDraftBirthDate,
    setDraftGender,
    setDraftName,
    syncErrorMessage,
  } = useSettingsForm("parent");

  // 子供がURLで直接開いたときは子供用へ移す。この画面はロールを「おとな」に固定して
  // 読み書きするので、そのまま見せると立場や家族の管理がずれる（Issue #439）
  if (role === "child") return <Redirect href={resolveSettingsRoute(role)} />;

  return (
    <SafeAreaView className="flex-1 bg-slate-100" edges={["top", "bottom"]}>
      {/* 設定はタブのルート画面ではなく、ホーム画面から router.push で開く画面（Issue #320）。
          戻れるようにする。 */}
      <ScreenHeader title="設定" />

      <KeyboardAvoidingScreen>
        <ScrollView ref={scrollRef} className="flex-1" contentContainerClassName="px-6 pb-10" showsVerticalScrollIndicator={false}>
          <TutorialReplay role="parent" />
          <View className="mt-2 items-center rounded-2xl bg-white px-6 py-8">
            <View className="relative">
              <CharacterAvatar size={96} />
              <View className="absolute -bottom-1 -right-1 h-8 w-8 items-center justify-center rounded-full border-2 border-white bg-blue-600">
                <Ionicons color={UI_COLORS.white} name="add" size={18} />
              </View>
            </View>

            <View className="mt-6 w-full flex-row items-center gap-2 border-b border-slate-200 pb-2">
              <Text className="text-xs text-slate-400">名前</Text>
              <TextInput
                accessibilityLabel="名前"
                className="flex-1 text-base font-medium text-slate-900"
                onChangeText={setDraftName}
                value={draftName}
              />
              <Ionicons color={MUTED_ICON_COLOR} name="pencil" size={16} />
            </View>

            <Pressable
              accessibilityLabel="名前を保存"
              accessibilityRole="button"
              accessibilityState={{ disabled: !canSaveName || isBusy }}
              className={`mt-4 self-end rounded-full px-6 py-2 ${
                canSaveName && !isBusy ? "bg-blue-600 active:bg-blue-700" : "bg-slate-300"
              }`}
              disabled={!canSaveName || isBusy}
              onPress={handleSaveName}
            >
              <Text className="text-sm font-semibold text-white">保存</Text>
            </Pressable>
          </View>

          <AccordionSection defaultOpen title="ユーザー設定">
            <View className="gap-2">
              <Text className="text-sm text-slate-500">生年月日</Text>
              <TextInput
                accessibilityLabel="生年月日"
                className="rounded-xl bg-slate-50 px-4 py-3 text-sm text-slate-900"
                editable={!isBusy}
                keyboardType="numbers-and-punctuation"
                onChangeText={setDraftBirthDate}
                placeholder="例: 2015/04/12（空欄で未設定）"
                placeholderTextColor={PLACEHOLDER_TEXT_COLOR}
                value={draftBirthDate}
              />
              {profileDraft.birthDate.error ? (
                <Text className={`text-xs ${ERROR_TEXT_CLASS}`}>{profileDraft.birthDate.error}</Text>
              ) : null}
            </View>

            <View className="gap-2">
              <Text className="text-sm text-slate-500">性別</Text>
              <View accessibilityRole="radiogroup" className="flex-row flex-wrap gap-2">
                {[...GENDER_OPTIONS, { label: UNSET_LABEL, value: null }].map((option) => {
                  const selected = draftGender === option.value;
                  return (
                    <Pressable
                      accessibilityLabel={`性別 ${option.label}`}
                      accessibilityRole="radio"
                      accessibilityState={{ checked: selected, disabled: isBusy }}
                      className={`rounded-full px-4 py-2 ${selected ? "bg-slate-900" : "bg-slate-100"}`}
                      disabled={isBusy}
                      key={option.label}
                      onPress={() => setDraftGender(option.value)}
                    >
                      <Text className={`text-sm font-medium ${selected ? "text-white" : "text-slate-700"}`}>
                        {option.label}
                      </Text>
                    </Pressable>
                  );
                })}
              </View>
            </View>

            <Pressable
              accessibilityLabel="生年月日と性別を保存"
              accessibilityRole="button"
              accessibilityState={{ disabled: !profileDraft.canSave || isBusy }}
              className={`self-end rounded-full px-6 py-2 ${
                profileDraft.canSave && !isBusy ? "bg-blue-600 active:bg-blue-700" : "bg-slate-300"
              }`}
              disabled={!profileDraft.canSave || isBusy}
              onPress={handleSaveProfile}
            >
              <Text className="text-sm font-semibold text-white">保存</Text>
            </Pressable>

            <SettingRow label="立場" value="おとな" />
          </AccordionSection>

          <AccordionSection tutorialId="parent-settings-family" title="家族の子供" onLayout={sectionLayout("parent-settings-family")}>
            <FamilyChildrenPanel />
          </AccordionSection>

          <AccordionSection title="子供ごとの機能">
            <ChildFeaturePanel />
          </AccordionSection>

          <AccordionSection tutorialId="parent-settings-other" title="その他" onLayout={sectionLayout("parent-settings-other")}>
            <View className="flex-row items-center justify-between">
              <Text className="text-sm text-slate-500">通知</Text>
              <Switch
                accessibilityLabel={`通知 ${notificationsEnabled ? "オン" : "オフ"}`}
                disabled={isBusy}
                onValueChange={handleToggleNotifications}
                value={notificationsEnabled}
              />
            </View>
            <SettingRow label="アプリについて" value="v1.0.0" />
          </AccordionSection>

          <AccordionSection tutorialId="parent-settings-credits" title="音楽クレジット" onLayout={sectionLayout("parent-settings-credits")}>
            <Text className="text-xs text-slate-500">
              アプリ内で流れるBGM・効果音のうち、クレジット表記をしている素材の出典です。
            </Text>
            {AUDIO_CREDITS.map((credit, index) => (
              <View
                className={`gap-1 ${index > 0 ? "border-t border-slate-100 pt-3" : ""}`}
                key={credit.title}
              >
                <Text className="text-sm font-semibold text-slate-900">{credit.title}</Text>
                <Text className="text-xs text-slate-500">作曲: {credit.author}（{credit.authorUrl}）</Text>
                <Text className="text-xs text-slate-500">
                  ライセンス: {credit.license}（{credit.licenseUrl}）
                </Text>
                <Text className="text-xs text-slate-400">{credit.note}</Text>
              </View>
            ))}
          </AccordionSection>

          {syncErrorMessage ? (
            <Text className={`mt-3 text-center text-xs ${ERROR_TEXT_CLASS}`}>{syncErrorMessage}</Text>
          ) : null}

          {canSignOut ? (
            <Pressable
              accessibilityRole="button"
              accessibilityState={{ disabled: isBusy }}
              className={`mt-6 items-center rounded-xl border px-4 py-3 ${
                isBusy ? "border-slate-300" : "border-red-500 active:bg-red-50"
              }`}
              disabled={isBusy}
              onPress={handleSignOut}
            >
              <Text className="font-bold text-red-600">
                {isSigningOut ? "ログアウト中..." : "ログアウト"}
              </Text>
            </Pressable>
          ) : null}
        </ScrollView>
      </KeyboardAvoidingScreen>
    </SafeAreaView>
  );
}
