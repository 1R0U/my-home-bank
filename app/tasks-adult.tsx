import { SafeAreaView } from "react-native-safe-area-context";
import AdultBottomNav from "../components/nav/AdultBottomNav";
import PlaceholderScreen from "../lib/PlaceholderScreen";

export default function TasksAdultScreen() {
  return (
    <SafeAreaView className="flex-1 bg-white" edges={["bottom"]}>
      <PlaceholderScreen title="タスク（大人）" />
      <AdultBottomNav activeKey="tasks" />
    </SafeAreaView>
  );
}
