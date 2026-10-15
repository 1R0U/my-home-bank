// 家族一人ひとりの家を、我が家タウンに建てる（Issue #244）。
//
// 家族の人数は家庭ごとに変わるので、マップデータ（TOWN_MAP_OBJECTS）には直書きせず、
// 取得した家族からここで組み立てる。`familyNpcs.ts`（Issue #255）と同じ考え方で、
// Babylon にも Supabase にも依存しない純粋関数だけを置く。

import type { BuildingMapObject, MapObject } from "../../types/map";
import { BUILDING_SCALE, BUILDING_Y, pathTile } from "./mapObjects.ts";
import { RPG_HUB_ASSETS } from "./assets.ts";

/**
 * 家族の家の持ち場。**人数ぶんを空きから探すのではなく、決めた場所を順に割り当てる**
 * （`FAMILY_NPC_POSTS` と同じ理由）。
 *
 * どれも、既存の建物・NPCの持ち場・装飾（散らした自然物も含む）の当たり判定に重ならない場所
 * （`tests/familyHouses.test.mjs` で確認）。家の正面（+Z側、既存の家と同じ扉の向き）に
 * 短い道を2枚ぶん足し、町から道が増えて見えるようにする（ユーザー要望）。
 *
 * **ここに並べた数より家族が多いと、あふれた人は出さない**（自分を除いて3人まで）。
 * 増やすときは、ここに持ち場を足して `tests/familyHouses.test.mjs` を通す。
 */
export const FAMILY_HOUSE_POSTS: readonly { x: number; z: number }[] = [
  { x: -11, z: -14 },
  { x: 4, z: -13 },
  { x: 12, z: 8 },
];

/** 道との間に空ける、家の正面からの距離（既存の家と路地の間隔と同じ）。 */
const HOUSE_PATH_GAP = 2;

/** 道のタイル1枚の一辺（`mapObjects.ts` の `PATH_TILE_SIZE` と同じ値）。 */
const PATH_TILE_SIZE = 1.8;

/**
 * 1つの持ち場から、家の建物と、正面に伸ばす短い道（2枚）を組み立てる。
 * @param post - 持ち場
 * @param ownerId - この家の持ち主の `users.id`
 * @returns 家の建物と道
 */
function buildHouseAtPost(post: { x: number; z: number }, ownerId: string): MapObject[] {
  const building: BuildingMapObject = {
    collidable: true,
    collisionSize: { depth: 2.8, width: 3.4 },
    // 既存の家（house-building）と同じ、HOUSE_PARTS の扉に合わせた正面オフセット
    entranceOffset: { x: 0, y: 0, z: 1.03 },
    houseOwnerId: ownerId,
    id: `house-family-${ownerId}`,
    interactionRadius: 3,
    interactive: true,
    model: RPG_HUB_ASSETS.house,
    position: { x: post.x, y: BUILDING_Y, z: post.z },
    scale: BUILDING_SCALE,
    route: "house",
    type: "building",
  };
  return [
    building,
    pathTile(`path-house-family-${ownerId}-0`, post.x, post.z + HOUSE_PATH_GAP),
    pathTile(`path-house-family-${ownerId}-1`, post.x, post.z + HOUSE_PATH_GAP + PATH_TILE_SIZE),
  ];
}

/**
 * 家族から、家族一人ひとりの家（建物＋正面の道）を組み立てる。
 *
 * - **自分の家は町に元から1棟あるので、ここでは作らない。**
 * - 持ち場は `members` の並び順に割り当てる。呼び出し側は登録順（`users.created_at`）で
 *   渡すこと（`buildFamilyNpcs` と同じ）。
 *
 * @param members - 家族（自分を含んでいてよい）
 * @param selfId - 自分の `users.id`
 * @returns 家族の家（建物＋道）。持ち場より多い人は含まない
 */
export function buildFamilyHouses(
  members: readonly { id: string }[],
  selfId: string | null | undefined,
): MapObject[] {
  return members
    .filter((member) => member.id !== selfId)
    .slice(0, FAMILY_HOUSE_POSTS.length)
    .flatMap((member, index) => buildHouseAtPost(FAMILY_HOUSE_POSTS[index], member.id));
}
