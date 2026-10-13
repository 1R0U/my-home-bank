/** 案内は実際の操作が完了したときだけ次へ進む。保存・送金などは必須にしない。 */
export type TutorialRole = "parent" | "child";
export type TutorialStep = { id: string; title: string; text: string };

export const TUTORIAL_STEPS: Record<TutorialRole, readonly TutorialStep[]> = {
  parent: [
    { id: "nav-tasks-adult", title: "タスク管理を開く", text: "家事をタスクにして、子供へお願いできます。枠で囲んだ「タスク」タブを押してください。" },
    { id: "parent-daily", title: "日課を見る", text: "「デイリー」は毎日のタスクです。まず枠の「デイリー」を押して、一覧を開きましょう。" },
    { id: "parent-create", title: "作成画面を開く", text: "「＋ タスクを追加」を押してください。子供にお願いする内容と報酬を決める画面が開きます。" },
    { id: "parent-form-close", title: "タスクの作り方", text: "タイトル・カテゴリ・報酬のゴル・詳細を入力して追加します。今回は画面を確認し、枠の「×」で閉じましょう。" },
    { id: "parent-approval", title: "報告を確認する", text: "「承認」を押してください。子供の報告を確認し、承認すると報酬が渡ります。報告がないときは空の一覧になります。" },
    { id: "nav-store-adult", title: "ストアを開く", text: "次は「ストア」タブを押してください。子供がゴルで買える商品や、商品追加の申請を管理します。" },
    { id: "nav-loan-adult", title: "家族の経済を見る", text: "「経済」タブを押してください。ギルド金庫や家族のお金の流れを確認できます。" },
    { id: "nav-main-adult", title: "ホームへ戻る", text: "「ホーム」タブを押してください。所持金とギルド金庫残高は別々に表示されます。" },
    { id: "parent-settings", title: "設定を開く", text: "枠の歯車ボタンを押してください。設定から、この案内をいつでも見直せます。" },
    { id: "done", title: "準備できました", text: "設定の「使い方をもう一度見る」から再開できます。まずは家族で相談してタスクを作ってみましょう。" },
  ],
  child: [
    { id: "town-tasks", title: "タスクの建物へ", text: "町をなぞると歩けるよ。「タスク」の建物に近づいて、枠の「入る」を押そう。建物を直接タップしても入れるよ。" },
    { id: "child-weekly", title: "タスクの種類", text: "枠の「ウィークリー」を押してみよう。週ごとに取り組むタスクがならぶよ。" },
    { id: "child-daily", title: "毎日のお手伝い", text: "「デイリー」を押してみよう。カードを押すと、やることと報酬が見られるよ。ないときは大人に作ってもらおう。" },
    { id: "child-tasks-back", title: "ゴルをもらうには", text: "タスクを受注して、お手伝いが終わったら報告しよう。大人が承認するとゴルがもらえるよ。今は「戻る」で町へ戻ろう。" },
    { id: "town-bank", title: "銀行へ行こう", text: "次は「銀行」の建物へ。近づいて枠の「入る」を押すか、建物をタップしてね。" },
    { id: "child-bank-back", title: "お金をためよう", text: "銀行ではゴルを預けたり、引き出したりできるよ。おサイフと預金は別々のお金だよ。下へスクロールして「戻る」を押そう。" },
    { id: "town-store", title: "ストアへ行こう", text: "次は「ストア」の建物へ。近づいて枠の「入る」を押すか、建物をタップしてね。" },
    { id: "child-store-back", title: "ゴルを使ってみよう", text: "商品を押すと、説明と値段が見られるよ。「購入する」のあとに確認する画面があるよ。今は「戻る」で町へ戻ろう。" },
    { id: "town-menu", title: "メニューを開こう", text: "枠の「☰」を押そう。キャラえらび・かざる・きがえも、ここからできるよ。" },
    { id: "town-settings", title: "設定へ行こう", text: "枠の「⚙️」を押してね。この案内をもう一度見る場所を覚えよう。" },
    { id: "done", title: "案内はおしまい！", text: "設定の「使い方をもう一度見る」で、いつでもやり直せるよ。お手伝いをして、ゴルをためてみよう！" },
  ],
};

export function tutorialStorageKey(userId: string, role: TutorialRole): string {
  return `tutorial:v1:${role}:${userId}`;
}

export function advanceTutorial(role: TutorialRole, index: number, targetId: string): number {
  return TUTORIAL_STEPS[role][index]?.id === targetId
    ? Math.min(index + 1, TUTORIAL_STEPS[role].length - 1)
    : index;
}
