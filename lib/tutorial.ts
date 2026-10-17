import { PARENT_TUTORIAL_STEPS } from "./tutorialParent.ts";

/** 操作の案内は対象操作で進む。説明だけの手順は指定画面の「次へ」で進む。 */
export type TutorialRole = "parent" | "child";
export type TutorialTownRoute = "tasks" | "bank" | "store" | "board" | "history" | "house" | "exit";
export type TutorialStep = {
  id: string; title: string; text: string; townRoute?: TutorialTownRoute;
  /** 機能の入口と異なる画面で案内する場合のパス。 */
  path?: string;
  /** 保存・承認などを求めず、指定画面で説明を読む手順。 */
  explanation?: { path: string; nextRoute?: string; returnTo?: string; nextLabel?: string };
};

/** 説明文のカタログ。実際に表示する順番と機能の境界は tutorialFeatures.ts で定義する。 */
export const TUTORIAL_STEPS: Record<TutorialRole, readonly TutorialStep[]> = {
  parent: PARENT_TUTORIAL_STEPS,
  child: [
    { id: "town-tasks", townRoute: "tasks", title: "タスクの{建物|たてもの}へ", text: "{町|まち}をなぞると{歩|ある}けるよ。{赤|あか}い{矢印|やじるし}の{方向|ほうこう}にある「タスク」の{建物|たてもの}に{近|ちか}づいて、{赤|あか}い{枠|わく}の「{入|はい}る」を{押|お}そう。{建物|たてもの}を{直接|ちょくせつ}タップしても{入|はい}れるよ。" },
    { id: "child-weekly", title: "タスクの{種類|しゅるい}", text: "{枠|わく}の「ウィークリー」を{押|お}してみよう。{週|しゅう}ごとに{取|と}り{組|く}むタスクがならぶよ。" },
    { id: "child-daily", title: "{毎日|まいにち}のお{手伝|てつだ}い", text: "「デイリー」を{押|お}してみよう。カードを{押|お}すと、やることと{報酬|ほうしゅう}が{見|み}られるよ。ないときは{大人|おとな}に{作|つく}ってもらおう。" },
    { id: "child-tasks-back", title: "ゴルをもらうには", text: "タスクを{受注|じゅちゅう}して、お{手伝|てつだ}いが{終|お}わったら{報告|ほうこく}しよう。{大人|おとな}が{承認|しょうにん}するとゴルがもらえるよ。{今|いま}は「{戻|もど}る」で{町|まち}へ{戻|もど}ろう。" },
    { id: "town-bank", townRoute: "bank", title: "{銀行|ぎんこう}へ{行|い}こう", text: "{赤|あか}い{矢印|やじるし}の{方向|ほうこう}にある「{銀行|ぎんこう}」へ。{近|ちか}づいて{赤|あか}い{枠|わく}の「{入|はい}る」を{押|お}すか、{建物|たてもの}をタップしてね。" },
    { id: "child-bank-back", title: "お{金|かね}をためよう", text: "{銀行|ぎんこう}ではゴルを{預|あず}けたり、{引|ひ}き{出|だ}したりできるよ。おサイフと{預金|よきん}は{別々|べつべつ}のお{金|かね}だよ。{下|した}へスクロールして「{戻|もど}る」を{押|お}そう。" },
    { id: "town-store", townRoute: "store", title: "ストアへ{行|い}こう", text: "{赤|あか}い{矢印|やじるし}の{方向|ほうこう}にある「ストア」へ。{近|ちか}づいて{赤|あか}い{枠|わく}の「{入|はい}る」を{押|お}すか、{建物|たてもの}をタップしてね。" },
    { id: "child-store-back", title: "ゴルを{使|つか}ってみよう", text: "{商品|しょうひん}を{押|お}すと、{説明|せつめい}と{値段|ねだん}が{見|み}られるよ。「{購入|こうにゅう}する」のあとに{確認|かくにん}する{画面|がめん}があるよ。{今|いま}は「{戻|もど}る」で{町|まち}へ{戻|もど}ろう。" },
    { id: "town-board", townRoute: "board", title: "{掲示板|けいじばん}を{見|み}よう", text: "{赤|あか}い{矢印|やじるし}の{方向|ほうこう}にある「{掲示板|けいじばん}」へ。{近|ちか}づいて{赤|あか}い{枠|わく}の「{見|み}る」を{押|お}すか、{掲示板|けいじばん}をタップしてね。" },
    { id: "child-board-back", title: "お{知|し}らせを{確認|かくにん}しよう", text: "{掲示板|けいじばん}では、タスクの{承認|しょうにん}などのお{知|し}らせや、{家族|かぞく}のお{手伝|てつだ}いの{連続|れんぞく}{記録|きろく}が{見|み}られるよ。{赤|あか}い{枠|わく}の「{戻|もど}る」ボタンで{町|まち}へ{戻|もど}ろう。" },
    { id: "town-history", townRoute: "history", title: "{履歴|りれき}の{建物|たてもの}へ", text: "{次|つぎ}は{赤|あか}い{矢印|やじるし}の{方向|ほうこう}にある「{履歴|りれき}」へ。{近|ちか}づいて{赤|あか}い{枠|わく}の「{入|はい}る」を{押|お}すか、{建物|たてもの}をタップしてね。" },
    { id: "child-history-back", title: "ゴルの{動|うご}きを{見|み}よう", text: "ここでは、もらったゴルや{使|つか}ったゴルを{一覧|いちらん}やグラフで{確認|かくにん}できるよ。{赤|あか}い{枠|わく}の「{戻|もど}る」ボタンで{町|まち}へ{戻|もど}ろう。" },
    { id: "town-house", townRoute: "house", title: "{自分|じぶん}の{家|いえ}へ{行|い}こう", text: "{赤|あか}い{矢印|やじるし}の{方向|ほうこう}にある「{自分|じぶん}の{家|いえ}」へ。{近|ちか}づいて{赤|あか}い{枠|わく}の「{入|はい}る」を{押|お}すか、{家|いえ}をタップしてね。" },
    { id: "child-house-back", townRoute: "exit", title: "{自分|じぶん}のお{部屋|へや}", text: "{家|いえ}の{中|なか}も{町|まち}と{同|おな}じように{歩|ある}けるよ。クローゼットに{近|ちか}づくと、きがえができるよ。{今|いま}は{赤|あか}い{矢印|やじるし}の{方向|ほうこう}にある{玄関|げんかん}に{近|ちか}づき、{赤|あか}い{枠|わく}の「そとへ でる」で{町|まち}へ{戻|もど}ろう。" },
    { id: "town-menu", title: "メニューを{開|ひら}こう", text: "{枠|わく}の「☰」を{押|お}そう。キャラえらび・かざる・きがえも、ここからできるよ。" },
    { id: "town-settings", title: "{設定|せってい}へ{行|い}こう", text: "{枠|わく}の「⚙️」を{押|お}してね。この{案内|あんない}をもう{一度|いちど}{見|み}る{場所|ばしょ}を{覚|おぼ}えよう。" },
    { id: "done", title: "{案内|あんない}はおしまい！", text: "{設定|せってい}の「{使|つか}い{方|かた}をもう{一度|いちど}{見|み}る」で、いつでもやり{直|なお}せるよ。お{手伝|てつだ}いをして、ゴルをためてみよう！" },
  ],
};

/**
 * 建物を使ったときに進める案内の手順のID。町の建物は `town-<route>`、家の中の玄関（exit）は
 * 家の中の手順（Issue #444。家の中は町と同じ画面の中にある）。
 * @param route - 使った建物の行き先
 * @returns 手順のID
 */
export function getTutorialBuildingStepId(route: string): string {
  return route === "exit" ? "child-house-back" : `town-${route}`;
}

/** 旧一括案内の保存キー。機能別の履歴は tutorialFeatures.ts のキーを使う。 */
export function tutorialStorageKey(userId: string, role: TutorialRole): string {
  return `tutorial:v1:${role}:${userId}`;
}

/** 旧カタログを使う描画テスト用に、対象操作だけで次の手順へ進める。 */
export function advanceTutorial(role: TutorialRole, index: number, targetId: string): number {
  return TUTORIAL_STEPS[role][index]?.id === targetId
    ? Math.min(index + 1, TUTORIAL_STEPS[role].length - 1)
    : index;
}
