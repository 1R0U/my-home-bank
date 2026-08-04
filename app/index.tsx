import { Text, View } from "react-native";
import { useActiveRole } from "../store";

export default function HomeScreen() {
  const role = useActiveRole();

  return (
    <View className="flex-1 items-center justify-center bg-white">
      <Text className="text-2xl font-bold">我が家中央銀行</Text>
      {__DEV__ && (
        <Text className="mt-2 text-sm text-gray-500">
          現在のロール: {role ?? "未ログイン"}
        </Text>
      )}
    </View>
  );
}
