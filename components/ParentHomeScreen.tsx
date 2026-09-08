import { Ionicons } from "@expo/vector-icons";
import { router, Stack } from "expo-router";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Pressable, ScrollView, Text, View } from "react-native";
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
  // さらに、取得結果には対象の userId を紐付けておき、ユーザー切替直後に
  // 前ユーザーの残高を表示し続けてしまわないようにする。
  const [liveBalance, setLiveBalance] = useState<{ userId: string; balance: number } | null>(null);
  const [balanceError, setBalanceError] = useState<{ userId: string } | null>(null);
  const balanceGuardRef = useRef(createStaleGuard());
  const reloadBalance = useCallback(() => {
    const requestId = balanceGuardRef.current.start();
    const targetUserId = currentParent.id;

    if (!isLive) {
      if (balanceGuardRef.current.isCurrent(requestId)) {
        setLiveBalance(null);
        setBalanceError(null);
      }
      return;
    }
    fetchUserBalance(targetUserId)
      .then((balance) => {
        if (balanceGuardRef.current.isCurrent(requestId)) {
          setLiveBalance({ userId: targetUserId, balance });
          setBalanceError(null);
        }
      })
      .catch((e: unknown) => {
        // 残高取得に失敗しても画面自体は表示できるよう表示はモック値にフォールバックしつつ、
        // 取得できていないことが分かるようエラー表示を出す。
        console.warn("所持金の取得に失敗しました", e);
        if (balanceGuardRef.current.isCurrent(requestId)) {
          setLiveBalance(null);
          setBalanceError({ userId: targetUserId });
        }
      });
  }, [isLive, currentParent.id]);

  useEffect(() => {
    reloadBalance();
  }, [reloadBalance]);

  // 取得済みの残高／エラーが「今表示しているユーザー」のものである場合のみ採用する。
  const hasLiveBalanceForCurrentUser =
    isLive && liveBalance !== null && liveBalance.userId === currentParent.id;
  const displayBalance = hasLiveBalanceForCurrentUser
    ? liveBalance.balance
    : currentParent.balance;
  const showBalanceError =
    isLive && balanceError !== null && balanceError.userId === currentParent.id;

  const dailyQuests = useMemo(
    () => filterQuestsByCategory(quests, "daily").filter((quest) => quest.status !== "completed"),
    [quests],
  );

  const pendingApprovalCount = useMemo(
    () => quests.filter((quest) => quest.status === "pending").length,
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

          <Pressable
            accessibilityLabel={
              pendingApprovalCount > 0
                ? `通知。承認待ちが${pendingApprovalCount}件あります`
                : "通知"
            }
            accessibilityRole="button"
            className="h-16 w-16 items-center justify-center rounded-full bg-white"
            onPress={() => router.push("/tasks-adult")}
          >
            <Ionicons color="#0f172a" name="notifications" size={36} />
            {pendingApprovalCount > 0 && (
              <View className="absolute right-2 top-2 h-5 min-w-[20px] items-center justify-center rounded-full bg-rose-500 px-1">
                <Text className="text-[11px] font-bold text-white">{pendingApprovalCount}</Text>
              </View>
            )}
          </Pressable>
        </View>

        <Pressable
          accessibilityLabel={`所持金 ${displayBalance.toLocaleString("ja-JP")}pt。タップして詳細を見る`}
          accessibilityRole="button"
          className="mt-6 items-center rounded-2xl bg-white py-8"
          onPress={() => router.push("/balance-adult")}
        >
          <Text className="text-sm text-slate-500">所持金</Text>
          <Text testID="parent-home-balance-amount" className="mt-1 text-4xl font-bold text-slate-900">
            {displayBalance.toLocaleString("ja-JP")}pt
          </Text>
        </Pressable>

        {showBalanceError ? (
          <Text className="mt-2 text-center text-xs text-rose-500">残高を取得できませんでした</Text>
        ) : null}

        <View className="mt-6">
          <View className="flex-row items-center justify-between">
            <Text className="text-base font-bold text-slate-900">デイリータスク</Text>
            <Pressable
              accessibilityLabel="デイリータスクをすべて見る"
              accessibilityRole="button"
              onPress={() => router.push("/tasks-adult")}
            >
              <Text className="text-xs font-semibold text-blue-600">すべて見る</Text>
            </Pressable>
          </View>

          <View className="mt-3 gap-3">
            {dailyQuests.length === 0 ? (
              <Text className="text-sm text-slate-400">デイリータスクはありません</Text>
            ) : (
              dailyQuests.map((quest) => (
                <Pressable
                  accessibilityLabel={`${quest.title}、${QUEST_STATUS_LABELS[quest.status]}、報酬${quest.reward_amount}pt`}
                  accessibilityRole="button"
                  className="flex-row items-center justify-between rounded-xl bg-white px-4 py-3 active:bg-slate-50"
                  key={quest.id}
                  onPress={() =>
                    router.push({ pathname: "/tasks-adult", params: { questId: quest.id, tab: "daily" } })
                  }
                >
                  <View className="flex-1 pr-3">
                    <Text className="text-sm font-semibold text-slate-900">{quest.title}</Text>
                    <Text className="mt-0.5 text-xs text-slate-500">
                      {QUEST_STATUS_LABELS[quest.status]}
                    </Text>
                  </View>
                  <Text className="text-sm font-bold text-blue-600">+{quest.reward_amount}pt</Text>
                </Pressable>
              ))
            )}
          </View>
        </View>
      </ScrollView>

      <AdultBottomNav activeKey="home" />
    </SafeAreaView>
  );
}
