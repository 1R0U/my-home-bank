import { Ionicons } from "@expo/vector-icons";
import { router, type Href } from "expo-router";
import { Pressable, Text, View } from "react-native";

type ScreenHeaderProps = {
  title: string;
  // ボトムナビゲーションのタブ切り替え（router.replace）で遷移してきた画面は
  // 履歴が積まれておらず router.back() が効かないため、その場合の戻り先を指定する。
  fallbackHref?: Href;
};

export default function ScreenHeader({ title, fallbackHref }: ScreenHeaderProps) {
  const handleBack = () => {
    if (router.canGoBack()) {
      router.back();
    } else if (fallbackHref) {
      router.replace(fallbackHref);
    }
  };

  return (
    <View className="flex-row items-center px-4 py-3">
      <Pressable
        accessibilityLabel="前の画面に戻る"
        accessibilityRole="button"
        className="h-10 w-10 items-center justify-center rounded-full active:bg-slate-200"
        onPress={handleBack}
      >
        <Ionicons color="#0f172a" name="chevron-back" size={24} />
      </Pressable>
      <Text
        className="ml-1 flex-1 text-2xl font-bold text-slate-900"
        ellipsizeMode="tail"
        numberOfLines={1}
      >
        {title}
      </Text>
    </View>
  );
}
