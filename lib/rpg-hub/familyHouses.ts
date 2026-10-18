// 家族一人ひとりの家を、我が家タウンに建てる（Issue #244）。
//
// 家族の人数は家庭ごとに変わるので、マップデータ（TOWN_MAP_OBJECTS）には直書きせず、
// 取得した家族からここで組み立てる。`familyNpcs.ts`（Issue #255）と同じ考え方で、
// Babylon にも Supabase にも依存しない純粋関数だけを置く。

import type { BuildingMapObject, MapObject } from "../../types/map";
import { BUILDING_SCALE, BUILDING_Y, PATH_TILE_SIZE, pathTile } from "./mapObjects.ts";
import { getCollisionHalfExtents } from "./movement.ts";
import { RPG_HUB_ASSETS } from "./assets.ts";

/** 家の建物の当たり判定（`buildHouseAtPost` と同じ値）。持ち場が使えるか調べるのに使う。 */
const HOUSE_COLLISION_SIZE = { depth: 2.8, width: 3.4 };

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

/**
 * 持ち場の正面（+Z）側に見る範囲。家自体の当たり判定だけでなく、正面の道2枚ぶん先
 * （2枚目の道の先端）までを含む（1R0Uさんレビュー指摘：出口・正面の道の位置を見ておらず、
 * そこに飾りがあると家は建っても扉の前へたどり着けなかった）。
 */
const FRONT_APPROACH_DEPTH = HOUSE_PATH_GAP + PATH_TILE_SIZE + PATH_TILE_SIZE / 2;

/**
 * その持ち場に家を建てると、置いてある装飾（DBに保存された庭の飾り）と重なるか
 * （1R0Uさんレビュー指摘：この機能より前に、たまたま持ち場の位置やその正面の道・出口の
 * 位置へ飾りを置いていた家庭があると、家を建てたときに入口や前の道へ行けなくなる）。
 *
 * 家の後ろ（-Z）は家自体の当たり判定の分だけ、正面（+Z）は出口・正面の道2枚ぶん先まで見る
 * （`FRONT_APPROACH_DEPTH`）。左右（X）は家の幅のまま（正面の道は家と同じ幅の中心に敷くため）。
 * @param post - 持ち場
 * @param decorations - 置いてある装飾（当たり判定の無い物は無視する）
 * @returns 重なるなら true
 */
function postOverlapsDecoration(post: { x: number; z: number }, decorations: readonly MapObject[]): boolean {
  const houseHalf = getCollisionHalfExtents(HOUSE_COLLISION_SIZE, BUILDING_SCALE, 0);
  const backZ = post.z - houseHalf.depth;
  const frontZ = post.z + FRONT_APPROACH_DEPTH;
  return decorations.some((decoration) => {
    if (!decoration.collidable || !decoration.collisionSize) return false;
    const decorationHalf = getCollisionHalfExtents(
      decoration.collisionSize,
      decoration.scale ?? 1,
      decoration.rotationY ?? 0,
    );
    const overlapsX = Math.abs(post.x - decoration.position.x) < houseHalf.width + decorationHalf.width;
    const overlapsZ =
      decoration.position.z + decorationHalf.depth > backZ && decoration.position.z - decorationHalf.depth < frontZ;
    return overlapsX && overlapsZ;
  });
}

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
 * - **置いてある装飾と重なる持ち場は使わない**（1R0Uさんレビュー指摘）。この機能より前に、
 *   たまたまその位置へ飾りを置いていた家庭があると、家を建てたときに入口や前の道へ
 *   行けなくなるため。重なる持ち場をただ飛ばすので、持ち場の数より使える場所が減る
 *   （あふれた人を出さないのと同じ扱い）。
 *
 * @param members - 家族（自分を含んでいてよい）
 * @param selfId - 自分の `users.id`
 * @param decorations - 置いてある装飾（省略時は何も置いていない前提）
 * @returns 家族の家（建物＋道）。使える持ち場より多い人は含まない
 */
export function buildFamilyHouses(
  members: readonly { id: string }[],
  selfId: string | null | undefined,
  decorations: readonly MapObject[] = [],
): MapObject[] {
  const availablePosts = FAMILY_HOUSE_POSTS.filter((post) => !postOverlapsDecoration(post, decorations));
  return members
    .filter((member) => member.id !== selfId)
    .slice(0, availablePosts.length)
    .flatMap((member, index) => buildHouseAtPost(availablePosts[index], member.id));
}
