import { TUTORIAL_STEPS, type TutorialRole, type TutorialStep } from "./tutorial.ts";

export type TutorialFeature = "home" | "family" | "tasks" | "store" | "economy" | "loans" | "savings" | "history" | "balance" | "board" | "town" | "house" | "bank" | "settings";
export type FeatureTutorial = { id: TutorialFeature; label: string; path: string; steps: readonly TutorialStep[] };

/** 既存の説明を機能ごとにまとめる。画面を巡るためだけの手順は含めない。 */
function select(role: TutorialRole, ...ids: string[]): TutorialStep[] {
  return ids.map((id) => {
    const step = TUTORIAL_STEPS[role].find((candidate) => candidate.id === id);
    if (!step) throw new Error(`案内の手順がありません: ${role}/${id}`);
    return step;
  });
}
/** 実データを変更せず、指定画面で説明を読んで進む手順を作る。 */
const explain = (id: string, title: string, text: string, path: string): TutorialStep => ({ id, title, text, explanation: { path } });
const family = [
  ...select("parent", "parent-settings-family"),
  explain("parent-family-add", "子供を追加する", "「家族の子供」で名前を入力し、追加ボタンを押すと子供アカウントを作れます。すでに追加した子供もここに表示されます。今回は追加せず、説明だけで進めます。", "/settings"),
  explain("parent-family-code", "子供の端末でログイン", "子供のログインコードを発行し、子供の端末の「こどもはこちら」で入力します。コードは8文字・10分間・1回限りです。再発行すると前のコードは使えません。新しい端末でログインすると以前の端末は使えなくなります。今回は発行しなくても完了できます。", "/settings"),
];
/** 最後の説明と同じ画面に終了手順を足し、一つの機能の案内を定義する。 */
function feature(id: TutorialFeature, label: string, path: string, steps: TutorialStep[]): FeatureTutorial {
  const last = steps[steps.length - 1];
  return { id, label, path, steps: [...steps, {
    id: "done", title: "案内はおしまい", text: "この機能の案内はここまでです。設定の「使い方をもう一度見る」から、機能を選んで見直せます。",
    path: last.path ?? last.explanation?.path ?? path,
  }] };
}

const bankText = "銀行ではお財布のゴルを預けたり、預金から引き出したりできます。お財布と手動の預金、自動積立預金は別のお金です。今回は入出金せずに案内を終えられます。";

