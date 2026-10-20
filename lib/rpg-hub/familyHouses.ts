// 家族一人ひとりの家を、我が家タウンに建てる（Issue #244）。
//
// 家族の人数は家庭ごとに変わるので、マップデータ（TOWN_MAP_OBJECTS）には直書きせず、
// 取得した家族からここで組み立てる。`familyNpcs.ts`（Issue #255）と同じ考え方で、
// Babylon にも Supabase にも依存しない純粋関数だけを置く。
//
// 町はマス（lib/rpg-hub/townGrid.ts、Issue #445）で区切られているため、既存の建物と同じ
// `lotBuilding`（区画4×4マスに置く）・`pathLine`（道を一直線に敷く）をそのまま使う。

import type { MapObject } from "../../types/map";
import { BUILDING_SCALE, BUILDING_Y, doorRow, lotBuilding, pathLine } from "./mapObjects.ts";
import { RPG_HUB_ASSETS } from "./assets.ts";
import { cellRangesOverlap, getBlockedCells, getObjectCells, type CellRange, type TownCell } from "./townGrid.ts";

/** 家の建物が占める区画の大きさ（他の建物と同じ。`BUILDING_LOT_CELLS` ぶん） */
const HOUSE_COLLISION_SIZE = { depth: 2.8, width: 3.4 };

/**
 * 家族の家の区画（南西のマス）。**人数ぶんを空きから探すのではなく、決めた場所を順に割り当てる**
 * （`FAMILY_NPC_POSTS` と同じ理由）。
 *
 * どれも、町の既存の建物の区画・扉の前の行・道・家族NPCの持ち場に重ならない場所
 * （`tests/familyHouses.test.mjs` で確認）。町から北・東・西へ延びる道（`path-out-*`）の
 * 突き当たりの先に置き、家族が増えるごとに町が外へ広がって見えるようにしている
 * （南は自分の家があるため使わない）。
 *
 * **ここに並べた数より家族が多いと、あふれた人は出さない**（自分を除いて3人まで）。
 * 増やすときは、ここに区画を足して `tests/familyHouses.test.mjs` を通す。
 */
export const FAMILY_HOUSE_LOTS: readonly TownCell[] = [
  // path-out-north の突き当たり（列3, 行19-20）のすぐ先
  { col: 3, row: 21 },
  // path-out-east の突き当たり（列13, 行3-4）のすぐ先
  { col: 13, row: 5 },
  // path-out-west の突き当たり（列-15, 行9-10）の近く、重ならない位置
  { col: -21, row: 2 },
];

/** 家の正面に敷く道の枚数。既存の家（自分の家）の前の道と同じ考え方で、短い通路を足す。 */
const FRONT_PATH_TILE_COUNT = 2;

/**
 * その区画に家を建てると、既に置いてある物（既存の建物の区画・扉の前・道・家族NPCの持ち場）と
 * 重なるか（1R0Uさんレビュー指摘：この機能より前に、たまたま区画の位置へ置いてあった物があると、
 * 家を建てたときに入口や前の道へ行けなくなる）。
 *
 * 家自体の区画（4×4マス）だけでなく、扉の前の道（`FRONT_PATH_TILE_COUNT` 枚ぶん）が占めるマスも含める。
 * @param lot - 区画の南西のマス
 * @param blockedRanges - 既に置いてある物が占めるマスの範囲（当たり判定の無い物は渡さない）
 * @returns 重なるなら true
 */
function lotOverlapsBlocked(lot: TownCell, blockedRanges: readonly CellRange[]): boolean {
  const candidateRanges = buildHouseAtLot(lot, "probe").flatMap((object) => getBlockedCells(object));
  return candidateRanges.some((candidate) => blockedRanges.some((blocked) => cellRangesOverlap(candidate, blocked)));
}

/**
 * 1つの区画から、家の建物と、正面に敷く短い道を組み立てる。
 * @param lot - 区画の南西のマス
 * @param ownerId - この家の持ち主の `users.id`
 * @returns 家の建物と道
 */
function buildHouseAtLot(lot: TownCell, ownerId: string): MapObject[] {
  const building = lotBuilding(
    lot,
    {
      collidable: true,
      collisionSize: HOUSE_COLLISION_SIZE,
      // 既存の家（house-building）と同じ、HOUSE_PARTS の扉に合わせた正面オフセット
      entranceOffset: { x: 0, y: 0, z: 1.03 },
      houseOwnerId: ownerId,
      id: `house-family-${ownerId}`,
      interactionRadius: 3,
      interactive: true,
      model: RPG_HUB_ASSETS.house,
      route: "house",
      scale: BUILDING_SCALE,
      type: "building",
    },
    BUILDING_Y,
  );
  const path = pathLine(`path-house-family-${ownerId}`, "z", { col: lot.col, row: doorRow(lot) }, FRONT_PATH_TILE_COUNT);
  return [building, ...path];
}

/**
 * 家族から、家族一人ひとりの家（建物＋正面の道）を組み立てる。
 *
 * - **自分の家は町に元から1棟あるので、ここでは作らない。**
 * - 区画は `members` の並び順に割り当てる。呼び出し側は登録順（`users.created_at`）で
 *   渡すこと（`buildFamilyNpcs` と同じ）。
 * - **置いてある装飾と重なる区画は使わない**（1R0Uさんレビュー指摘）。この機能より前に、
 *   たまたま区画の位置へ飾りを置いていた家庭があると、家を建てたときに入口や前の道へ
 *   行けなくなるため。重なる区画をただ飛ばすので、区画の数より使える場所が減る
 *   （あふれた人を出さないのと同じ扱い）。
 *
 * @param members - 家族（自分を含んでいてよい）
 * @param selfId - 自分の `users.id`
 * @param decorations - 置いてある装飾（省略時は何も置いていない前提）
 * @returns 家族の家（建物＋道）。使える区画より多い人は含まない
 */
export function buildFamilyHouses(
  members: readonly { id: string }[],
  selfId: string | null | undefined,
  decorations: readonly MapObject[] = [],
): MapObject[] {
  const decorationRanges = decorations
    .map((decoration) => getObjectCells(decoration))
    .filter((range): range is NonNullable<typeof range> => range !== null);
  const availableLots = FAMILY_HOUSE_LOTS.filter((lot) => !lotOverlapsBlocked(lot, decorationRanges));
  return members
    .filter((member) => member.id !== selfId)
    .slice(0, availableLots.length)
    .flatMap((member, index) => buildHouseAtLot(availableLots[index], member.id));
}
