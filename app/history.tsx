import { SafeAreaView } from "react-native-safe-area-context";
import AdultBottomNav from "../components/nav/AdultBottomNav";
import PlaceholderScreen from "../lib/PlaceholderScreen";

export default function HistoryScreen() {
  return (
    <SafeAreaView className="flex-1 bg-white" edges={["bottom"]}>
      <PlaceholderScreen title="履歴" />
      <AdultBottomNav activeKey="history" />
    </SafeAreaView>
  );
}
