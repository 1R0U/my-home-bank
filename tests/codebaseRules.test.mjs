import assert from "node:assert/strict";
import { readdirSync, readFileSync } from "node:fs";
import path from "node:path";
import test from "node:test";

/**
 * AGENTS.md の「コードの書き方（再発防止）」を自動で確かめる（Issue #399）。
 *
 * どれも「手書きのコピーが画面ごとにずれていった」問題の再発防止。
 * ここで落ちたら、まず AGENTS.md の該当ルールを読み、共通の仕組みを使う形に直す。
 * **例外の一覧（ALLOWED_*）へ足すのは最後の手段**で、足すときは理由を必ず書く。
 */

const ROOT = path.resolve(import.meta.dirname, "..");

function sourceFiles(relativeDirectory, pattern = /\.(?:ts|tsx)$/) {
  const walk = (directory) =>
    readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
      const entryPath = path.join(directory, entry.name);
      if (entry.isDirectory()) return walk(entryPath);
      return pattern.test(entry.name) ? [entryPath] : [];
    });
  return walk(path.join(ROOT, relativeDirectory)).map((file) => path.relative(ROOT, file).split(path.sep).join("/"));
}

function read(relativeFile) {
  return readFileSync(path.join(ROOT, relativeFile), "utf8");
}

/** コメントを除いたソース。説明文の中の名前に反応しないようにする。 */
function code(relativeFile) {
  return read(relativeFile)
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/(^|[^:"'`])\/\/.*$/gm, "$1");
}

const SCREEN_FILES = [...sourceFiles("app"), ...sourceFiles("components")];

// ---------------------------------------------------------------------------
// データの取得
// ---------------------------------------------------------------------------

/**
 * `createStaleGuard` / `useRefetchOnFocus` を直接使ってよいファイル。
 * 取得結果を画面の state ではなく Zustand のストアへ書き、3Dシーン（WebView）が
 * そのストアを読む作りのため、`useResource` のキャッシュに載せていない。
 */
const ALLOWED_MANUAL_FETCH = new Map([
  ["lib/staleGuard.ts", "仕組みそのもの"],
  ["lib/useRefetchOnFocus.ts", "仕組みそのもの"],
  ["lib/useCharacterAppearance.ts", "appearanceStore へ書き、RPGハブのシーンが読む"],
  ["lib/useCharacterPalette.ts", "appearanceStore へ書き、RPGハブのシーンが読む"],
  ["lib/usePlacedDecorations.ts", "mapStore へ書き、RPGハブのシーンが読む"],
  ["lib/useWardrobe.ts", "wardrobeStore へ書き、RPGハブのシーンが読む"],
]);

test("データの取得は useResource を使い、staleGuard や useRefetchOnFocus を手書きしない", () => {
  const files = [...SCREEN_FILES, ...sourceFiles("lib"), ...sourceFiles("store")];
  const violations = files.filter(
    (file) =>
      !ALLOWED_MANUAL_FETCH.has(file) &&
      /import\s*\{[^}]*\b(?:createStaleGuard|useRefetchOnFocus)\b[^}]*\}\s*from/.test(code(file)),
  );
  assert.deepEqual(violations, [], "lib/useResource.ts を使って取得フックを書く（AGENTS.md「データの取得」）");
});

