import { type Href, router } from "expo-router";

/** 既存の案内画面まで戻る。直接起動などで履歴がない場合だけ現在の画面を置き換える。 */
export function returnToTutorialScreen(path: Href): void {
  if (router.canDismiss()) router.dismissTo(path);
  else router.replace(path);
}
