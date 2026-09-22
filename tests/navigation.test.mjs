import assert from "node:assert/strict";
import test from "node:test";
import fs from "node:fs";
import path from "node:path";

test("HomeScreen: 未ログイン時はログイン画面へリダイレクトする", () => {
  const p = path.resolve("app/index.tsx");
  const src = fs.readFileSync(p, "utf8");
  assert.ok(src.includes('<Redirect href="/login" />'));
});

test("HomeScreen: 大人ロールは /main-adult へリダイレクトする（(adult)タブグループ配下で描画するため、直接ParentHomeScreenを描画しない）", () => {
  const p = path.resolve("app/index.tsx");
  const src = fs.readFileSync(p, "utf8");
  assert.ok(
    src.includes('<Redirect href="/main-adult" />'),
    "大人ロール時に /main-adult へリダイレクトしているはずです",
  );
  assert.ok(
    !src.includes("ParentHomeScreen"),
    "index.tsx はParentHomeScreenを直接描画せず、リダイレクトのみ行うはずです",
  );
});

test("HomeScreen: 子供ロールは /rpg-hub へリダイレクトする（ホーム画面の入口を1つに寄せるため、直接RpgHubScreenを描画しない）", () => {
  // Issue #205 / #245: 同じ画面に2つのルートがあると、ログイン経由と家族登録経由で
  // 着くルートが変わり、戻り先やWeb版のURLがずれる。
  // 子供のホームはRPGハブ（我が家タウン）で、大人も同じ /rpg-hub へ入る（#246）
  const p = path.resolve("app/index.tsx");
  const src = fs.readFileSync(p, "utf8");
  assert.ok(
    src.includes('<Redirect href="/rpg-hub" />'),
    "子供ロール時に /rpg-hub へリダイレクトしているはずです",
  );
  assert.ok(
    !src.includes("RpgHubScreen"),
    "index.tsx はRpgHubScreenを直接描画せず、リダイレクトのみ行うはずです",
  );
});

test("RPGハブ画面のルートは /rpg-hub だけ（子供用の /main-child は残っていない）", () => {
  assert.ok(fs.existsSync(path.resolve("app/rpg-hub.tsx")), "app/rpg-hub.tsx があるはずです");
  assert.ok(
    !fs.existsSync(path.resolve("app/main-child.tsx")),
    "app/main-child.tsx は /rpg-hub へ一本化したので残っていないはずです",
  );
});

test("BankScreen: 戻る操作に router.back() を使っている", () => {
  const p = path.resolve("app/bank.tsx");
  const src = fs.readFileSync(p, "utf8");
  assert.ok(src.includes("router.back()"), "app/bank.tsx に router.back() が含まれるはずです");
});

test("ログイン画面から新規登録へ進める", () => {
  const login = fs.readFileSync(path.resolve("app/login.tsx"), "utf8");
  assert.ok(login.includes('router.push("/family-registration")'));
});

test("ログイン画面にクイックログインと開発用ナビが残っていない", () => {
  // Issue #211 で削除した。どちらもモックユーザーで入るだけの経路で、
  // start:parent / start:child とやっていることが同じだった
  const login = fs.readFileSync(path.resolve("app/login.tsx"), "utf8");
  assert.ok(!login.includes("dev-navigation"), "開発用ナビへの導線が残っている");
  assert.ok(!login.includes("大人として入る"), "クイックログインのボタンが残っている");
  assert.ok(!login.includes("子供として入る"), "クイックログインのボタンが残っている");
});

test("開発用ナビの画面ファイルが存在しない", () => {
  assert.ok(
    !fs.existsSync(path.resolve("app/dev-navigation.tsx")),
    "app/dev-navigation.tsx は Issue #211 で削除済み",
  );
});

test("起動コマンドはログイン画面・大人ホーム・子供ホームの3つ", () => {
  // Issue #211: 経路を増やさない。増やすときはこのテストも一緒に直す
  const pkg = JSON.parse(fs.readFileSync(path.resolve("package.json"), "utf8"));
  const startScripts = Object.keys(pkg.scripts).filter(
    (name) => name === "start" || name.startsWith("start:"),
  );

  assert.deepEqual(startScripts.sort(), ["start", "start:child", "start:parent"]);
  assert.ok(pkg.scripts["start:parent"].includes("EXPO_PUBLIC_DEV_ROLE=parent"));
  assert.ok(pkg.scripts["start:child"].includes("EXPO_PUBLIC_DEV_ROLE=child"));
  assert.ok(!pkg.scripts.start.includes("EXPO_PUBLIC_DEV_ROLE"), "npm start はログイン画面から始める");
});
