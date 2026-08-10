import { SafeAreaView } from "react-native-safe-area-context";
import AdultBottomNav from "../components/nav/AdultBottomNav";
import PlaceholderScreen from "../lib/PlaceholderScreen";

export default function StoreAdultScreen() {
  return (
    <SafeAreaView className="flex-1 bg-white" edges={["bottom"]}>
      <PlaceholderScreen title="ストア（大人）" />
      <AdultBottomNav activeKey="store" />
    </SafeAreaView>
  );
}
