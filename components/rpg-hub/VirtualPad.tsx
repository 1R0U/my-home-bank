import { Pressable, Text, View } from "react-native";
import { usePlayerStore } from "../../store/playerStore";

const STEP = 0.5;

export function VirtualPad() {
  const move = usePlayerStore((state) => state.move);
  const buttonClass = "h-12 w-12 items-center justify-center rounded-full bg-slate-900/75 active:bg-slate-700";

  return (
    <View className="absolute bottom-8 left-6 items-center" accessibilityLabel="移動パッド">
      <Pressable accessibilityLabel="上へ移動" className={buttonClass} onPress={() => move(0, -STEP, "up")}>
        <Text className="text-xl text-white">▲</Text>
      </Pressable>
      <View className="flex-row gap-12">
        <Pressable accessibilityLabel="左へ移動" className={buttonClass} onPress={() => move(-STEP, 0, "left")}>
          <Text className="text-xl text-white">◀</Text>
        </Pressable>
        <Pressable accessibilityLabel="右へ移動" className={buttonClass} onPress={() => move(STEP, 0, "right")}>
          <Text className="text-xl text-white">▶</Text>
        </Pressable>
      </View>
      <Pressable accessibilityLabel="下へ移動" className={buttonClass} onPress={() => move(0, STEP, "down")}>
        <Text className="text-xl text-white">▼</Text>
      </Pressable>
    </View>
  );
}
