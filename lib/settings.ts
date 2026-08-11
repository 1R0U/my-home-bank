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
