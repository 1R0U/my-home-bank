import { Ionicons } from "@expo/vector-icons";
import { router } from "expo-router";
import { View } from "react-native";
import TutorialPressable from "./tutorial/TutorialPressable";
import { UI_COLORS } from "../constants/ui";
import { playSoundEffect } from "../lib/audio";
import Furigana from "./Furigana";

type ScreenHeaderProps = {
  /** 見出し。子供用の画面では `{漢字|よみ}` でふりがなを付けられる（`Furigana`） */
  title: string;
  // タブバーのタブ切り替えで開く画面（タブのルート画面）には「戻る」概念が無いため非表示にする
  hideBackButton?: boolean;
  backTutorialId?: string;
};

export default function ScreenHeader({ title, hideBackButton = false, backTutorialId }: ScreenHeaderProps) {
  return (
    <View className="flex-row items-center px-4 py-3">
      {!hideBackButton && (
        <TutorialPressable
          tutorialId={backTutorialId}
          accessibilityLabel="前の画面に戻る"
          accessibilityRole="button"
          className="h-10 w-10 items-center justify-center rounded-full active:bg-slate-200"
          onPress={() => {
            playSoundEffect("cancel");
            if (router.canGoBack()) router.back();
            else router.replace("/");
          }}
        >
          <Ionicons color={UI_COLORS.slate900} name="chevron-back" size={24} />
        </TutorialPressable>
      )}
      <Furigana noWrap
        className={`flex-1 text-2xl font-bold text-slate-900 ${hideBackButton ? "" : "ml-1"}`}
        ellipsizeMode="tail"
        numberOfLines={1}
      >
        {title}
      </Furigana>
    </View>
  );
}
