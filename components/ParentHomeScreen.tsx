import { Ionicons } from "@expo/vector-icons";
import { Stack } from "expo-router";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { ScrollView, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { getMockCurrentUser } from "../constants/mockData";
import { createStaleGuard } from "../lib/staleGuard";
import { useQuests } from "../lib/useQuests";
import { fetchUserBalance } from "../lib/userService";
import { useCurrentUser } from "../store";
import AdultBottomNav from "./nav/AdultBottomNav";
import { filterQuestsByCategory, QUEST_STATUS_LABELS } from "./tasks/taskUtils";

export default function ParentHomeScreen() {
  const { quests, isLive } = useQuests();
  // ライブ接続中は実際にログイン中のユーザーを使う。プレビュー中/未ログイン時のみモックにフォールバックする。
  const loggedInUser = useCurrentUser();
  const currentParent = loggedInUser ?? getMockCurrentUser("parent");

  // ライブ接続中の所持金。ChildTasksScreen等と同じパターンで画面表示時に再取得する。
  // 連続して再取得した場合に、先に開始したリクエストが後から完了して新しい
  // 状態を古い値で上書きしないよう、staleGuard で最新のリクエストのみ反映する。
  const [liveBalance, setLiveBalance] = useState<number | null>(null);
  const balanceGuardRef = useRef(createStaleGuard());
  const reloadBalance = useCallback(() => {
    const requestId = balanceGuardRef.current.start();

    if (!isLive) {
      if (balanceGuardRef.current.isCurrent(requestId)) setLiveBalance(null);
      return;
    }
    fetchUserBalance(currentParent.id)
      .then((balance) => {
        if (balanceGuardRef.current.isCurrent(requestId)) setLiveBalance(balance);
      })
      .catch(() => {
        // 残高取得に失敗しても画面自体は表示できるよう、表示だけモック値にフォールバックする
        if (balanceGuardRef.current.isCurrent(requestId)) setLiveBalance(null);
      });
  }, [isLive, currentParent.id]);

  useEffect(() => {
    reloadBalance();
  }, [reloadBalance]);

  const displayBalance = isLive && liveBalance !== null ? liveBalance : currentParent.balance;

  const dailyQuests = useMemo(
    () => filterQuestsByCategory(quests, "daily").filter((quest) => quest.status !== "completed"),
    [quests],
  );

  return (
    <SafeAreaView className="flex-1 bg-slate-100" edges={["top", "bottom"]}>
      <Stack.Screen options={{ headerShown: false }} />

      <ScrollView contentContainerClassName="px-6 pb-6" showsVerticalScrollIndicator={false}>
        <View className="mt-4 flex-row items-start justify-between">
          <View>
            <Text className="text-lg font-bold text-slate-900">{currentParent.name}</Text>
            <View className="mt-2 h-14 w-14 items-center justify-center rounded-full bg-slate-200">
              <Ionicons color="#94a3b8" name="person" size={28} />
            </View>
          </View>

          <View
            accessibilityLabel="通知"
            className="h-16 w-16 items-center justify-center rounded-full bg-white"
          >
            <Ionicons color="#0f172a" name="notifications" size={36} />
          </View>
        </View>

        <View className="mt-6 items-center rounded-2xl bg-white py-8">
          <Text className="text-sm text-slate-500">所持金</Text>
          <Text accessibilityLabel="所持金" className="mt-1 text-4xl font-bold text-slate-900">
            {displayBalance.toLocaleString("ja-JP")}pt
          </Text>
        </View>

        <View className="mt-6">
          <Text className="text-base font-bold text-slate-900">デイリータスク</Text>
          <View className="mt-3 gap-3">
            {dailyQuests.length === 0 ? (
              <Text className="text-sm text-slate-400">デイリータスクはありません</Text>
            ) : (
              dailyQuests.map((quest) => (
                <View
                  className="flex-row items-center justify-between rounded-xl bg-white px-4 py-3"
                  key={quest.id}
                >
                  <View className="flex-1 pr-3">
                    <Text className="text-sm font-semibold text-slate-900">{quest.title}</Text>
                    <Text className="mt-0.5 text-xs text-slate-500">
                      {QUEST_STATUS_LABELS[quest.status]}
                    </Text>
                  </View>
                  <Text className="text-sm font-bold text-blue-600">+{quest.reward_amount}pt</Text>
                </View>
              ))
            )}
          </View>
        </View>
      </ScrollView>

      <AdultBottomNav activeKey="home" />
    </SafeAreaView>
  );
}
