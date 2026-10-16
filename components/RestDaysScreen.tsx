import { Stack } from "expo-router";
import { useEffect, useMemo, useState } from "react";
import { ActivityIndicator, Pressable, ScrollView, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { ERROR_TEXT_CLASS, NOTICE_TEXT_CLASS, UI_COLORS } from "../constants/ui";
import { toErrorMessage } from "../lib/errorMessage";
import {
  describeSelection,
  formatRestDay,
  groupRestDaysByDate,
  isSelectableRestDay,
  REST_DAY_MAX_PAST_DAYS,
  REST_DAY_MAX_SELECTED_DAYS,
} from "../lib/questRestDays";
import { setQuestRestDays } from "../lib/questRestDayService";
import { useFamilyMembers } from "../lib/useFamilyMembers";
import { useQuestRestDays } from "../lib/useQuestRestDays";
import ErrorWithRetry from "./ErrorWithRetry";
import RestDayCalendar from "./RestDayCalendar";
import ScreenHeader from "./ScreenHeader";

/**
 * 親が「家事をしなくていい日」を決める画面（Issue #396）。
 *
 * 子供を選び（1人でも複数人でも）、カレンダーで日付を選んで、お休みにする／やめる。
 * お休みの日はタスクをしなくても連続記録が途切れない。した日はふつうに数える。
 */
export default function RestDaysScreen() {
  const restDayState = useQuestRestDays();
  const { isLive, restDays, today } = restDayState;
  const family = useFamilyMembers({ errorMessage: "家族の情報を取得できませんでした" });
  const children = useMemo(() => family.members.filter((member) => member.role === "child"), [family.members]);
  const error = restDayState.error ?? family.error;
  const loading = restDayState.loading || family.loading;
  const reload = async () => {
    await Promise.all([restDayState.reload(), family.reload()]);
  };
  const [pickedChildIds, setPickedChildIds] = useState<string[] | null>(null);
  const [selectedDays, setSelectedDays] = useState<Set<string>>(new Set());
  const [month, setMonth] = useState(() => ({ month: Number(today.slice(5, 7)), year: Number(today.slice(0, 4)) }));
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<{ text: string; isError: boolean } | null>(null);

  // 最初は子供全員を選んでおく（家族旅行など、全員まとめて休むことが多いため）。
  // 選び直したあとに取り直して子供が減っていたら、いない子供のIDは保存に渡さない
  const childIds = useMemo(() => {
    const all = children.map((child) => child.id);
    return pickedChildIds ? pickedChildIds.filter((id) => all.includes(id)) : all;
  }, [children, pickedChildIds]);
  const byDate = useMemo(() => groupRestDaysByDate(restDays), [restDays]);
  const restCounts = useMemo(() => {
    const counts = new Map<string, number>();
    byDate.forEach((users, day) => {
      const count = childIds.filter((id) => users.has(id)).length;
      if (count > 0) counts.set(day, count);
    });
    return counts;
  }, [byDate, childIds]);
  // 選べる範囲は今日から決まる。選んだまま日付が変わると範囲を出る日ができ、そのまま保存すると
  // 全体が断られるので、範囲を出た日は外す（PR #420 のレビュー）
  useEffect(() => {
    const inRange = [...selectedDays].filter((day) => isSelectableRestDay(day, today));
    if (inRange.length === selectedDays.size) return;
    setSelectedDays(new Set(inRange));
    setMessage({ isError: false, text: "日付が変わったので、えらべる範囲を過ぎた日を外しました" });
    // 日付が変わったときだけ見直す（選ぶたびに走らせる必要はない）
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [today]);
  const days = [...selectedDays].filter((day) => isSelectableRestDay(day, today)).sort();
  const { hasRest, hasWorkday } = describeSelection(byDate, childIds, days);
  const nameOf = (id: string) => children.find((child) => child.id === id)?.name ?? "";
  const upcoming = [...byDate.entries()].filter(([day]) => day >= today);

  const toggleChild = (id: string) => {
    setMessage(null);
    setPickedChildIds(childIds.includes(id) ? childIds.filter((x) => x !== id) : [...childIds, id]);
  };

  const toggleDay = (day: string) => {
    setMessage(null);
    setSelectedDays((current) => {
      const next = new Set(current);
      if (next.has(day)) next.delete(day);
      else if (next.size < REST_DAY_MAX_SELECTED_DAYS) next.add(day);
      return next;
    });
  };

  const apply = async (isRest: boolean) => {
    if (saving || childIds.length === 0 || days.length === 0) return;
    setSaving(true);
    setMessage(null);
    try {
      await setQuestRestDays(childIds, days, isRest);
      setSelectedDays(new Set());
      setMessage({ isError: false, text: isRest ? "お休みの日にしました" : "お休みの日をやめました" });
      await reload();
    } catch (e) {
      setMessage({ isError: true, text: toErrorMessage(e, "保存できませんでした") });
    } finally {
      setSaving(false);
    }
  };

  const canApply = isLive && !saving && childIds.length > 0 && days.length > 0;

  return (
    <SafeAreaView className="flex-1 bg-slate-100" edges={["top", "bottom"]}>
      <Stack.Screen options={{ headerShown: false }} />
      <ScreenHeader title="家事をしなくていい日" />

      <ScrollView contentContainerClassName="gap-3 px-4 pb-8">
        <Text className="text-sm text-slate-600">
          お休みの日は、タスクをしなくても連続記録が途切れません。した日はいつもどおり数えます。
          {REST_DAY_MAX_PAST_DAYS}日前までさかのぼって設定できます。
        </Text>

        {error ? <ErrorWithRetry message={error} onRetry={() => void reload()} retryLabel="再試行" /> : null}
        {!isLive ? (
          <Text className={`text-sm ${NOTICE_TEXT_CLASS}`}>※ プレビュー中は設定できません</Text>
        ) : null}
        {loading && children.length === 0 && !error ? <ActivityIndicator color={UI_COLORS.slate500} /> : null}

        <View className="gap-2 rounded-2xl bg-white p-4">
          <Text accessibilityRole="header" className="text-sm font-bold text-slate-900">
            だれのお休み？
          </Text>
          {isLive && !loading && children.length === 0 && !error ? (
            <Text className={`text-sm ${NOTICE_TEXT_CLASS}`}>子供が登録されていません</Text>
          ) : null}
          <View className="flex-row flex-wrap gap-2">
            {children.map((child) => {
              const picked = childIds.includes(child.id);
              return (
                <Pressable
                  accessibilityRole="checkbox"
                  accessibilityState={{ checked: picked }}
                  className={`rounded-full border px-4 py-2 ${picked ? "border-blue-600 bg-blue-600" : "border-slate-300 bg-white"}`}
                  key={child.id}
                  onPress={() => toggleChild(child.id)}
                >
                  <Text className={`text-sm font-semibold ${picked ? "text-white" : "text-slate-700"}`}>{child.name}</Text>
                </Pressable>
              );
            })}
          </View>
        </View>

        <View className="rounded-2xl bg-white p-4">
          <RestDayCalendar
            childCount={childIds.length}
            month={month}
            onChangeMonth={setMonth}
            onToggleDay={toggleDay}
            restCounts={restCounts}
            selectedDays={selectedDays}
            today={today}
          />
        </View>

        <Text className="text-sm text-slate-700">
          {days.length === 0
            ? "カレンダーで日付をえらんでください"
            : `${days.length}日をえらんでいます（${days.map(formatRestDay).join("・")}）`}
        </Text>

        <View className="flex-row gap-2">
          <Pressable
            accessibilityRole="button"
            accessibilityState={{ disabled: !canApply || !hasWorkday }}
            className={`flex-1 items-center rounded-xl py-3 ${canApply && hasWorkday ? "bg-blue-600" : "bg-slate-300"}`}
            disabled={!canApply || !hasWorkday}
            onPress={() => void apply(true)}
          >
            <Text className="text-sm font-bold text-white">お休みにする</Text>
          </Pressable>
          <Pressable
            accessibilityRole="button"
            accessibilityState={{ disabled: !canApply || !hasRest }}
            className={`flex-1 items-center rounded-xl border py-3 ${
              canApply && hasRest ? "border-slate-400 bg-white" : "border-slate-200 bg-slate-100"
            }`}
            disabled={!canApply || !hasRest}
            onPress={() => void apply(false)}
          >
            <Text className={`text-sm font-bold ${canApply && hasRest ? "text-slate-900" : "text-slate-400"}`}>
              お休みをやめる
            </Text>
          </Pressable>
        </View>

        {message ? (
          <Text
            accessibilityRole={message.isError ? "alert" : undefined}
            className={`text-sm ${message.isError ? ERROR_TEXT_CLASS : "text-slate-700"}`}
          >
            {message.text}
          </Text>
        ) : null}

        <View className="gap-2 rounded-2xl bg-white p-4">
          <Text accessibilityRole="header" className="text-sm font-bold text-slate-900">
            これからのお休み
          </Text>
          {upcoming.length === 0 ? (
            <Text className={`text-sm ${NOTICE_TEXT_CLASS}`}>まだありません</Text>
          ) : (
            upcoming.map(([day, users]) => (
              <View className="flex-row justify-between border-t border-slate-100 pt-2" key={day}>
                <Text className="text-sm text-slate-900">{formatRestDay(day)}</Text>
                <Text className="text-sm text-slate-600">{[...users].map(nameOf).filter(Boolean).join("・")}</Text>
              </View>
            ))
          )}
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}
