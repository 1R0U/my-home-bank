// RPGハブのNPCが話す内容。
//
// いまは定数として持つ。Supabase へ移すのは、内容が固まって「親が編集したい」と
// なってからでよい（Issue #196 の設計方針）。
//
// 【家族のキャラクターを出すときの想定】
// NpcMapObject には familyMemberId（users.id）を持たせてある。家族の状況に応じた会話を
// 出すときは、この表を引く代わりに、その人のクエスト数や残高から行を組み立てる関数へ
// 差し替える。呼び出し側（RpgHubScreen）は「IDを渡すと行の配列が返る」ことだけに
// 依存しているので、getDialogue の中身を変えれば画面側は触らずに済む。

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
 * dialogueId に対応する会話の行を返す。
 *
 * 未知のIDでも例外にせず null を返す。マップデータ側だけが更新されて会話が
 * 追いついていない場合に、画面が壊れるのを避けるため。
 * @param dialogueId - 会話データのID
 * @returns 表示する行の配列。未知のIDの場合は null
 */
export function getDialogue(dialogueId: string): DialogueLines | null {
  if (!Object.hasOwn(DIALOGUES, dialogueId)) return null;
  return DIALOGUES[dialogueId];
}
