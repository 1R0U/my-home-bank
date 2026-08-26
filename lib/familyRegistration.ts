import type { Href } from "expo-router";

export type RegistrationRole = "parent" | "child";

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

export const INITIAL_FAMILY_REGISTRATION_STATE: FamilyRegistrationState = {
  email: "",
  name: "",
  password: "",
  passwordVisible: false,
  role: "parent",
};

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

export function getPasswordInputState(passwordVisible: boolean) {
  return {
    accessibilityLabel: passwordVisible ? "パスワードを隠す" : "パスワードを表示",
    secureTextEntry: !passwordVisible,
  };
}

export function canSubmitRegistration(state: FamilyRegistrationState): boolean {
  return (
    state.name.trim().length > 0 &&
    state.email.trim().length > 0 &&
    state.password.trim().length > 0
  );
}

export function getRegistrationHomeRoute(role: RegistrationRole): Href {
  return role === "parent" ? "/main-adult" : "/main-child";
}
