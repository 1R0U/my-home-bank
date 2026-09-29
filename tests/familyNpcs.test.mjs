import assert from "node:assert/strict";
import test from "node:test";
import {
  buildFamilyNpcs,
  FAMILY_NPC_POSTS,
  familyDialogueId,
  summarizeFamily,
  toFamilyTownStatus,
} from "../lib/rpg-hub/familyNpcs.ts";
import { buildFamilyDialogue, getDialogue, RICH_BALANCE } from "../lib/rpg-hub/dialogues.ts";
import { INITIAL_MAP_OBJECTS, parseMapObject } from "../lib/rpg-hub/mapObjects.ts";
import { getCollisionHalfExtents, overlapsObject } from "../lib/rpg-hub/movement.ts";
import { RPG_HUB_ASSETS } from "../lib/rpg-hub/assets.ts";

/** 持ち場を全部埋めるだけの家族（自分を含めて1人多い）。 */
const fullFamily = Array.from({ length: FAMILY_NPC_POSTS.length + 1 }, (_, index) => ({
  equipment: {},
  id: `user-${index}`,
  name: `かぞく${index}`,
  palette: {},
}));

/** 自分以外の全員が持ち場に立った状態の家族NPC。 */
const fullNpcs = buildFamilyNpcs(fullFamily, "user-0");

// --- 立ち位置 ---

test("持ち場がすべて埋まる人数でも、自分を除いた全員が立つ", () => {
  assert.equal(fullNpcs.length, FAMILY_NPC_POSTS.length);
});

test("家族NPCは、建物・装飾・住人の当たり判定に重ならない場所に立っている", () => {
  // 重なっていると、その場から歩き出せない（初期マップのNPCと同じ決まり）
  for (const npc of fullNpcs) {
    const overlapping = INITIAL_MAP_OBJECTS.filter((object) =>
      overlapsObject(npc.position.x, npc.position.z, object),
    );
    assert.deepEqual(
      overlapping.map((object) => object.id),
      [],
      `${npc.id}（${npc.position.x}, ${npc.position.z}）が重なっている`,
    );
  }
});

test("家族NPCどうしも重ならない", () => {
  for (const npc of fullNpcs) {
    const overlapping = fullNpcs.filter(
      (other) => other.id !== npc.id && overlapsObject(npc.position.x, npc.position.z, other),
    );
    assert.deepEqual(overlapping.map((object) => object.id), [], `${npc.id} がほかの家族と重なっている`);
  }
});

test("家族NPCは、道のタイルにかからない", () => {
  // 道の上に立つと、道を通るときにすり抜ける幅が狭くなる
  const tiles = INITIAL_MAP_OBJECTS.filter((object) => object.model === RPG_HUB_ASSETS.path);
  const halfTile = 1.8 / 2;

  for (const npc of fullNpcs) {
    const half = getCollisionHalfExtents(npc.collisionSize, 1, npc.rotationY ?? 0);
    const onTile = tiles.filter(
      (tile) =>
        Math.abs(npc.position.x - tile.position.x) < halfTile + half.width &&
        Math.abs(npc.position.z - tile.position.z) < halfTile + half.depth,
    );
    assert.deepEqual(onTile.map((tile) => tile.id), [], `${npc.id} が道にかかっている`);
  }
});

test("家族NPCは、マップデータとして検証を通る", () => {
  for (const npc of fullNpcs) {
    const result = parseMapObject(npc);
    assert.ok(result.success, `${npc.id}: ${result.success ? "" : result.errors.join(", ")}`);
  }
});

// --- 組み立て ---

test("自分のNPCは出さない", () => {
  const npcs = buildFamilyNpcs(
    [
      { equipment: {}, id: "me", name: "わたし", palette: {} },
      { equipment: {}, id: "mom", name: "ママ", palette: {} },
    ],
    "me",
  );

  assert.deepEqual(
    npcs.map((npc) => npc.familyMemberId),
    ["mom"],
  );
});

test("持ち場は渡した順に割り当てる（自分を飛ばして詰める）", () => {
  const npcs = buildFamilyNpcs(
    [
      { equipment: {}, id: "mom", name: "ママ", palette: {} },
      { equipment: {}, id: "me", name: "わたし", palette: {} },
      { equipment: {}, id: "dad", name: "パパ", palette: {} },
    ],
    "me",
  );

  assert.deepEqual(npcs[0].position.x, FAMILY_NPC_POSTS[0].x);
  assert.deepEqual(npcs[0].position.z, FAMILY_NPC_POSTS[0].z);
  assert.deepEqual(npcs[1].position.x, FAMILY_NPC_POSTS[1].x);
  assert.deepEqual(npcs[1].position.z, FAMILY_NPC_POSTS[1].z);
});

