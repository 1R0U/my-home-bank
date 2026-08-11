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
