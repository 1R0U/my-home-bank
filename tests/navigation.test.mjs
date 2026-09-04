import assert from "node:assert/strict";
import test from "node:test";
import fs from "node:fs";
import path from "node:path";

test("HomeScreen: ソースに銀行リンク (href=\"/bank\") が含まれている", () => {
  const p = path.resolve("app/index.tsx");
  const src = fs.readFileSync(p, "utf8");
  assert.ok(src.includes('href="/bank"'), "app/index.tsx に href=\"/bank\" が含まれるはずです");
});

test("BankScreen: 戻る操作に router.back() を使っている", () => {
  const p = path.resolve("app/bank.tsx");
  const src = fs.readFileSync(p, "utf8");
  assert.ok(src.includes("router.back()"), "app/bank.tsx に router.back() が含まれるはずです");
});

test("ログイン画面から開発用ナビと初期設定へ進める", () => {
  const login = fs.readFileSync(path.resolve("app/login.tsx"), "utf8");
  assert.ok(login.includes('router.push("/dev-navigation")'));
  assert.ok(login.includes('router.push("/onboarding")'));
  assert.ok(login.includes("SHOULD_ENABLE_MOCK_LOGIN"));
});

test("開発用ナビに従来の画面一覧が含まれている", () => {
  const navigation = fs.readFileSync(path.resolve("app/dev-navigation.tsx"), "utf8");
  assert.ok(navigation.includes('route: "/tasks-adult"'));
  assert.ok(navigation.includes('route: "/tasks-child"'));
  assert.ok(navigation.includes('route: "/bank"'));
  assert.ok(navigation.includes('route: "/onboarding"'));
  assert.ok(navigation.includes("if (!SHOULD_ENABLE_MOCK_LOGIN)"));
});

test("開発用ナビはロール別画面を開く前に実際のテストユーザーを作成してログイン状態にする", () => {
  const navigation = fs.readFileSync(path.resolve("app/dev-navigation.tsx"), "utf8");
  assert.ok(navigation.includes("createUserProfile"));
  assert.ok(navigation.includes("setUser(user)"));
  assert.ok(
    navigation.includes('devUserRole: "parent"'),
    "大人用画面には devUserRole: \"parent\" が指定されているはず",
  );
  assert.ok(
    navigation.includes('devUserRole: "child"'),
    "子供用画面には devUserRole: \"child\" が指定されているはず",
  );
});
