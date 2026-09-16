import { Ionicons } from "@expo/vector-icons";
import { router } from "expo-router";
import { Pressable, Text, View } from "react-native";

type ScreenHeaderProps = {
  title: string;
  // タブバーのタブ切り替えで開く画面（タブのルート画面）には「戻る」概念が無いため非表示にする
  hideBackButton?: boolean;
};

export default function ScreenHeader({ title, hideBackButton = false }: ScreenHeaderProps) {
  return (
    <View className="flex-row items-center px-4 py-3">
      {!hideBackButton && (
        <Pressable
          accessibilityLabel="前の画面に戻る"
          accessibilityRole="button"
          className="h-10 w-10 items-center justify-center rounded-full active:bg-slate-200"
          onPress={() => router.back()}
        >
          <Ionicons color="#0f172a" name="chevron-back" size={24} />
        </Pressable>
      )}
      <Text
        className={`flex-1 text-2xl font-bold text-slate-900 ${hideBackButton ? "" : "ml-1"}`}
        ellipsizeMode="tail"
        numberOfLines={1}
      >
        {title}
      </Text>
    </View>
  );
}
