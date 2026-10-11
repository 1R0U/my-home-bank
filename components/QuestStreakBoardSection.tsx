import { Ionicons } from "@expo/vector-icons";
import { Text, View } from "react-native";
import { ERROR_TEXT_CLASS, NOTICE_TEXT_CLASS, UI_COLORS } from "../constants/ui";
import { formatQuestStreakMilestone } from "../lib/questStreak";
import type { QuestStreakBoardEntry } from "../lib/questStreakBoard";

/** 連続日数が0日の人に、日数の代わりに出す文言 */
const ZERO_DAYS_TEXT = "今日からスタート";

type Props = {
  entries: QuestStreakBoardEntry[];
  error: string | null;
};

/**
 * 掲示板に出す、家族全員の連続記録（Issue #355）。
 *
 * 1人ずつ、連続日数と、次のキリのいい日数まであと何日かを出す。
 * 子供は承認されたタスクがある日、大人はアプリを開いた日で数える。
 * まだ読み込んでいない間（並べる人がいない間）は何も出さない。
 */
export default function QuestStreakBoardSection({ entries, error }: Props) {
  if (!error && entries.length === 0) return null;

  return (
    <View className="mx-4 mb-2 gap-2 rounded-2xl bg-white px-4 py-4">
      <View className="flex-row items-center gap-1">
        <Ionicons color={UI_COLORS.orange500} name="flame" size={18} />
        <Text accessibilityRole="header" className="text-sm font-bold text-slate-900">
          連続記録
        </Text>
      </View>
      {/* 子供は承認された完了申請がある日を、申請した日で数える（private.quest_streak_for）。
          「やった日」だと、承認待ち・却下の日に「やったのに増えない」と受け取られるので、承認と書く */}
      <Text className="text-[11px] text-slate-500">
        子供はタスクが承認された日（承認が翌日でも、申請した日の分になります）、大人はアプリを開いた日で数えます
      </Text>

      {error ? (
        <Text accessibilityRole="alert" className={`text-sm ${ERROR_TEXT_CLASS}`}>
          {error}
        </Text>
      ) : null}

      {entries.map((entry) => {
        // 途切れている人・まだ記録がない人に「0日 連続」と出すのは不自然なので、言い換える
        const isZero = entry.streak?.currentDays === 0;
        const daysText = entry.streak ? (isZero ? ZERO_DAYS_TEXT : `${entry.streak.currentDays}日 連続`) : null;
        const nextText =
          entry.streak && entry.nextMilestone !== null
            ? `次の「${formatQuestStreakMilestone(entry.nextMilestone)}」まで あと${entry.daysToNextMilestone}日`
            : null;
        // 1人分を1つにまとめて読み上げる（名前・日数・あと何日かが別々に読まれないように）
        const label = [
          entry.name + (entry.isSelf ? "（じぶん）" : ""),
          daysText,
          nextText ?? "記録を取得できませんでした",
        ]
          .filter(Boolean)
          .join("、");
        return (
          <View
            accessibilityLabel={label}
            accessible
            className="flex-row items-center justify-between border-t border-slate-100 pt-2"
            key={entry.userId}
            testID={`quest-streak-${entry.userId}`}
          >
            <View className="flex-1 pr-2">
              <Text className="text-sm font-semibold text-slate-900">
                {entry.name}
                {entry.isSelf ? <Text className="text-xs text-slate-500">（じぶん）</Text> : null}
              </Text>
              {nextText ? (
                <Text className="mt-0.5 text-xs text-slate-600">{nextText}</Text>
              ) : (
                <Text className={`mt-0.5 text-xs ${NOTICE_TEXT_CLASS}`}>記録を取得できませんでした</Text>
              )}
            </View>
            {daysText ? (
              <Text className={isZero ? "text-sm font-bold text-slate-600" : "text-lg font-bold text-orange-600"}>
                {daysText}
              </Text>
            ) : null}
          </View>
        );
      })}
    </View>
  );
}
