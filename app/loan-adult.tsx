import { SafeAreaView } from "react-native-safe-area-context";
import AdultBottomNav from "../components/nav/AdultBottomNav";
import PlaceholderScreen from "../lib/PlaceholderScreen";

export default function LoanAdultScreen() {
  return (
    <SafeAreaView className="flex-1 bg-white" edges={["bottom"]}>
      <PlaceholderScreen title="ローン（大人）" />
      <AdultBottomNav activeKey="loan" />
    </SafeAreaView>
  );
}
