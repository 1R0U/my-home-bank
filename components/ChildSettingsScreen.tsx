import { Redirect, router, Stack } from "expo-router";
import { type ReactNode, useState } from "react";
import { Pressable, ScrollView, Switch, Text, TextInput, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { playSoundEffect } from "../lib/audio";
import { AUDIO_CREDITS } from "../lib/audioCredits";
import { stripFurigana } from "../lib/furigana";
import { GENDER_OPTIONS, UNSET_LABEL } from "../lib/profile";
import { resolveSettingsRoute } from "../lib/rpg-hub/routes";
import { useActiveRole } from "../store";
import CharacterAvatar from "./CharacterAvatar";
import Furigana from "./Furigana";
import KeyboardAvoidingScreen from "./KeyboardAvoidingScreen";
import { CHILD_SETTINGS_PLACEHOLDER_COLOR, childSettingsStyles as styles } from "./settings/childSettingsStyles";
import { useSettingsForm } from "./settings/useSettingsForm";
import TutorialReplay from "./tutorial/TutorialReplay";

type SectionProps = {
  /** 見出し。`{漢字|よみ}` でふりがなを付けられる */
  title: string;
  defaultOpen?: boolean;
  children: ReactNode;
};

/** 押すと開閉する、紙のカードの区切り。 */
function Section({ title, defaultOpen = false, children }: SectionProps) {
  const [open, setOpen] = useState(defaultOpen);

  return (
    <View style={styles.card}>
      <Pressable
        accessibilityLabel={stripFurigana(title)}
        accessibilityRole="button"
        accessibilityState={{ expanded: open }}
        onPress={() => {
          playSoundEffect("confirm");
          setOpen((prev) => !prev);
        }}
        style={({ pressed }) => [styles.sectionHeader, pressed && styles.sectionHeaderPressed]}
      >
        <Furigana style={styles.sectionTitle}>{title}</Furigana>
        <Text style={styles.sectionChevron}>{open ? "▲" : "▼"}</Text>
      </Pressable>

      {open && <View style={styles.sectionBody}>{children}</View>}
    </View>
  );
}

type SaveButtonProps = {
  accessibilityLabel: string;
  enabled: boolean;
  onPress: () => void;
  inProfile?: boolean;
};

function SaveButton({ accessibilityLabel, enabled, onPress, inProfile = false }: SaveButtonProps) {
  return (
    <Pressable
      accessibilityLabel={accessibilityLabel}
      accessibilityRole="button"
      accessibilityState={{ disabled: !enabled }}
      disabled={!enabled}
      onPress={() => {
        playSoundEffect("confirm");
        onPress();
      }}
      style={({ pressed }) => [
        styles.saveButton,
        inProfile && styles.saveButtonInProfile,
        !enabled && styles.saveButtonDisabled,
        pressed && styles.buttonPressed,
      ]}
    >
      <Furigana style={styles.saveButtonText}>{"{保存|ほぞん}"}</Furigana>
    </Pressable>
  );
}

/**
 * 入力欄の見出し。入力欄自体に同じ読み上げ名（`accessibilityLabel`）を付けるので、
 * 読み上げで2回続けて読まれないよう、見出しは読み上げから外す。
 */
function FieldLabel({ children }: { children: string }) {
  return (
    <View accessibilityElementsHidden importantForAccessibility="no-hide-descendants">
      <Furigana style={styles.label}>{children}</Furigana>
    </View>
  );
}

/**
 * 子供用の設定画面（Issue #439）。大人用は `ParentSettingsScreen`。
 *
 * 出す項目は大人用と同じ（家族の子供の管理を除く）。入力・保存・ログアウトの処理は
 * `useSettingsForm` を大人用と共有し、ここは木と羊皮紙の見た目だけを持つ。
 * RPGハブのメニューの⚙️から開く。
 */
export default function ChildSettingsScreen() {
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
  } = useSettingsForm("child");

  // 大人がURLで直接開いたときは大人用へ移す。この画面はロールを「こども」に固定して
  // 読み書きするので、そのまま見せると立場がずれる（Issue #439）
  if (role === "parent") return <Redirect href={resolveSettingsRoute(role)} />;

  const handleBackPress = () => {
    playSoundEffect("cancel");
    // 履歴が無いとき（Webで直接開いた・再読み込みしたなど）はホームへ移る
    if (router.canGoBack()) router.back();
    else router.replace("/");
  };

  return (
    <SafeAreaView edges={["top", "bottom"]} style={styles.safeArea}>
      <Stack.Screen options={{ headerShown: false }} />

      <View style={styles.header}>
        <Text style={styles.eyebrow}>ぼうけんの じゅんび</Text>
        <Furigana accessibilityRole="header" style={styles.screenTitle}>
          {"{設定|せってい}"}
        </Furigana>
      </View>

      <View style={styles.boardFrame}>
        <KeyboardAvoidingScreen>
          <ScrollView
            contentContainerStyle={styles.scrollContent}
            showsVerticalScrollIndicator={false}
            style={styles.scroll}
          >
            <TutorialReplay role="child" />

            <View style={styles.profileCard}>
              <CharacterAvatar size={96} />

              <View style={styles.nameRow}>
                <FieldLabel>{"{名前|なまえ}"}</FieldLabel>
                <TextInput
                  accessibilityLabel="名前"
                  editable={!isBusy}
                  onChangeText={setDraftName}
                  style={styles.nameInput}
                  value={draftName}
                />
              </View>

              <SaveButton
                accessibilityLabel="名前を保存"
                enabled={canSaveName && !isBusy}
                inProfile
                onPress={handleSaveName}
              />
            </View>

            <Section defaultOpen title="ユーザー{設定|せってい}">
              <View style={styles.fieldGroup}>
                <FieldLabel>{"{生年月日|せいねんがっぴ}"}</FieldLabel>
                <TextInput
                  accessibilityLabel="生年月日"
                  editable={!isBusy}
                  keyboardType="numbers-and-punctuation"
                  onChangeText={setDraftBirthDate}
                  placeholder="れい: 2015/04/12"
                  placeholderTextColor={CHILD_SETTINGS_PLACEHOLDER_COLOR}
                  style={styles.input}
                  value={draftBirthDate}
                />
                {profileDraft.birthDate.error ? (
                  <Text accessibilityRole="alert" style={styles.errorText}>
                    {profileDraft.birthDate.error}
                  </Text>
                ) : null}
              </View>

              <View style={styles.fieldGroup}>
                <Furigana style={styles.label}>{"{性別|せいべつ}"}</Furigana>
                <View accessibilityRole="radiogroup" style={styles.chips}>
                  {[...GENDER_OPTIONS, { label: UNSET_LABEL, value: null }].map((option) => {
                    const selected = draftGender === option.value;
                    return (
                      <Pressable
                        accessibilityLabel={`性別 ${option.label}`}
                        accessibilityRole="radio"
                        accessibilityState={{ checked: selected, disabled: isBusy }}
                        disabled={isBusy}
                        key={option.label}
                        onPress={() => setDraftGender(option.value)}
                        style={[styles.chip, selected && styles.chipSelected]}
                      >
                        <Text style={[styles.chipText, selected && styles.chipTextSelected]}>{option.label}</Text>
                      </Pressable>
                    );
                  })}
                </View>
              </View>

              <SaveButton
                accessibilityLabel="生年月日と性別を保存"
                enabled={profileDraft.canSave && !isBusy}
                onPress={handleSaveProfile}
              />

              <View accessibilityLabel="立場 こども" accessible style={styles.row}>
                <Furigana style={styles.label}>{"{立場|たちば}"}</Furigana>
                <Text style={styles.value}>こども</Text>
              </View>
            </Section>

            <Section title="その{他|ほか}">
              <View style={styles.row}>
                <Furigana style={styles.label}>{"{通知|つうち}"}</Furigana>
                <Switch
                  accessibilityLabel={`通知 ${notificationsEnabled ? "オン" : "オフ"}`}
                  disabled={isBusy}
                  onValueChange={handleToggleNotifications}
                  value={notificationsEnabled}
                />
              </View>
              <View accessibilityLabel="アプリについて v1.0.0" accessible style={styles.row}>
                <Text style={styles.label}>アプリについて</Text>
                <Text style={styles.value}>v1.0.0</Text>
              </View>
            </Section>

            <Section title="{音楽|おんがく}クレジット">
              <Text style={styles.note}>
                アプリ内で流れるBGM・効果音のうち、クレジット表記をしている素材の出典です。
              </Text>
              {AUDIO_CREDITS.map((credit, index) => (
                <View key={credit.title} style={[styles.creditItem, index > 0 && styles.creditItemDivider]}>
                  <Text style={styles.creditTitle}>{credit.title}</Text>
                  <Text style={styles.creditText}>作曲: {credit.author}（{credit.authorUrl}）</Text>
                  <Text style={styles.creditText}>
                    ライセンス: {credit.license}（{credit.licenseUrl}）
                  </Text>
                  <Text style={styles.creditText}>{credit.note}</Text>
                </View>
              ))}
            </Section>

            {syncErrorMessage ? (
              <Text accessibilityRole="alert" style={styles.errorText}>
                {syncErrorMessage}
              </Text>
            ) : null}

            {canSignOut ? (
              <Pressable
                accessibilityLabel={isSigningOut ? "ログアウト中" : "ログアウト"}
                accessibilityRole="button"
                accessibilityState={{ disabled: isBusy }}
                disabled={isBusy}
                onPress={handleSignOut}
                style={({ pressed }) => [
                  styles.logoutButton,
                  isBusy && styles.logoutButtonDisabled,
                  pressed && styles.buttonPressed,
                ]}
              >
                <Text style={styles.logoutText}>{isSigningOut ? "ログアウト中..." : "ログアウト"}</Text>
              </Pressable>
            ) : null}
          </ScrollView>
        </KeyboardAvoidingScreen>
      </View>

      <View style={styles.footer}>
        <Pressable
          accessibilityLabel="前の画面に戻る"
          accessibilityRole="button"
          onPress={handleBackPress}
          style={({ pressed }) => [styles.backButton, pressed && styles.buttonPressed]}
        >
          <Text style={styles.backArrow}>‹</Text>
          <Furigana noWrap style={styles.backText}>{"{戻|もど}る"}</Furigana>
        </Pressable>
      </View>
    </SafeAreaView>
  );
}