test("持ち場より多い家族は、あふれた人を出さない", () => {
  const many = Array.from({ length: FAMILY_NPC_POSTS.length + 3 }, (_, index) => ({
    equipment: {},
    id: `user-${index}`,
    name: `かぞく${index}`,
    palette: {},
  }));

  assert.equal(buildFamilyNpcs(many, "someone-else").length, FAMILY_NPC_POSTS.length);
});

test("家族NPCは、その人のid・名前・色・装備と、家族用の会話IDを持つ", () => {
  const [npc] = buildFamilyNpcs(
    [
      {
        equipment: { head: RPG_HUB_ASSETS.wearableHat },
        id: "mom",
        name: "ママ",
        palette: { accent: "#4a90e2" },
      },
    ],
    "me",
  );

  assert.equal(npc.familyMemberId, "mom");
  assert.equal(npc.name, "ママ");
  assert.equal(npc.dialogueId, familyDialogueId("mom"));
  assert.deepEqual(npc.palette, { accent: "#4a90e2" });
  assert.deepEqual(npc.equipment, { head: RPG_HUB_ASSETS.wearableHat });
  // 形は住人と共通
  assert.equal(npc.model, RPG_HUB_ASSETS.villager);
});

test("何も着ていない家族NPCは、装備を持たない", () => {
  const [npc] = buildFamilyNpcs([{ equipment: {}, id: "mom", name: "ママ", palette: {} }], "me");
  assert.equal("equipment" in npc, false);
});

test("名前が空の家族NPCは「かぞく」と呼ぶ", () => {
  const [npc] = buildFamilyNpcs([{ equipment: {}, id: "mom", name: " ", palette: {} }], "me");
  assert.equal(npc.name, "かぞく");
});

// --- DBの行からまとめる ---

test("summarizeFamilyは、色・装備・クエスト数・残高を人ごとにまとめる", () => {
  const summary = summarizeFamily({
    appearances: [
      { accent_color: "#4a90e2", hair_color: null, skin_color: "#123456", user_id: "kid" },
    ],
    equipped: [
      { asset_id: RPG_HUB_ASSETS.wearableHat, slot: "head", user_id: "kid" },
      { asset_id: "not-in-catalog", slot: "face", user_id: "kid" },
    ],
    quests: [
      { assigned_to: "kid", status: "pending" },
      { assigned_to: "kid", status: "pending" },
      { assigned_to: "kid", status: "accepted" },
      { assigned_to: "kid2", status: "pending" },
    ],
    users: [
      { balance: "120.5", id: "kid", name: "たろう", role: "child" },
      { balance: 0, id: "mom", name: null, role: "parent" },
    ],
  });

  assert.equal(summary.familyPendingQuestCount, 3);
  assert.deepEqual(summary.members[0], {
    acceptedQuestCount: 1,
    balance: 120.5,
    // カタログに無い装備は、その枠を空にする
    equipment: { head: RPG_HUB_ASSETS.wearableHat },
    id: "kid",
    name: "たろう",
    // 候補に無い色（#123456）は含めない（既定色で描く）
    palette: { accent: "#4a90e2" },
    pendingQuestCount: 2,
    role: "child",
  });
  assert.deepEqual(summary.members[1], {
    acceptedQuestCount: 0,
    balance: 0,
    equipment: {},
    id: "mom",
    name: "",
    palette: {},
    pendingQuestCount: 0,
    role: "parent",
  });
});

test("toFamilyTownStatusは、会話に使う状況だけを人ごとに取り出す", () => {
  const status = toFamilyTownStatus({
    familyPendingQuestCount: 2,
    members: [
      {
        acceptedQuestCount: 1,
        balance: 50,
        equipment: {},
        id: "kid",
        name: "たろう",
        palette: {},
        pendingQuestCount: 0,
        role: "child",
      },
    ],
  });

  assert.deepEqual(status, {
    familyPendingQuestCount: 2,
    members: { kid: { acceptedQuestCount: 1, balance: 50, pendingQuestCount: 0, role: "child" } },
  });
});

// --- 会話 ---

const child = (overrides = {}) => ({
  acceptedQuestCount: 0,
  balance: 100,
  pendingQuestCount: 0,
  role: "child",
  ...overrides,
});

const parent = { acceptedQuestCount: 0, balance: 5000, pendingQuestCount: 0, role: "parent" };

test("子供の家族は、承認待ちのクエストがあればその数を話す", () => {
  const lines = buildFamilyDialogue(child({ acceptedQuestCount: 3, pendingQuestCount: 1 }), 1, "child");
  assert.ok(lines.some((line) => line.includes("1こ、承認まち")));
  // 承認待ちが優先で、受注中の数は話さない
  assert.ok(!lines.some((line) => line.includes("うけているよ")));
});

