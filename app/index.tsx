import { Text, View } from "react-native";
import ChildHomeScreen from "../components/ChildHomeScreen";
import ParentHomeScreen from "../components/ParentHomeScreen";
import { useActiveRole } from "../store";

export default function HomeScreen() {
  const role = useActiveRole();

  if (role === "parent") {
    return <ParentHomeScreen />;
  }

  if (role === "child") {
    return <ChildHomeScreen />;
  }

  return (
    <View className="flex-1 items-center justify-center bg-white">
      <Text className="text-2xl font-bold">我が家中央銀行</Text>
    </View>
  );
}
