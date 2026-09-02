export type SettingsState = {
  name: string;
  notificationsEnabled: boolean;
};

/**
 * 設定の初期状態を作成する。
 * @param name - ユーザー名
 * @returns 初期設定（通知は有効）
 */
export function createInitialSettings(name: string): SettingsState {
  return { name, notificationsEnabled: true };
}

/**
 * 設定を部分的に更新する。
 * @param settings - 現在の設定
 * @param patch - 更新する項目（一部のみ指定可能）
 * @returns 更新後の設定
 */
export function updateSettings(
  settings: SettingsState,
  patch: Partial<SettingsState>,
): SettingsState {
  return { ...settings, ...patch };
}

export type SettingsRole = "parent" | "child";

/**
 * 親と子それぞれの初期設定を作成する。
 * @param parentName - 親の名前
 * @param childName - 子の名前
 * @returns ロールごとの初期設定
 */
export function createInitialSettingsByRole(
  parentName: string,
  childName: string,
): Record<SettingsRole, SettingsState> {
  return {
    parent: createInitialSettings(parentName),
    child: createInitialSettings(childName),
  };
}

/**
 * 指定したロールの設定を更新する。
 * @param settingsByRole - 現在のロール別設定
 * @param role - 更新対象のロール
 * @param patch - 更新する項目
 * @returns 更新後のロール別設定
 */
export function updateSettingsByRole(
  settingsByRole: Record<SettingsRole, SettingsState>,
  role: SettingsRole,
  patch: Partial<SettingsState>,
): Record<SettingsRole, SettingsState> {
  return {
    ...settingsByRole,
    [role]: updateSettings(settingsByRole[role], patch),
  };
}

export type NameDraftState = {
  trimmed: string;
  canSave: boolean;
};

/**
 * 名前編集中のドラフト状態を取得する（保存可否の判定を含む）。
 * @param draftName - 編集中の名前
 * @param currentName - 現在保存されている名前
 * @returns トリム後の名前と保存可否
 */
export function getNameDraftState(draftName: string, currentName: string): NameDraftState {
  const trimmed = draftName.trim();
  return {
    trimmed,
    canSave: draftName !== currentName && trimmed.length > 0,
  };
}
