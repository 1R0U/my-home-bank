import type { Href } from "expo-router";

export type RegistrationRole = "parent" | "child";

/** 家族登録画面のロール選択肢 */
export const REGISTRATION_ROLE_OPTIONS: ReadonlyArray<{
  description: string;
  label: string;
  value: RegistrationRole;
}> = [
  { description: "家族のクエストや報酬を管理します", label: "親", value: "parent" },
  { description: "クエストに挑戦して報酬を受け取ります", label: "子", value: "child" },
];

export type FamilyRegistrationState = {
  email: string;
  name: string;
  password: string;
  passwordVisible: boolean;
  role: RegistrationRole;
};

export type FamilyRegistrationAction =
  | { field: "email" | "name" | "password"; type: "updateField"; value: string }
  | { type: "selectRole"; value: RegistrationRole }
  | { type: "togglePasswordVisibility" };

/** 家族登録画面の初期状態 */
export const INITIAL_FAMILY_REGISTRATION_STATE: FamilyRegistrationState = {
  email: "",
  name: "",
  password: "",
  passwordVisible: false,
  role: "parent",
};

/**
 * 家族登録画面の状態を更新する reducer 関数。
 * @param state - 現在の状態
 * @param action - 実行するアクション
 * @returns 更新後の状態
 */
export function familyRegistrationReducer(
  state: FamilyRegistrationState,
  action: FamilyRegistrationAction,
): FamilyRegistrationState {
  switch (action.type) {
    case "updateField":
      return { ...state, [action.field]: action.value };
    case "selectRole":
      return { ...state, role: action.value };
    case "togglePasswordVisibility":
      return { ...state, passwordVisible: !state.passwordVisible };
  }
}

/**
 * パスワード入力欄の表示状態を取得する。
 * @param passwordVisible - パスワードを表示するかどうか
 * @returns TextInput に設定するプロパティ（secureTextEntry とアクセシビリティラベル）
 */
export function getPasswordInputState(passwordVisible: boolean) {
  return {
    accessibilityLabel: passwordVisible ? "パスワードを隠す" : "パスワードを表示",
    secureTextEntry: !passwordVisible,
  };
}

/**
 * 家族登録フォームの送信可否を判定する。
 * @param state - 家族登録の状態
 * @returns 名前・メール・パスワードが全て入力済みの場合は true
 */
export function canSubmitRegistration(state: FamilyRegistrationState): boolean {
  return (
    state.name.trim().length > 0 &&
    state.email.trim().length > 0 &&
    state.password.trim().length > 0
  );
}

/**
 * 登録後に遷移するホーム画面のルートを取得する。
 * @param role - 登録されたロール（親または子）
 * @returns 親の場合は /main-adult、子の場合は /main-child
 */
export function getRegistrationHomeRoute(role: RegistrationRole): Href {
  return role === "parent" ? "/main-adult" : "/main-child";
}
