import { Link } from "expo-router";
import { Pressable, Text, View } from "react-native";
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
    <View className="flex-1 items-center justify-center bg-white p-6">
      <Text className="mb-8 text-3xl font-bold text-slate-900">我が家中央銀行</Text>
      <Link href="/bank" asChild>
        <Pressable className="rounded-3xl bg-slate-900 px-8 py-5 shadow-lg shadow-slate-300">
          <Text className="text-base font-semibold text-white">銀行に行く</Text>
        </Pressable>
      </Link>
    </View>
  );
}