export const FEATURE_TUTORIALS: Record<TutorialRole, readonly FeatureTutorial[]> = {
  parent: [
    feature("home", "ホームと子供の追加", "/main-adult", [
      ...select("parent", "parent-home-summary"),
      { ...select("parent", "parent-settings")[0], path: "/main-adult", text: "最初に子供の追加方法を確認しましょう。ホーム右上の枠の歯車ボタンで設定を開いてください。" },
      ...family.map((step) => ({ ...step, path: "/settings" })),
    ]),
    feature("family", "子供の追加・ログイン", "/settings", family),
    feature("tasks", "タスク", "/tasks-adult", select("parent", "parent-daily", "parent-create", "parent-form-close", "parent-approval", "parent-weekly", "parent-limited", "parent-task-summary")),
    feature("store", "ストア", "/store-adult", select("parent", "parent-store-list", "parent-store-manage", "parent-store-requests", "parent-store-summary")),
    feature("economy", "経済", "/loan-adult", [
      ...select("parent", "parent-economy-treasury", "parent-economy-price"),
      explain("parent-economy-loans", "ローンの概要と管理", "ローン欄で承認待ち・契約中・延滞や、元本・利息・返済済み額・残りを確認できます。「申請・契約・設定を管理」から管理画面を開いたときに、詳しい使い方を案内します。", "/loan-adult"),
      ...select("parent", "parent-economy-log"),
    ]),
    feature("loans", "ローン管理", "/loan-management", [
      ...select("parent", "parent-loan-approval", "parent-loan-status", "parent-loan-settings"),
      explain("parent-loan-summary", "子供ごとのローン条件", "子供ごとに個人限度額・月利・標準返済期限を設定できます。今回は保存しません。自動積立預金の設定は、積立画面を開いたときに案内します。", "/loan-management"),
    ]),
    feature("savings", "自動積立預金", "/savings", [{ ...select("parent", "parent-savings-summary")[0], explanation: { path: "/savings" } }]),
    feature("history", "履歴", "/history", select("parent", "parent-history-period", "parent-history-summary")),
    feature("balance", "所持金の詳細", "/balance-adult", [
      ...select("parent", "parent-balance-deposit", "parent-balance-loan"),
      explain("parent-balance-summary", "実際の契約を管理するには", "この画面の一覧はサンプル表示です。実際の家族の残高や契約・条件は、経済画面で確認してください。", "/balance-adult"),
    ]),
    feature("board", "掲示板", "/notifications", [explain("parent-board-summary", "掲示板の使い方", "お知らせは未読・既読で切り替えられ、押すと既読になります。関係する画面があれば開けます。「すべて既読にする」や、家族のお手伝いの連続記録も確認できます。", "/notifications")]),
    feature("town", "町", "/rpg-hub", [
      ...select("parent", "parent-town-summary"),
      explain("parent-town-customize", "キャラクターと自分の家", "右上のメニューからキャラえらび・かざる・きがえ・設定を開けます。キャラの種類や色を選び、持っている装備を着けたり町に装飾を置いたりできます。自分の家の使い方は、家へ入ったときに案内します。", "/rpg-hub"),
    ]),
    feature("house", "自分の家", "/rpg-hub", [explain("parent-house-summary", "自分の家の使い方", "家の中も町と同じように歩けます。クローゼットに近づくと、きがえができます。玄関の「そとへ でる」で町へ戻れます。", "/rpg-hub")]),
    feature("bank", "銀行", "/bank", [explain("parent-bank-summary", "銀行の使い方", bankText, "/bank")]),
    feature("settings", "設定", "/settings", [
      ...select("parent", "parent-settings-profile"),
      { id: "parent-settings-other", title: "その他を開く", text: "枠の「その他」を押してください。通知とアプリ情報を確認できます。" },
      ...select("parent", "parent-settings-credits", "parent-settings-summary"),
    ]),
  ],
  child: [
    feature("town", "{町|まち}", "/rpg-hub", [
      explain("child-town-summary", "{町|まち}を{歩|ある}こう", "{町|まち}をなぞると{歩|ある}けるよ。{建物|たてもの}に{近|ちか}づいて「{入|はい}る／{見|み}る」を{押|お}すか、{建物|たてもの}をタップしてね。ミニマップから{地図|ちず}を{開|ひら}き、{建物|たてもの}を{選|えら}ぶとワープもできるよ。{使|つか}い{方|かた}は、それぞれの{画面|がめん}を{開|ひら}いたときに{案内|あんない}するよ。", "/rpg-hub"),
      ...select("child", "town-menu"),
      explain("child-town-menu", "メニューの{使|つか}い{方|かた}", "キャラえらび・かざる・きがえ・{設定|せってい}を{開|ひら}けるよ。{設定|せってい}の「{使|つか}い{方|かた}をもう{一度|いちど}{見|み}る」で、{見|み}たい{機能|きのう}の{案内|あんない}を{選|えら}べるよ。", "/rpg-hub"),
    ]),
    feature("tasks", "タスク", "/tasks-child", [
      ...select("child", "child-weekly", "child-daily"),
      explain("child-tasks-summary", "ゴルをもらうには", "タスクを{受注|じゅちゅう}して、お{手伝|てつだ}いが{終|お}わったら{報告|ほうこく}しよう。{大人|おとな}が{承認|しょうにん}するとゴルがもらえるよ。タスクがないときは{大人|おとな}に{作|つく}ってもらおう。", "/tasks-child"),
    ]),
    feature("bank", "{銀行|ぎんこう}", "/bank", [explain("child-bank-summary", "お{金|かね}をためよう", "{銀行|ぎんこう}ではゴルを{預|あず}けたり、{引|ひ}き{出|だ}したりできるよ。おサイフと{預金|よきん}は{別々|べつべつ}のお{金|かね}だよ。{今|いま}は{説明|せつめい}を{読|よ}むだけでだいじょうぶ！", "/bank")]),
    feature("store", "ストア", "/store-child", [explain("child-store-summary", "ゴルを{使|つか}おう", "{商品|しょうひん}を{押|お}すと、{説明|せつめい}と{値段|ねだん}が{見|み}られるよ。「{購入|こうにゅう}する」のあとに{確認|かくにん}{画面|がめん}があるよ。{今|いま}は{買|か}わずに{案内|あんない}を{終|お}えられるよ。", "/store-child")]),
    feature("board", "{掲示板|けいじばん}", "/notifications", [explain("child-board-summary", "お{知|し}らせを{確認|かくにん}しよう", "タスクの{承認|しょうにん}などのお{知|し}らせや、{家族|かぞく}のお{手伝|てつだ}いの{連続|れんぞく}{記録|きろく}が{見|み}られるよ。", "/notifications")]),
    feature("history", "{履歴|りれき}", "/history", [explain("child-history-summary", "ゴルの{動|うご}きを{見|み}よう", "もらったゴルや{使|つか}ったゴルを、{一覧|いちらん}やグラフで{確認|かくにん}できるよ。", "/history")]),
    feature("house", "{自分|じぶん}の{家|いえ}", "/rpg-hub", [explain("child-house-summary", "{自分|じぶん}のお{部屋|へや}", "{家|いえ}の{中|なか}も{町|まち}と{同|おな}じように{歩|ある}けるよ。クローゼットに{近|ちか}づくと、きがえができるよ。{玄関|げんかん}の「そとへ でる」で{町|まち}へ{戻|もど}れるよ。", "/rpg-hub")]),
    feature("settings", "{設定|せってい}", "/settings", [explain("child-settings-summary", "{設定|せってい}の{使|つか}い{方|かた}", "{名前|なまえ}やプロフィール、お{知|し}らせの{設定|せってい}を{変|か}えられるよ。「{使|つか}い{方|かた}をもう{一度|いちど}{見|み}る」で、{機能|きのう}ごとの{案内|あんない}を{選|えら}んでね。{今|いま}は{保存|ほぞん}せずに{終|お}えられるよ。", "/settings")]),
    feature("savings", "{自動|じどう}{積立|つみたて}{預金|よきん}", "/savings", [explain("child-savings-summary", "{自動|じどう}でためる{預金|よきん}", "おサイフや{銀行|ぎんこう}の{預金|よきん}とは{別|べつ}のお{金|かね}だよ。{積立|つみたて}の{金額|きんがく}を{決|き}めたり、{引|ひ}き{出|だ}したりできるよ。{今|いま}は{設定|せってい}を{変|か}えずに{進|すす}めるよ。", "/savings")]),
  ].map((item) => ({ ...item, steps: item.steps.map((step) => step.id !== "done" ? step : {
    ...step, title: "{案内|あんない}はおしまい", text: "この{機能|きのう}の{案内|あんない}はここまでだよ。{設定|せってい}から、{機能|きのう}を{選|えら}んで{見直|みなお}せるよ。",
  }) })),
};

/** 指定ロールで利用できる機能の案内を返す。対象外の機能なら未定義を返す。 */
export function getFeatureTutorial(role: TutorialRole, id: TutorialFeature): FeatureTutorial | undefined {
  return FEATURE_TUTORIALS[role].find((item) => item.id === id);
}
/** 現在の画面に対応する案内を返す。同じハブ画面の町と家は現在地で分ける。 */
export function getScreenTutorial(role: TutorialRole, path: string, hub: "town" | "house" = "town"): TutorialFeature | null {
  if (path === "/rpg-hub") return hub;
  return FEATURE_TUTORIALS[role].find((item) => item.id !== "family" && item.path === path)?.id ?? null;
}
/** 利用者・ロール・機能別の表示履歴を、旧一括形式と区別して保存するキーを作る。 */
export function featureStorageKey(userId: string, role: TutorialRole, id: TutorialFeature): string {
  return `tutorial:v2:${role}:${userId}:${id}`;
}
