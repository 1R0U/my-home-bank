import { useEffect, useRef, useState } from "react";
import { Animated, Modal, Pressable, ScrollView, Text, View } from "react-native";
import { GOL_COIN_MARK, GOL_UNIT, formatAmount, formatGolForSpeech } from "../lib/amount";
import { AUDIO_SOURCES, useSoundEffect } from "../lib/audio";
import { questRewardsKey, summarizeQuestRewards } from "../lib/questRewardNotice";
import { markQuestRewardsSeen } from "../lib/questRewardService";
import { useUnseenQuestRewards } from "../lib/useUnseenQuestRewards";
import { CHILD_THEME } from "./childTheme";

type Props = {
  /**
   * ほかのポップアップ（連続記録のお祝い）を待たせるべきかが変わったときに呼ぶ。2つを重ねないため。
   * 出ている間に加えて、出すかどうかがまだ分からない間（一度も取得できていない間）も true
   */
  onVisibleChange?: (visible: boolean) => void;
};

/**
 * タスクが承認されてゴルが入ったことを知らせる（Issue #424）。
 *
 * 子供が我が家タウンへ戻ってきたとき（画面のフォーカス時）に、まだ見せていない承認を取り直し、
 * あれば1枚にまとめて出す。閉じたらDBへ「見せた」と記録する。
 * 親の承認は別の端末で起きるので、承認の直後ではなく、次に町へ戻ったときに出る。
 *
 * 1件なら「『〇〇』の タスクが みとめられたよ！ +100 gol」。複数なら件数と合計を出し、
 * 「くわしく みる」で、みとめられたタスクと入ったゴルを全部見られる。
 * 大人・モックアカウントでは取得しないので、何も出ない（`useUnseenQuestRewards`）。
 * `npm run start:child` で起動したときはデモ用の承認を出す（DBへの記録はしない）。
 */
export default function QuestRewardNotice({ onVisibleChange }: Props) {
  const { isLive, isPending, rewards } = useUnseenQuestRewards();
  const playFanfare = useSoundEffect(AUDIO_SOURCES.purchaseSuccess);
  // 閉じた承認の組。記録の通信が終わる前や、記録に失敗したときでも、同じ画面で出し直さないため。
  // 閉じた後に新しい承認が増えれば組が変わるので、もう一度出る。
  const [dismissedKey, setDismissedKey] = useState<string | null>(null);
  const [isDetailOpen, setIsDetailOpen] = useState(false);
  const scale = useRef(new Animated.Value(0.6)).current;

  const rewardsKey = questRewardsKey(rewards);
  const summary = summarizeQuestRewards(rewards);
  const isVisible = rewardsKey !== null && rewardsKey !== dismissedKey;

  useEffect(() => {
    onVisibleChange?.(isPending || isVisible);
  }, [isPending, isVisible, onVisibleChange]);

  useEffect(() => {
    if (!isVisible) return;
    setIsDetailOpen(false);
    scale.setValue(0.6);
    Animated.spring(scale, { friction: 5, tension: 80, toValue: 1, useNativeDriver: true }).start();
    void playFanfare();
  }, [isVisible, playFanfare, scale]);

  const handleClose = () => {
    if (rewardsKey === null) return;
    setDismissedKey(rewardsKey);
    // デモ（開発用ロール）は実データではないので記録しない
    if (!isLive) return;
    // 記録に失敗しても子供にはエラーを見せない。同じ画面では出し直さず、
    // 画面を開き直したとき（DBに記録が無いまま）にもう一度出る
    markQuestRewardsSeen(rewards.map((reward) => reward.questLogId)).catch((e: unknown) => {
      console.warn("承認を見せたことを記録できませんでした", e);
    });
  };

  if (!isVisible || summary === null) return null;

  return (
    <Modal animationType="fade" onRequestClose={handleClose} transparent visible>
      <View className="flex-1 items-center justify-center bg-slate-950/70 px-8">
        {/*
          Animated.View には className を付けない（NativeWind が変換するのは View などの
          標準コンポーネントだけ）。拡大の動きだけを外側で付け、見た目は内側の View に持たせる。
          カード全体を accessible にすると中のボタンを読み上げで押せなくなるので付けない。
        */}
        <Animated.View style={{ maxWidth: 384, transform: [{ scale }], width: "100%" }}>
          <View
            className="items-center rounded-3xl border-4 px-6 py-8"
            style={{ backgroundColor: CHILD_THEME.parchment, borderColor: CHILD_THEME.gold }}
          >
            <View
              accessibilityElementsHidden
              importantForAccessibility="no-hide-descendants"
              className="mb-4 h-24 w-24 items-center justify-center rounded-full border-4"
              style={{ backgroundColor: CHILD_THEME.brightYellow, borderColor: CHILD_THEME.paleYellow }}
            >
              <Text className="text-5xl font-black" style={{ color: CHILD_THEME.darkWood }}>
                {GOL_COIN_MARK}
              </Text>
            </View>
            <Text className="text-center text-base font-bold" style={{ color: CHILD_THEME.darkWood }}>
              {summary.headline}
            </Text>
            <Text className="mt-1 text-center text-2xl font-bold" style={{ color: CHILD_THEME.darkWood }}>
              みとめられたよ！
            </Text>
            <Text
              accessibilityLabel={`プラス${formatGolForSpeech(summary.totalAmount)}`}
              className="mt-3 text-center text-4xl font-black"
              style={{ color: CHILD_THEME.darkWood }}
            >
              +{formatAmount(summary.totalAmount)}
              <Text className="text-xl"> {GOL_UNIT}</Text>
            </Text>

            {summary.count > 1 ? (
              <>
                <Pressable
                  accessibilityRole="button"
                  accessibilityState={{ expanded: isDetailOpen }}
                  className="mt-4 px-4 py-2"
                  onPress={() => setIsDetailOpen((open) => !open)}
                >
                  <Text className="text-center text-sm font-bold underline" style={{ color: CHILD_THEME.darkWood }}>
                    {isDetailOpen ? "とじる" : "くわしく みる"}
                  </Text>
                </Pressable>
                {isDetailOpen ? (
                  <ScrollView
                    className="mt-1 w-full rounded-2xl border-2"
                    style={{ borderColor: CHILD_THEME.fadedBeige, maxHeight: 220 }}
                  >
                    {rewards.map((reward) => (
                      <View
                        key={reward.questLogId}
                        accessible
                        accessibilityLabel={`${reward.title}、プラス${formatGolForSpeech(reward.amount)}`}
                        className="flex-row items-center justify-between px-4 py-2"
                      >
                        <Text
                          className="mr-3 flex-1 text-sm font-bold"
                          numberOfLines={2}
                          style={{ color: CHILD_THEME.darkWood }}
                        >
                          {reward.title}
                        </Text>
                        <Text className="text-sm font-black" style={{ color: CHILD_THEME.darkWood }}>
                          +{formatAmount(reward.amount)} {GOL_UNIT}
                        </Text>
                      </View>
                    ))}
                  </ScrollView>
                ) : null}
              </>
            ) : null}

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
