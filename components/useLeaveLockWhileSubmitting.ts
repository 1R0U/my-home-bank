import { usePreventRemove } from "expo-router";
import { Alert } from "react-native";
import { useTutorialNavigationLock } from "./tutorial/useTutorialNavigationLock";

/**
 * 送信中は、スワイプやAndroidの戻る操作でも画面を離れさせない（Issue #488）。
 * 離れた後に保存が終わると、成功の「OK」でさらに前の画面へ戻ってしまうため。
 * 離れようとしたときは、送信中だと知らせる（WardrobeScreen と同じ形。Issue #485）。
 *
 * 戻り値は `<Stack.Screen options>` にそのまま渡す。画面ごとの指定は、
 * `_layout.tsx` の `screenOptions`（チュートリアル中はスワイプを止める）を上書きするので、
 * チュートリアル中に止めている分はここでも止めたままにする。
 */
export function useLeaveLockWhileSubmitting(isSubmitting: boolean) {
  const navigationLock = useTutorialNavigationLock();

  usePreventRemove(isSubmitting, () => {
    // アラートにはふりがなを付けられないので、ひらがなで書く（Issue #347）
    Alert.alert("そうしんしています", "おわるまで まってね。");
  });

  return {
    fullScreenGestureEnabled: false,
    gestureEnabled: navigationLock.gestureEnabled && !isSubmitting,
    headerShown: false,
  };
}
