import { router } from "expo-router";
import { useEffect, useState } from "react";
import { signOutCurrentUser } from "../../lib/auth";
import { formatBirthDateInput, getProfileDraftState, type Gender } from "../../lib/profile";
import { getNameDraftState, type SettingsRole, type SettingsState } from "../../lib/settings";
import { fetchUserSettings, updateUserSettings } from "../../lib/settingsService";
import { useAppStore, useCurrentUser, useDataAccess } from "../../store";

/**
 * 設定画面の入力・保存・ログアウトの処理（Issue #439）。
 *
 * 大人用（`ParentSettingsScreen`）と子供用（`ChildSettingsScreen`）は見た目だけが違い、
 * 設定の中身と保存のしかたは同じなので、ここにまとめて両方の画面から使う。
 *
 * 設定は取得フック（`lib/useResource.ts`）ではなくストア（Zustand）で持つ。
 * ログイン中で、かつIDがUUIDのときだけ Supabase と同期し、
 * それ以外はローカル（ストア）だけを更新する。
 * @param role - どちらのロールの設定を読み書きするか。開いている画面のロール
 */
export function useSettingsForm(role: SettingsRole) {
  const name = useAppStore((state) => state.settings[role].name);
  const notificationsEnabled = useAppStore((state) => state.settings[role].notificationsEnabled);
  const updateSettings = useAppStore((state) => state.updateSettings);
  const authenticatedUser = useAppStore((state) => state.user);
  const setUser = useAppStore((state) => state.setUser);
  const [draftName, setDraftName] = useState(name);
  useEffect(() => {
    setDraftName(name);
  }, [name]);
  const { trimmed: trimmedDraftName, canSave: canSaveName } = getNameDraftState(draftName, name);

  // 生年月日と性別（Issue #277）。名前と同じく、入力中の値と保存済みの値を分けて持つ。
  const birthDate = useAppStore((state) => state.settings[role].birthDate);
  const gender = useAppStore((state) => state.settings[role].gender);
  const [draftBirthDate, setDraftBirthDate] = useState(formatBirthDateInput(birthDate));
  const [draftGender, setDraftGender] = useState<Gender | null>(gender);
  useEffect(() => {
    setDraftBirthDate(formatBirthDateInput(birthDate));
  }, [birthDate]);
  useEffect(() => {
    setDraftGender(gender);
  }, [gender]);
  const profileDraft = getProfileDraftState(draftBirthDate, draftGender, { birthDate, gender });

  // ライブ接続中（実ログイン時）は、起動時にSupabaseの設定値をstoreの初期値として反映する。
  const loggedInUser = useCurrentUser();
  // 実際にSupabase Authでログインしている場合だけライブ接続する。
  const { canUseRealData: isLive } = useDataAccess();
  const [syncErrorMessage, setSyncErrorMessage] = useState<string | null>(null);
  // 初期取得中・保存中は操作を無効化し、取得結果でローカルの変更を上書きしたり、
  // 連続した書き込みが古い値のまま上書き保存されたりしないようにする。
  const [isSyncing, setIsSyncing] = useState(isLive);
  const [isSaving, setIsSaving] = useState(false);
  const [isSigningOut, setIsSigningOut] = useState(false);
  const isBusy = isSyncing || isSaving || isSigningOut;

  useEffect(() => {
    if (!isLive || !loggedInUser) {
      setIsSyncing(false);
      return;
    }
    setIsSyncing(true);
    fetchUserSettings(loggedInUser.id)
      .then((settings) => updateSettings(role, settings))
      .catch((e: unknown) => {
        setSyncErrorMessage(e instanceof Error ? e.message : "設定の取得に失敗しました");
      })
      .finally(() => setIsSyncing(false));
    // 画面表示時（マウント時）にのみ取得する。role切り替え等では再取得しない。
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isLive]);

  /**
   * 設定を保存する。名前・生年月日と性別・通知の3つで共通。
   *
   * ライブ接続中は、Supabaseへの保存が成功してからローカルに反映する
   * （保存失敗時に「見た目上は保存済みだが実際は未保存」という状態を防ぐため）。
   * プレビュー中/未ログイン時はSupabaseに書き込まないため、即座にローカルへ反映する。
   */
  const saveSettings = (patch: Partial<SettingsState>, failureMessage: string) => {
    if (!isLive || !loggedInUser) {
      updateSettings(role, patch);
      return;
    }

    setSyncErrorMessage(null);
    setIsSaving(true);
    updateUserSettings(loggedInUser.id, patch)
      .then(() => updateSettings(role, patch))
      .catch((e: unknown) => {
        setSyncErrorMessage(e instanceof Error ? e.message : failureMessage);
      })
      .finally(() => setIsSaving(false));
  };

  const handleSaveName = () => {
    if (isBusy) return;
    saveSettings({ name: trimmedDraftName }, "名前の保存に失敗しました");
  };

  const handleSaveProfile = () => {
    if (isBusy || !profileDraft.canSave) return;
    saveSettings(
      { birthDate: profileDraft.birthDate.value, gender: draftGender },
      "生年月日・性別の保存に失敗しました",
    );
  };

  const handleToggleNotifications = (value: boolean) => {
    if (isBusy) return;
    saveSettings({ notificationsEnabled: value }, "通知設定の保存に失敗しました");
  };

  const handleSignOut = async () => {
    if (isBusy) return;

    setSyncErrorMessage(null);
    setIsSigningOut(true);
    const error = await signOutCurrentUser();
    if (error) {
      setSyncErrorMessage(error);
      setIsSigningOut(false);
      return;
    }

    setUser(null);
    router.replace("/login");
  };

  return {
    /** ログアウトボタンを出すか（Supabase Authでログインしているときだけ） */
    canSignOut: Boolean(authenticatedUser),
    canSaveName,
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
  };
}
