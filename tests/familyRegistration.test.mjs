import assert from "node:assert/strict";
import test from "node:test";
import {
  canSubmitRegistration,
  familyRegistrationReducer,
  getPasswordInputState,
  INITIAL_FAMILY_REGISTRATION_STATE,
} from "../lib/familyRegistration.ts";

test("名前・メールアドレス・パスワードが入力されている場合のみ登録できる", () => {
  const validState = {
    ...INITIAL_FAMILY_REGISTRATION_STATE,
    email: "family@example.com",
    name: "山田 太郎",
    password: "secret123",
  };

  assert.equal(canSubmitRegistration(validState), true);
  assert.equal(canSubmitRegistration({ ...validState, name: "" }), false);
  assert.equal(canSubmitRegistration({ ...validState, email: "   " }), false);
  assert.equal(canSubmitRegistration({ ...validState, password: "\t" }), false);
});

test("名前・メールアドレス・パスワードを個別に更新できる", () => {
  let state = INITIAL_FAMILY_REGISTRATION_STATE;

  state = familyRegistrationReducer(state, { field: "name", type: "updateField", value: "山田 太郎" });
  state = familyRegistrationReducer(state, { field: "email", type: "updateField", value: "family@example.com" });
  state = familyRegistrationReducer(state, { field: "password", type: "updateField", value: "secret123" });

  assert.equal(state.name, "山田 太郎");
  assert.equal(state.email, "family@example.com");
  assert.equal(state.password, "secret123");
});

test("パスワード表示切り替えに応じて入力状態とアクセシビリティラベルが変わる", () => {
  assert.deepEqual(getPasswordInputState(false), {
    accessibilityLabel: "パスワードを表示",
    secureTextEntry: true,
  });

  const state = familyRegistrationReducer(INITIAL_FAMILY_REGISTRATION_STATE, {
    type: "togglePasswordVisibility",
  });
  assert.deepEqual(getPasswordInputState(state.passwordVisible), {
    accessibilityLabel: "パスワードを隠す",
    secureTextEntry: false,
  });
});
