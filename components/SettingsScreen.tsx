import { Ionicons } from "@expo/vector-icons";
import { Stack } from "expo-router";
import { type ReactNode, useEffect, useState } from "react";
import { Pressable, ScrollView, Switch, Text, TextInput, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { getMockCurrentUser } from "../constants/mockData";
import { DEV_ROLE_OVERRIDE } from "../lib/devRole";
import { getNameDraftState } from "../lib/settings";
import { fetchUserSettings, updateUserSettings } from "../lib/settingsService";
import { useActiveRole, useAppStore, useCurrentUser } from "../store";
import AdultBottomNav from "./nav/AdultBottomNav";
import ScreenHeader from "./ScreenHeader";

type AccordionSectionProps = {
  title: string;
  defaultOpen?: boolean;
  children: ReactNode;
};

function AccordionSection({ title, defaultOpen = false, children }: AccordionSectionProps) {
  const [open, setOpen] = useState(defaultOpen);

  return (
    <View className="mt-4 overflow-hidden rounded-2xl border border-slate-200 bg-white">
      <Pressable
        accessibilityRole="button"
        accessibilityState={{ expanded: open }}
        className="flex-row items-center justify-between px-4 py-4 active:bg-slate-50"
        onPress={() => setOpen((prev) => !prev)}
      >
        <Text className="text-base font-semibold text-slate-900">{title}</Text>
        <Ionicons color="#64748b" name={open ? "chevron-up" : "chevron-down"} size={20} />
      </Pressable>

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

export default function SettingsScreen() {
  const role = useActiveRole();
  const settingsRole = role ?? "child";
  const currentUser = getMockCurrentUser(role);
  const name = useAppStore((state) => state.settings[settingsRole].name);
  const notificationsEnabled = useAppStore((state) => state.settings[settingsRole].notificationsEnabled);
  const updateSettings = useAppStore((state) => state.updateSettings);
  const [draftName, setDraftName] = useState(name);
  useEffect(() => {
    setDraftName(name);
  }, [name]);
  const { trimmed: trimmedDraftName, canSave: canSaveName } = getNameDraftState(draftName, name);

  // ライブ接続中（実ログイン時）は、起動時にSupabaseの設定値をstoreの初期値として反映する。
  const loggedInUser = useCurrentUser();
  const isLive = !DEV_ROLE_OVERRIDE && loggedInUser !== null;
  const [syncErrorMessage, setSyncErrorMessage] = useState<string | null>(null);

  useEffect(() => {
    if (!isLive || !loggedInUser) return;
    fetchUserSettings(loggedInUser.id)
      .then((settings) => updateSettings(settingsRole, settings))
      .catch((e: unknown) => {
        setSyncErrorMessage(e instanceof Error ? e.message : "設定の取得に失敗しました");
      });
    // 画面表示時（マウント時）にのみ取得する。role切り替え等では再取得しない。
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isLive]);

  const handleSaveName = () => {
    updateSettings(settingsRole, { name: trimmedDraftName });
    if (isLive && loggedInUser) {
      setSyncErrorMessage(null);
      updateUserSettings(loggedInUser.id, { name: trimmedDraftName }).catch((e: unknown) => {
        setSyncErrorMessage(e instanceof Error ? e.message : "名前の保存に失敗しました");
      });
    }
  };

  const handleToggleNotifications = (value: boolean) => {
    updateSettings(settingsRole, { notificationsEnabled: value });
    if (isLive && loggedInUser) {
      setSyncErrorMessage(null);
      updateUserSettings(loggedInUser.id, { notificationsEnabled: value }).catch((e: unknown) => {
        setSyncErrorMessage(e instanceof Error ? e.message : "通知設定の保存に失敗しました");
      });
    }
  };

  return (
    <SafeAreaView className="flex-1 bg-slate-100" edges={["top", "bottom"]}>
      <Stack.Screen options={{ headerShown: false }} />

      <ScreenHeader title="設定" />

      <ScrollView contentContainerClassName="px-6 pb-10" showsVerticalScrollIndicator={false}>
        <View className="mt-2 items-center rounded-2xl bg-white px-6 py-8">
          <View className="relative">
            <View className="h-24 w-24 items-center justify-center rounded-full bg-slate-200">
              <Ionicons color="#94a3b8" name="person" size={48} />
            </View>
            <View className="absolute -bottom-1 -right-1 h-8 w-8 items-center justify-center rounded-full border-2 border-white bg-blue-600">
              <Ionicons color="#ffffff" name="add" size={18} />
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
            <Ionicons color="#94a3b8" name="pencil" size={16} />
          </View>

          <Pressable
            accessibilityLabel="名前を保存"
            accessibilityRole="button"
            className={`mt-4 self-end rounded-full px-6 py-2 ${
              canSaveName ? "bg-blue-600 active:bg-blue-700" : "bg-slate-300"
            }`}
            disabled={!canSaveName}
            onPress={handleSaveName}
          >
            <Text className="text-sm font-semibold text-white">保存</Text>
          </Pressable>
        </View>

        <AccordionSection defaultOpen title="ユーザー設定">
          <SettingRow label="生年月日" value="2015/04/12" />
          <SettingRow label="性別" value="未設定" />
          <SettingRow label="立場" value={currentUser.role === "parent" ? "おとな" : "こども"} />
        </AccordionSection>

        <AccordionSection title="その他">
          <View className="flex-row items-center justify-between">
            <Text className="text-sm text-slate-500">通知</Text>
            <Switch
              accessibilityLabel={`通知 ${notificationsEnabled ? "オン" : "オフ"}`}
              onValueChange={handleToggleNotifications}
              value={notificationsEnabled}
            />
          </View>
          <SettingRow label="アプリについて" value="v1.0.0" />
        </AccordionSection>

        {syncErrorMessage ? (
          <Text className="mt-3 text-center text-xs text-rose-500">{syncErrorMessage}</Text>
        ) : null}
      </ScrollView>

      <AdultBottomNav activeKey="settings" />
    </SafeAreaView>
  );
}
