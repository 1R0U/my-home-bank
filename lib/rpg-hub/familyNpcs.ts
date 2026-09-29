// 家族一人ひとりを、我が家タウンのNPCとして立たせる（Issue #255）。
//
// 家族の人数は家庭ごとに変わるので、マップデータ（INITIAL_MAP_OBJECTS）には直書きせず、
// 取得した家族からここで組み立てる。Babylon にも Supabase にも依存しない純粋関数だけを置き、
// `node --test` で検証できるようにしている（取得は lib/familyTownService.ts）。

import type { NpcMapObject } from "../../types/map";
import type { UserRole } from "../../types";
import type { EquipmentMap } from "./equipment.ts";
import { createNpc } from "./mapObjects.ts";
import { isValidPaletteColor, type Palette } from "./palette.ts";
import { toEquipment, toOwnedWearables, type EquippedItemRow } from "./wardrobe.ts";

/**
 * 家族NPCの持ち場。**人数ぶんを空きから探すのではなく、決めた場所を順に割り当てる。**
 *
 * 空きを探すやり方だと、町のレイアウトを少し動かしただけで立ち位置が変わり、
 * どこに重なるかをテストで押さえにくい。固定しておけば、ここに並べた場所だけを
 * テスト（tests/familyNpcs.test.mjs）で確かめれば済む。
 *
 * どれも「建物・装飾・住人の当たり判定に重ならず、道のタイルにもかからない」場所。
 * 道の上に立たせると、道の幅（1.8）からNPCの幅（0.7）を引いた残りをすり抜けることになり、
 * 通りにくくなるため。並びは出発地点(0, 0)から見つけやすい順。
 *
 * 向き（rotationY）は住人と同じく 0 前後にする（顔は +Z 向き。mapObjects.ts の createNpc 参照）。
 *
 * **ここに並べた数より家族が多いと、あふれた人は出さない**（自分を除いて6人まで）。
 * 増やすときは、ここに持ち場を足してテストを通す。
 */
export const FAMILY_NPC_POSTS: readonly { rotationY: number; x: number; z: number }[] = [
  // クエストと履歴のあいだ、南の道の北側。中央の道（+X側）へ少し振る
  { rotationY: 0.4, x: -5.4, z: 1.2 },
  // 銀行とストアのあいだ、南の道の北側。中央の道（-X側）へ少し振る
  { rotationY: -0.4, x: 5.4, z: 1.2 },
  // クエストの建物の東どなり（南の道の南側）
  { rotationY: 0.3, x: -2, z: -5 },
  // 銀行の建物の西どなり（南の道の南側）
  { rotationY: -0.3, x: 2, z: -5 },
  // 履歴の建物の裏手、北の道の北側
  { rotationY: 0.2, x: -4.4, z: 10.6 },
  // ストアの建物の裏手、北の道の北側（みせばんの西どなり）
  { rotationY: -0.2, x: 3.4, z: 11.4 },
];

/** 家族NPCの会話ID（`NpcMapObject.dialogueId`）の頭につける文字列。 */
export const FAMILY_DIALOGUE_PREFIX = "family:";

/**
 * 家族NPCの会話IDを作る。会話の中身は `getDialogue` が家族の状況から組み立てる。
 * @param userId - その人の `users.id`
 * @returns 会話ID
 */
export function familyDialogueId(userId: string): string {
  return `${FAMILY_DIALOGUE_PREFIX}${userId}`;
}

/**
 * 会話を組み立てるのに使う、家族1人の状況。
 *
 * クエストの数は**その人に割り当てられている（`quests.assigned_to`）もの**を数える。
 */
export type FamilyMemberStatus = {
  /** 受注したまま、まだ完了申請していないクエストの数（`Quest.status` が `accepted`） */
  acceptedQuestCount: number;
  /** お財布残高（`users.balance`） */
  balance: number;
  /** 完了申請を出して承認待ちのクエストの数（`Quest.status` が `pending`） */
  pendingQuestCount: number;
  role: UserRole;
};

/** 家族1人ぶん。見た目（NPCを組み立てる）と状況（会話を組み立てる）を合わせて持つ。 */
export type FamilyMember = FamilyMemberStatus & {
  equipment: EquipmentMap;
  id: string;
  name: string;
  palette: Palette;
};

/** 家族全体の状況。家族NPCの会話を組み立てるときに、画面から渡す。 */
export type FamilyTownStatus = {
  /** 家族のうち、承認待ち（`Quest.status` が `pending`）のクエストの数。親の会話に使う */
  familyPendingQuestCount: number;
  /** `users.id` → その人の状況 */
  members: Readonly<Record<string, FamilyMemberStatus>>;
};

/** 家族全体の状況が取れていないとき（取得前・モックアカウント）に使う空の状況。 */
export const EMPTY_FAMILY_TOWN_STATUS: FamilyTownStatus = {
  familyPendingQuestCount: 0,
  members: {},
};

