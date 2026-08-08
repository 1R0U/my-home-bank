import { Ionicons } from "@expo/vector-icons";
import { router } from "expo-router";
import { Pressable, Text, View } from "react-native";

type ScreenHeaderProps = {
  title: string;
};

export default function ScreenHeader({ title }: ScreenHeaderProps) {
  return (
    <View className="flex-row items-center px-4 py-3">
      <Pressable
        accessibilityLabel="前の画面に戻る"
        accessibilityRole="button"
        className="h-10 w-10 items-center justify-center rounded-full active:bg-slate-200"
        onPress={() => router.back()}
      >
        <Ionicons color="#0f172a" name="chevron-back" size={24} />
      </Pressable>
      <Text className="ml-1 text-2xl font-bold text-slate-900">{title}</Text>
    </View>
  );
}
