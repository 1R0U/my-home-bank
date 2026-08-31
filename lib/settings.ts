export type SettingsState = {
  name: string;
  notificationsEnabled: boolean;
};

export function createInitialSettings(name: string): SettingsState {
  return { name, notificationsEnabled: true };
}

export function updateSettings(
  settings: SettingsState,
  patch: Partial<SettingsState>,
): SettingsState {
  return { ...settings, ...patch };
}

export type SettingsRole = "parent" | "child";

export function createInitialSettingsByRole(
  parentName: string,
  childName: string,
): Record<SettingsRole, SettingsState> {
  return {
    parent: createInitialSettings(parentName),
    child: createInitialSettings(childName),
  };
}

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

export function getNameDraftState(draftName: string, currentName: string): NameDraftState {
  const trimmed = draftName.trim();
  return {
    trimmed,
    canSave: draftName !== currentName && trimmed.length > 0,
  };
}

/** SettingsState の一部更新を、Supabase の users テーブルのカラム名に変換する。 */
export function toUsersTablePatch(
  patch: Partial<SettingsState>,
): Record<string, string | boolean> {
  const result: Record<string, string | boolean> = {};
  if (patch.name !== undefined) result.name = patch.name;
  if (patch.notificationsEnabled !== undefined) {
    result.notifications_enabled = patch.notificationsEnabled;
  }
  return result;
}
