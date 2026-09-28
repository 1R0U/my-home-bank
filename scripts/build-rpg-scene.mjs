// RPGハブ（WebView + Babylon.js）の WebView 側スクリプトを1ファイルずつの JS にバンドルし、
// assets/rpg-hub/ に生成する。
//   - webview/rpg-hub/scene.ts    → assets/rpg-hub/scene.txt（我が家タウン）
//   - webview/rpg-hub/portrait.ts → assets/rpg-hub/portrait.txt（アイコン用の肖像。Issue #306）
//
// なぜバンドルするか:
//   WebView 内のシーンは、移動・衝突・接近判定に lib/rpg-hub/ の純粋関数をそのまま使う。
//   RN 側のテスト（tests/rpgHub.test.mjs）が保証しているロジックと、実際に画面で動く
//   ロジックを同一のソースに保つため、シーン側から import できる形にする必要がある。
//   WebView に渡すのは1枚の自己完結 HTML なので、import を解決した単一ファイルへ束ねる。
//
// 生成物はリポジトリにコミットしない（.gitignore 済み）。
// ローカルでは package.json の postinstall から実行され、npm install 時に自動生成される。
// CIは npm ci --ignore-scripts のあと、名前付きのステップとして明示的に実行する
// （postinstall 任せだと、失敗しても「npm install が落ちた」としか出ないため）。
// 手動実行: node scripts/build-rpg-scene.mjs

import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const projectRoot = join(dirname(fileURLToPath(import.meta.url)), "..");

// esbuild は devDependency のため `npm ci --omit=dev` では存在しない。
// ただし生成物 assets/rpg-hub/scene.txt はRPGハブ画面（/rpg-hub）が
// import しており、欠けると Metro がアセットを解決できずビルド自体が失敗する。
// 原因の分かりにくい Metro のエラーにするより、ここで明示的に落とす。
// （このプロジェクトは @babel/core なども devDependency なので、そもそも
//   開発依存なしではアプリをビルドできない。）
let build;
try {
  ({ build } = await import("esbuild"));
} catch {
  console.error(
    "[build-rpg-scene] esbuild が見つかりません。開発依存を含めてインストールしてください" +
      "（npm install --legacy-peer-deps）。RPGハブ画面（/rpg-hub）が " +
      "assets/rpg-hub/scene.txt を参照するため、生成できないとアプリをビルドできません。",
  );
  process.exit(1);
}

const OUT_DIR = join(projectRoot, "assets", "rpg-hub");

/** バンドルするもの。どちらも同じ設定で、別々の1ファイルにする。 */
const ENTRIES = [
  { entry: "scene.ts", out: "scene.txt" },
  { entry: "portrait.ts", out: "portrait.txt" },
];

mkdirSync(OUT_DIR, { recursive: true });

for (const { entry, out } of ENTRIES) {
  // WebView（iOS Safari / Android WebView）で動けばよいので、ブラウザ向けに素直に出す。
  // Babylon 本体は別途 UMD をインラインするため、グローバルの BABYLON を参照する前提で
  // バンドル対象には含めない。
  const result = await build({
    bundle: true,
    entryPoints: [join(projectRoot, "webview", "rpg-hub", entry)],
    format: "iife",
    // 実機の WebView に合わせた下限。Expo Go の対象OSで動く範囲に収める。
    target: ["es2017", "ios13", "chrome80"],
    minify: true,
    write: false,
    logLevel: "warning",
  });

  const [output] = result.outputFiles;
  if (!output) {
    console.error(`[build-rpg-scene] esbuild が ${entry} の出力を返しませんでした。`);
    process.exit(1);
  }

  writeFileSync(join(OUT_DIR, out), output.text, "utf8");

  const kb = (output.text.length / 1024).toFixed(1);
  console.log(`[build-rpg-scene] webview/rpg-hub/${entry} を assets/rpg-hub/${out} に生成しました（${kb} KB）。`);
}