test("子供の家族は、承認待ちが0なら受注中のクエストの数を話す", () => {
  const lines = buildFamilyDialogue(child({ acceptedQuestCount: 2 }), 0, "child");
  assert.ok(lines.some((line) => line.includes("2こ うけている")));
  assert.ok(!lines.some((line) => line.includes("承認まち")));
});

test("子供の家族は、クエストが1つも無ければ、無いと話す", () => {
  const lines = buildFamilyDialogue(child(), 0, "child");
  assert.ok(lines.some((line) => line.includes("クエストが ないんだ")));
});

test("承認待ちの子供の家族は、話しかけたのが親なら確かめてほしいと話す", () => {
  const toParent = buildFamilyDialogue(child({ pendingQuestCount: 1 }), 1, "parent");
  const toChild = buildFamilyDialogue(child({ pendingQuestCount: 1 }), 1, "child");
  assert.ok(toParent.includes("たしかめて くれると うれしいな！"));
  assert.ok(!toChild.includes("たしかめて くれると うれしいな！"));
});

test("お財布残高が0以下なら、からっぽと話す", () => {
  assert.ok(buildFamilyDialogue(child({ balance: 0 }), 0, "child").some((line) => line.includes("からっぽ")));
  assert.ok(buildFamilyDialogue(child({ balance: -5 }), 0, "child").some((line) => line.includes("からっぽ")));
  // 1未満の端数は切り捨てるので、からっぽ扱い
  assert.ok(buildFamilyDialogue(child({ balance: 0.5 }), 0, "child").some((line) => line.includes("からっぽ")));
});

test("お財布残高は、たくさん持っている境目の手前までは額だけを話す", () => {
  const lines = buildFamilyDialogue(child({ balance: RICH_BALANCE - 1 }), 0, "child");
  assert.ok(lines.includes("おさいふには 999ゴル あるよ。"));
});

test("お財布残高が境目ちょうどから、なにを買うか話す", () => {
  const lines = buildFamilyDialogue(child({ balance: RICH_BALANCE }), 0, "child");
  assert.ok(lines.includes("おさいふに 1,000ゴルも あるんだ。なにを かおうかな？"));
});

test("お財布残高の端数は切り捨てて話す", () => {
  const lines = buildFamilyDialogue(child({ balance: 999.9 }), 0, "child");
  assert.ok(lines.includes("おさいふには 999ゴル あるよ。"));
});

test("親の家族は、家族全体の承認待ちの数を話し、お財布残高は話さない", () => {
  const toParent = buildFamilyDialogue(parent, 2, "parent");
  const toChild = buildFamilyDialogue(parent, 2, "child");

  assert.ok(toParent.some((line) => line.includes("承認まちの クエストが 2こ")));
  assert.ok(toChild.some((line) => line.includes("2こ とどいている")));
  for (const line of [...toParent, ...toChild]) assert.ok(!line.includes("ゴル"));
});

test("親の家族は、承認待ちが0ならその旨を話す", () => {
  assert.ok(buildFamilyDialogue(parent, 0, "parent").some((line) => line.includes("承認まちの クエストは ない")));
  assert.ok(!buildFamilyDialogue(parent, 0, "child").some((line) => line.includes("承認まち")));
});

test("getDialogueは、家族の状況から家族NPCの会話を組み立てる", () => {
  const family = { familyPendingQuestCount: 0, members: { kid: child({ acceptedQuestCount: 1 }) } };
  const lines = getDialogue(familyDialogueId("kid"), { family, viewerRole: "parent" });
  assert.deepEqual(lines, buildFamilyDialogue(family.members.kid, 0, "parent"));
});

test("getDialogueは、状況が取れていない家族NPCには null を返し、例外にしない", () => {
  // 画面が代わりの1行を出す
  assert.equal(getDialogue(familyDialogueId("kid")), null);
  assert.equal(
    getDialogue(familyDialogueId("kid"), { family: { familyPendingQuestCount: 0, members: {} } }),
    null,
  );
  // 継承プロパティ名を家族のidとして拾わない
  assert.equal(
    getDialogue(familyDialogueId("toString"), { family: { familyPendingQuestCount: 0, members: {} } }),
    null,
  );
});

test("getDialogueは、家族の状況を添えても住人の会話は表から引く", () => {
  const family = { familyPendingQuestCount: 0, members: {} };
  assert.deepEqual(getDialogue("villager-guide", { family }), getDialogue("villager-guide"));
});
