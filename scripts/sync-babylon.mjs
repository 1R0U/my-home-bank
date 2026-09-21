// babylonjs（ブラウザ用 UMD ビルド）を WebView にオフラインで読み込ませるための
// アセットファイル assets/babylon/babylon.txt を node_modules から生成する。
// RPGハブ（components/rpg-hub-web/）が参照する。
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

const OUT_DIR = join(projectRoot, "assets", "babylon");
const OUT_FILE = join(OUT_DIR, "babylon.txt");

// babylonjs パッケージの UMD エントリを解決する。
// バージョンによりファイル名が変わる可能性があるため候補を順に探す。
const CANDIDATES = ["babylon.js", "babylon.max.js"];

function resolveBabylonUmd() {
  let pkgDir;
  try {
    pkgDir = dirname(require.resolve("babylonjs/package.json"));
  } catch {
    // 生成物 assets/babylon/babylon.txt はRPGハブ画面（/rpg-hub）が import する。
    // 欠けると Metro がアセットを解決できずビルド自体が失敗するため、ここで明示的に落とす。
    console.error(
      "[sync-babylon] babylonjs が見つかりません。開発依存を含めてインストールしてください" +
        "（npm install --legacy-peer-deps）。RPGハブ画面（/rpg-hub）が " +
        "assets/babylon/babylon.txt を参照するため、生成できないとアプリをビルドできません。",
    );
    process.exit(1);
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
  `[sync-babylon] babylonjs@${version} の ${umd.name} を assets/babylon/babylon.txt に生成しました。`,
);
