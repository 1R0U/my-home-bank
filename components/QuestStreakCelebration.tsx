import { Ionicons } from "@expo/vector-icons";
import { useEffect, useRef, useState } from "react";
import { Animated, Modal, Pressable, Text, View } from "react-native";
import { AUDIO_SOURCES, useSoundEffect } from "../lib/audio";
import { formatQuestStreakMilestone } from "../lib/questStreak";
import { recordQuestStreakCelebration } from "../lib/questStreakService";
import { useQuestStreak } from "../lib/useQuestStreak";
import { CHILD_THEME } from "./childTheme";

/**
 * 連続記録がキリのいい日数に届いたときのお祝い（Issue #372）。
 *
 * 子供が我が家タウンへ戻ってきたとき（画面のフォーカス時）に連続記録を取り直し、
 * まだお祝いしていない日数があれば1回だけ出す。閉じたらDBへ「お祝いした」と記録する。
 * 親の承認は別の端末で起きるので、承認の直後ではなく、次に町へ戻ったときに出る。
 *
 * 今は演出だけで、ごほうび（アイテムなど）は渡さない（#397 で足す）。
 * 大人・モックアカウントでは連続記録を取らないので、何も出ない（`useQuestStreak`）。
 */
export default function QuestStreakCelebration() {
  const { streak } = useQuestStreak();
  const playFanfare = useSoundEffect(AUDIO_SOURCES.purchaseSuccess);
  // 閉じたお祝い。記録の通信が終わる前や、記録に失敗したときでも、同じ画面で出し直さないため。
  // 「どの記録の」お祝いかも含めて覚える（途切れて同じ日数にまた届いたときは出す）。
  const [dismissedKey, setDismissedKey] = useState<string | null>(null);
  const scale = useRef(new Animated.Value(0.6)).current;

  const milestone = streak?.pendingMilestone ?? null;
  const celebrationKey = milestone === null ? null : `${streak?.startedOn ?? ""}:${milestone}`;
  const isVisible = celebrationKey !== null && celebrationKey !== dismissedKey;

  useEffect(() => {
    if (!isVisible) return;
    scale.setValue(0.6);
    Animated.spring(scale, { friction: 5, tension: 80, toValue: 1, useNativeDriver: true }).start();
    void playFanfare();
  }, [isVisible, playFanfare, scale]);

  const handleClose = () => {
    if (celebrationKey === null || milestone === null) return;
    setDismissedKey(celebrationKey);
    // 記録に失敗しても子供にはエラーを見せない。我が家タウンは建物へ入っても画面が残るので、
    // 同じ画面では出し直さず、画面を開き直したとき（DBに記録が無いまま）にもう一度お祝いが出る
    recordQuestStreakCelebration(milestone).catch((e: unknown) => {
      console.warn("連続記録のお祝いを記録できませんでした", e);
    });
  };

  if (!isVisible || milestone === null) return null;

  return (
    <Modal animationType="fade" onRequestClose={handleClose} transparent visible>
      <View className="flex-1 items-center justify-center bg-slate-950/70 px-8">
        {/*
          Animated.View には className を付けない（NativeWind が変換するのは View などの
          標準コンポーネントだけで、Animated.View に渡したクラスは効かない）。
          拡大の動きだけを外側で付け、見た目は内側の View に持たせる。
          また、カード全体を accessible にすると中のボタンを読み上げで押せなくなるので付けない。
        */}
        <Animated.View style={{ maxWidth: 384, transform: [{ scale }], width: "100%" }}>
          <View
            className="items-center rounded-3xl border-4 px-6 py-8"
            style={{ backgroundColor: CHILD_THEME.parchment, borderColor: CHILD_THEME.gold }}
          >
            <Ionicons color={CHILD_THEME.brightYellow} name="trophy" size={72} style={{ marginBottom: 12 }} />
            <Text className="text-center text-base font-bold" style={{ color: CHILD_THEME.darkWood }}>
              まいにち つづけて
            </Text>
            <Text className="mt-1 text-center text-4xl font-bold" style={{ color: CHILD_THEME.darkWood }}>
              {formatQuestStreakMilestone(milestone)}
            </Text>
            <Text className="mt-1 text-center text-2xl font-bold" style={{ color: CHILD_THEME.darkWood }}>
              れんぞく たっせい！
            </Text>
            <Text className="mt-4 text-center text-sm" style={{ color: CHILD_THEME.darkWood }}>
              このちょうしで つぎも がんばろう！
            </Text>
            <Pressable
              accessibilityRole="button"
              className="mt-6 rounded-full px-10 py-3"
              onPress={handleClose}
              style={({ pressed }) => ({
                backgroundColor: CHILD_THEME.brightYellow,
                opacity: pressed ? 0.8 : 1,
              })}
            >
              <Text className="text-lg font-bold" style={{ color: CHILD_THEME.darkWood }}>
                やったね！
              </Text>
            </Pressable>
          </View>
        </Animated.View>
      </View>
    </Modal>
  );
}