test("取得関数（fetchXxx）を呼ぶフックは useResource を使う", () => {
  const violations = sourceFiles("lib", /^use[A-Z].*\.ts$/).filter((file) => {
    if (ALLOWED_MANUAL_FETCH.has(file) || file === "lib/useResource.ts") return false;
    const source = code(file);
    return /\bfetch[A-Z]\w*\(/.test(source) && !/\buseResource\b/.test(source);
  });
  assert.deepEqual(violations, []);
});

/** 画面から Supabase クライアントを直接使ってよいファイル。 */
const ALLOWED_DIRECT_SUPABASE = new Map([
  ["app/_layout.tsx", "ログイン状態の変化の購読。lib/auth.ts は node --test から読むため実クライアントを静的に読み込めない"],
]);

test("画面（app/ と components/）から Supabase を直接呼ばず、lib/ のサービス経由にする", () => {
  const violations = SCREEN_FILES.filter((file) => {
    if (ALLOWED_DIRECT_SUPABASE.has(file)) return false;
    const source = code(file);
    return /from\s+"[./]*lib\/supabase"/.test(source) || /\.rpc\(|\.from\("/.test(source);
  });
  assert.deepEqual(violations, []);
});

/**
 * モックデータ（constants/mockData.ts）を読み込んでよいファイル。
 * 実データとモックの切り替えは取得フック（lib/use*.ts）の `preview` に集める。
 */
const ALLOWED_MOCK_IMPORT = new Map([
  ["lib/guestUsers.ts", "開発用ロール指定のゲスト利用者"],
  ["store/index.ts", "未ログイン時の表示用の利用者と、設定の初期値"],
  ["components/SettingsScreen.tsx", "未ログイン時の表示名（設定は取得フックではなくストアで持つ）"],
  ["components/ParentBalanceScreen.tsx", "親が子の口座を読む手段（RPC）がまだ無い。Issue #399 で要確認"],
]);

test("モックデータは取得フック（lib/use*.ts）の preview で使い、画面から直接読まない", () => {
  const files = [...SCREEN_FILES, ...sourceFiles("lib"), ...sourceFiles("store")];
  const violations = files.filter((file) => {
    if (ALLOWED_MOCK_IMPORT.has(file) || /^lib\/use[A-Z]/.test(file)) return false;
    return /from\s+"[./]*constants\/mockData"/.test(code(file));
  });
  assert.deepEqual(violations, []);
});

// ---------------------------------------------------------------------------
// 見た目
// ---------------------------------------------------------------------------

/**
 * 色を直書きしてよい画面ファイル。3Dや絵（町・棚・グラフ）の配色で、
 * UIの色ではないためその場に置いている。
 */
const ALLOWED_COLOR_LITERALS = new Map([
  ["app/title.tsx", "タイトル画面の絵の配色"],
  ["components/title/GuildTownScene.tsx", "タイトル画面の町の配色"],
  ["components/title/TitleTownBackdrop.web.tsx", "タイトル画面の町の配色（Web）"],
  ["components/store/StoreShelfScene.tsx", "ストアの棚の配色"],
  ["components/history/HistoryChart.tsx", "グラフの配色"],
]);

test("画面のファイルに色（#xxxxxx）を直書きしない", () => {
  const violations = SCREEN_FILES.filter(
    (file) => file.endsWith(".tsx") && !ALLOWED_COLOR_LITERALS.has(file) && /["'`]#[0-9a-fA-F]{3,8}["'`]/.test(code(file)),
  ).map((file) => file);
  assert.deepEqual(
    violations,
    [],
    "constants/ui.ts の UI_COLORS（大人用）か components/childTheme.ts の CHILD_THEME（子供用）を使う",
  );
});

test("WCAG AA を満たさない文字色（Issue #272）を使わない", () => {
  const violations = SCREEN_FILES.flatMap((file) =>
    [...code(file).matchAll(/\btext-(?:rose-500|slate-300)\b/g)].map((match) => `${file}: ${match[0]}`),
  );
  assert.deepEqual(violations, [], "エラーは ERROR_TEXT_CLASS、注記は NOTICE_TEXT_CLASS を使う");
});

// ---------------------------------------------------------------------------
// DBの型
// ---------------------------------------------------------------------------

test("テーブルの行の型（id を持つ型）は types/schemaCompat.ts でDBと照合する", () => {
  const index = read("types/index.ts");
  const rowTypes = [...index.matchAll(/export type (\w+) = \{([^}]*)\}/g)]
    .filter(([, , body]) => /^\s*id: string;/m.test(body))
    .map(([, name]) => name);
  const compat = read("types/schemaCompat.ts");
  const missing = rowTypes.filter((name) => !new RegExp(`Compatible<${name},`).test(compat));
  assert.deepEqual(missing, [], "types/schemaCompat.ts に Compatible<型, \"テーブル名\"> を1行足す");
});

// ---------------------------------------------------------------------------
// 例外の一覧が古くなっていないか
// ---------------------------------------------------------------------------

test("例外の一覧に、もう存在しないファイルを残さない", () => {
  const all = new Set([...SCREEN_FILES, ...sourceFiles("lib"), ...sourceFiles("store")]);
  const stale = [ALLOWED_MANUAL_FETCH, ALLOWED_DIRECT_SUPABASE, ALLOWED_MOCK_IMPORT, ALLOWED_COLOR_LITERALS]
    .flatMap((allowed) => [...allowed.keys()])
    .filter((file) => !all.has(file));
  assert.deepEqual(stale, []);
});
