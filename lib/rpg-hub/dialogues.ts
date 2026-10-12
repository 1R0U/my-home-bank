// RPGハブのNPCが話す内容。
//
// 町の住人の会話は定数として持つ。Supabase へ移すのは、内容が固まって「親が編集したい」と
// なってからでよい（Issue #196 の設計方針）。
//
// 家族のNPC（Issue #255）は、表を引く代わりに、その人のクエスト数や残高から行を組み立てる
// （`buildFamilyDialogue`）。呼び出し側（RpgHubScreen）は「IDを渡すと行の配列が返る」ことに
// 依存しているので、家族の状況を添えて `getDialogue` を呼ぶだけで済む。

import type { UserRole } from "../../types";
import { formatGolForSpeech } from "../amount.ts";
import {
  EMPTY_FAMILY_TOWN_STATUS,
  FAMILY_DIALOGUE_PREFIX,
  type FamilyMemberStatus,
  type FamilyTownStatus,
} from "./familyNpcs.ts";

/** 1回の会話で表示する行。1行ずつ送って読ませる。 */
export type DialogueLines = readonly string[];

/**
 * dialogueId から表示する行を引く表。
 *
 * 分岐・選択肢は持たない（Issue #196 の「やらないこと」）。
 * 1体につき数行までにとどめ、読み終わったら閉じる一方通行にしている。
 */
const DIALOGUES: Record<string, DialogueLines> = {
  "villager-guide": [
    "ようこそ、我が家タウンへ！",
    "道なりに進むと、4つの建物にたどりつくよ。",
    "おてつだいをこなすと、お金がもらえるんだ。",
  ],
  "villager-shopkeeper": [
    "ストアはこの先だよ。",
    "ほしいものがあったら、おうちの人に相談してみてね。",
  ],
};

/**
 * 「たくさん持っている」とみなすお財布残高（ゴル）。これ以上で話す内容を変える。
 * 家庭ごとの物価の差までは見ていない。目安として、ストアの品が1つ買えそうな額にしている。
 */
export const RICH_BALANCE = 1000;

/** 家族NPCの会話を組み立てるときに添える情報。 */
export type DialogueContext = {
  /** 家族全体の状況。無い（取得前など）ときは家族NPCの会話が組み立てられず null になる */
  family?: FamilyTownStatus;
  /** 話しかけている人（プレイヤー）のロール。同じ状況でも、親と子で言い方を変える */
  viewerRole?: UserRole;
};

/**
 * お財布残高について話す1行。子供の家族NPCだけが話す。
 * @param balance - お財布残高
 * @returns 表示する1行
 */
function balanceLine(balance: number): string {
  // 小数が入りうる（users.balance は numeric）。持っている額を多く見せないよう切り捨てる
  const amount = Math.floor(balance);
  if (amount <= 0) return "おさいふは からっぽ…。おてつだい しなくちゃ！";
  if (amount >= RICH_BALANCE) {
    return `おさいふに ${formatGolForSpeech(amount)}も あるんだ。なにを かおうかな？`;
  }
  return `おさいふには ${formatGolForSpeech(amount)} あるよ。`;
}

/**
 * 家族1人の状況から、そのNPCが話す行を組み立てる。
 *
 * - **子供**は、自分のクエスト（承認待ち → 受注中 → 無し の順に1つ）とお財布残高を話す。
 * - **親**は、家族全体の承認待ちクエストの数を話す。お財布残高は話さない
 *   （親の残高を話題にする場面が思いつかないため）。
 *
 * 分岐・選択肢は持たない（住人の会話と同じく、読み終わったら閉じる一方通行）。
 * @param member - そのNPCが表す家族の状況
 * @param familyPendingQuestCount - 家族全体の承認待ちクエストの数
 * @param viewerRole - 話しかけている人のロール
 * @returns 表示する行
 */
export function buildFamilyDialogue(
  member: FamilyMemberStatus,
  familyPendingQuestCount: number,
  viewerRole: UserRole | undefined,
): DialogueLines {
  if (member.role === "parent") {
    if (familyPendingQuestCount > 0) {
      return viewerRole === "parent"
        ? [
            "おつかれさま！",
            `承認まちの クエストが ${familyPendingQuestCount}こ あるよ。`,
            "クエストの たてもので たしかめておこうか。",
          ]
        : [
            "おてつだい ありがとう！",
            `おわった クエストの ほうこくが ${familyPendingQuestCount}こ とどいているよ。`,
            "あとで ちゃんと みておくね。",
          ];
    }
    return viewerRole === "parent"
      ? ["おつかれさま！", "いまは 承認まちの クエストは ないよ。", "あたらしい クエストを だしてみようか。"]
      : ["きょうも げんきだね！", "クエストの たてものに、おてつだいが ないか みてみてね。"];
  }

  const lines = ["やっほー！"];
  if (member.pendingQuestCount > 0) {
    lines.push(`おわった クエストが ${member.pendingQuestCount}こ、承認まちなんだ。`);
    lines.push(viewerRole === "parent" ? "たしかめて くれると うれしいな！" : "はやく みてもらえると いいな。");
  } else if (member.acceptedQuestCount > 0) {
    lines.push(`いま クエストを ${member.acceptedQuestCount}こ うけているよ。がんばるぞ！`);
  } else {
    lines.push("いまは うけている クエストが ないんだ。なにか さがしに いこうかな。");
  }
  lines.push(balanceLine(member.balance));
  return lines;
}

/**
 * dialogueId に対応する会話の行を返す。
 *
 * 未知のIDでも例外にせず null を返す。マップデータ側だけが更新されて会話が
 * 追いついていない場合に、画面が壊れるのを避けるため。家族NPCで、その人の状況が
 * まだ取れていない場合も同じく null を返す（画面が代わりの1行を出す）。
 * @param dialogueId - 会話データのID
 * @param context - 家族NPCの会話を組み立てるための情報。住人の会話では使わない
 * @returns 表示する行の配列。組み立てられない場合は null
 */
export function getDialogue(dialogueId: string, context: DialogueContext = {}): DialogueLines | null {
  if (dialogueId.startsWith(FAMILY_DIALOGUE_PREFIX)) {
    const family = context.family ?? EMPTY_FAMILY_TOWN_STATUS;
    const userId = dialogueId.slice(FAMILY_DIALOGUE_PREFIX.length);
    if (!Object.hasOwn(family.members, userId)) return null;
    return buildFamilyDialogue(family.members[userId], family.familyPendingQuestCount, context.viewerRole);
  }

  if (!Object.hasOwn(DIALOGUES, dialogueId)) return null;
  return DIALOGUES[dialogueId];
}
