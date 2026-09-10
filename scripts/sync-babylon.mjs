// babylonjs（ブラウザ用 UMD ビルド）を WebView にオフラインで読み込ませるための
// アセットファイル assets/babylon-spike/babylon.txt を node_modules から生成する。
//
// 生成物はリポジトリにコミットしない（.gitignore 済み）。
// package.json の postinstall から実行され、CI・ローカルとも npm install 時に自動生成される。
// npm install 済みの環境で手動実行したい場合: node scripts/sync-babylon.mjs

import { createRequire } from "node:module";
import { copyFileSync, existsSync, mkdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const require = createRequire(import.meta.url);
const projectRoot = join(dirname(fileURLToPath(import.meta.url)), "..");

const OUT_DIR = join(projectRoot, "assets", "babylon-spike");
const OUT_FILE = join(OUT_DIR, "babylon.txt");

// babylonjs パッケージの UMD エントリを解決する。
// バージョンによりファイル名が変わる可能性があるため候補を順に探す。
const CANDIDATES = ["babylon.js", "babylon.max.js"];

function resolveBabylonUmd() {
  let pkgDir;
  try {
    pkgDir = dirname(require.resolve("babylonjs/package.json"));
  } catch {
    console.warn(
      "[sync-babylon] babylonjs が見つかりません。devDependency に babylonjs が入っているか確認してください。" +
        "Babylon スパイク（/babylon-spike）以外には影響しません。",
    );
    process.exit(0);
  }

  for (const name of CANDIDATES) {
    const candidate = join(pkgDir, name);
    if (existsSync(candidate)) return { path: candidate, name };
  }
  return null;
}

const umd = resolveBabylonUmd();
if (!umd) {
  console.error(
    `[sync-babylon] babylonjs の UMD ビルドが見つかりません（探した候補: ${CANDIDATES.join(", ")}）。` +
      "babylonjs のバージョンを確認し、必要なら scripts/sync-babylon.mjs の CANDIDATES を更新してください。",
  );
  process.exit(1);
}

const { version } = require("babylonjs/package.json");

mkdirSync(OUT_DIR, { recursive: true });
copyFileSync(umd.path, OUT_FILE);

console.log(
  `[sync-babylon] babylonjs@${version} の ${umd.name} を assets/babylon-spike/babylon.txt に生成しました。`,
);