/**
 * 家族からNPCを組み立てる。
 *
 * - **自分はプレイヤーとして操作しているので、自分のNPCは出さない。**
 * - 持ち場は `members` の並び順に割り当てる。呼び出し側は登録順（`users.created_at`）で
 *   渡すこと。並びが毎回変わると、開くたびに家族の立ち位置が入れ替わる。
 * - 形は住人と同じ（VILLAGER_PARTS 共通）。色と装備だけを1人ずつ変える。
 *
 * @param members - 家族（自分を含んでいてよい）
 * @param selfId - 自分の `users.id`
 * @returns 家族NPC。持ち場より多い人は含まない
 */
export function buildFamilyNpcs(
  members: readonly Pick<FamilyMember, "equipment" | "id" | "name" | "palette">[],
  selfId: string | null | undefined,
): NpcMapObject[] {
  return members
    .filter((member) => member.id !== selfId)
    .slice(0, FAMILY_NPC_POSTS.length)
    .map((member, index) => {
      const post = FAMILY_NPC_POSTS[index];
      const npc = createNpc({
        dialogueId: familyDialogueId(member.id),
        familyMemberId: member.id,
        id: `npc-family-${member.id}`,
        // 名前が空だと「とはなす」だけが出るので、呼び名を補う
        name: member.name.trim() === "" ? "かぞく" : member.name,
        palette: member.palette,
        rotationY: post.rotationY,
        x: post.x,
        z: post.z,
      });
      return Object.keys(member.equipment).length === 0
        ? npc
        : { ...npc, equipment: member.equipment };
    });
}

/** `users` から取る列。 */
export type FamilyUserRow = {
  balance: number | string | null;
  id: string;
  name: string | null;
  role: string;
};

/** `character_appearances` から取る列。 */
export type FamilyAppearanceRow = {
  accent_color: string | null;
  hair_color: string | null;
  skin_color: string | null;
  user_id: string;
};

/** `equipped_items` から取る列。 */
export type FamilyEquippedRow = EquippedItemRow & { user_id: string };

/** `quests` から取る列。 */
export type FamilyQuestRow = { assigned_to: string | null; status: string };

/**
 * DBから取った行を、家族1人ずつの見た目と状況へまとめる。
 *
 * **DBは外から来るデータとして扱う。** 候補に無い色は含めず（既定色で描く）、
 * カタログに無い装備はその枠を空にする（`toEquipment` と同じ扱い）。1件のせいで
 * 家族が出なくなるのが一番まずい。
 *
 * 装備は「持っているものしか装備できない」ことをDBの外部キーが担保しているので、
 * ほかの人の所有（`owned_items`、本人しか読めない）は見ず、装備の行だけで組み立てる。
 *
 * @param rows - 取得した行
 * @returns 家族（`users` の並び順）と、家族全体の承認待ちクエスト数
 */
export function summarizeFamily(rows: {
  appearances: readonly FamilyAppearanceRow[];
  equipped: readonly FamilyEquippedRow[];
  quests: readonly FamilyQuestRow[];
  users: readonly FamilyUserRow[];
}): { familyPendingQuestCount: number; members: FamilyMember[] } {
  const countQuests = (userId: string, status: string) =>
    rows.quests.filter((quest) => quest.assigned_to === userId && quest.status === status).length;

  const members = rows.users.map((user): FamilyMember => {
    const appearance = rows.appearances.find((row) => row.user_id === user.id);
    const palette: Palette = {};
    if (appearance) {
      if (isValidPaletteColor(appearance.accent_color)) palette.accent = appearance.accent_color;
      if (isValidPaletteColor(appearance.hair_color)) palette.hair = appearance.hair_color;
      if (isValidPaletteColor(appearance.skin_color)) palette.skin = appearance.skin_color;
    }

    const equippedRows = rows.equipped.filter((row) => row.user_id === user.id);
    const equipment = toEquipment(equippedRows, toOwnedWearables(equippedRows).assetIds).equipment;

    // users.balance は numeric。文字列で返ってきても数として扱う
    const balance = Number(user.balance ?? 0);

    return {
      acceptedQuestCount: countQuests(user.id, "accepted"),
      balance: Number.isFinite(balance) ? balance : 0,
      equipment,
      id: user.id,
      name: user.name ?? "",
      palette,
      pendingQuestCount: countQuests(user.id, "pending"),
      role: user.role === "parent" ? "parent" : "child",
    };
  });

  return {
    familyPendingQuestCount: rows.quests.filter((quest) => quest.status === "pending").length,
    members,
  };
}

/**
 * 家族から、会話に使う状況だけを取り出す。
 * @param summary - `summarizeFamily` の結果
 * @returns 家族全体の状況
 */
export function toFamilyTownStatus(summary: {
  familyPendingQuestCount: number;
  members: readonly FamilyMember[];
}): FamilyTownStatus {
  const members: Record<string, FamilyMemberStatus> = {};
  for (const member of summary.members) {
    members[member.id] = {
      acceptedQuestCount: member.acceptedQuestCount,
      balance: member.balance,
      pendingQuestCount: member.pendingQuestCount,
      role: member.role,
    };
  }
  return { familyPendingQuestCount: summary.familyPendingQuestCount, members };
}
