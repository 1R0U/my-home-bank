import assert from "node:assert/strict";
import test from "node:test";
import {
  canSubmitRegistration,
  familyRegistrationReducer,
  getPasswordInputState,
  getRegistrationHomeRoute,
  INITIAL_FAMILY_REGISTRATION_STATE,
  REGISTRATION_ROLE_OPTIONS,
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

test("親または子の役割を選択できる", () => {
  assert.deepEqual(REGISTRATION_ROLE_OPTIONS.map(({ value }) => value), ["parent", "child"]);

  const state = familyRegistrationReducer(INITIAL_FAMILY_REGISTRATION_STATE, {
    type: "selectRole",
    value: "child",
  });
  assert.equal(state.role, "child");
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

test("登録後は選択した役割のホーム画面へ遷移する", () => {
  assert.equal(getRegistrationHomeRoute("parent"), "/main-adult");
  assert.equal(getRegistrationHomeRoute("child"), "/main-child");
});
