import { Text, View } from "react-native";

type PlaceholderScreenProps = {
  title: string;
};

export default function PlaceholderScreen({ title }: PlaceholderScreenProps) {
  return (
    <View className="flex-1 items-center justify-center bg-white px-6">
      <Text className="text-2xl font-bold text-slate-900">{title}</Text>
      <Text className="mt-2 text-base text-slate-500">この画面は準備中です</Text>
    </View>
  );
}
