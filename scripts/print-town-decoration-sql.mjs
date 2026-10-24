// 我が家タウンに最初からある飾りの一覧（lib/rpg-hub/mapObjects.ts の TOWN_DECORATION_ASSETS）を、
// house_furniture_items へ入れるSQLとして標準出力へ書き出す（Issue #509）。
//
// 散らした自然物の id は決まった種の擬似乱数で作るので、手で書き写さずにこのスクリプトで書き出す。
// 使い方: `npm run town-decorations:sql`（出力をマイグレーションへ貼る）。
// DBとアプリの一覧がずれていないかは tests/townDecorations.test.mjs が確かめる。

import { pathToFileURL } from "node:url";
import { TOWN_DECORATION_ASSETS } from "../lib/rpg-hub/mapObjects.ts";

/**
 * 町の飾りの一覧を、house_furniture_items へ入れる insert 文にする。
 * @param {Readonly<Record<string, string>>} assets - 飾りのidと、しまったときに入る装飾
 * @returns {string} SQL
 */
export function formatTownDecorationInsert(assets) {
  const rows = Object.entries(assets)
    .sort((a, b) => a[0].localeCompare(b[0]))
    .map((entry) => `('${entry[0]}', '${entry[1]}')`);
  return [
    "insert into public.house_furniture_items(furniture_id, stored_asset_id) values",
    `${rows.join(",\n")};`,
  ].join("\n");
}

if (import.meta.url === pathToFileURL(process.argv[1]).href) {
  process.stdout.write(`${formatTownDecorationInsert(TOWN_DECORATION_ASSETS)}\n`);
}
