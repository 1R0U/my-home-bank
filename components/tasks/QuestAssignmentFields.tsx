import { Pressable, Text, View } from "react-native";
import type { QuestAudience, QuestCategory } from "../../types";
import type { FamilyMember } from "../../lib/useFamilyMembers";
import { NOTICE_TEXT_CLASS } from "../../constants/ui";
import { currentQuestPeriod, parseQuestDailyEndTime, type QuestWeekStartDay } from "../../lib/questPeriod";
import { formatQuestDeadline } from "../../lib/questDeadline";
import QuestDailyEndTimeField from "./QuestDailyEndTimeField";

export const QUEST_WEEKDAY_LABELS = ["日", "月", "火", "水", "木", "金", "土"];
const AUDIENCES: { value: QuestAudience; label: string }[] = [
  { value: "first", label: "先着1人" }, { value: "specific", label: "特定の子" }, { value: "all", label: "全員" },
];

type Props = {
  audience: QuestAudience;
  children: FamilyMember[];
  disabled: boolean;
  onAudienceChange: (value: QuestAudience) => void;
  onTargetChange: (value: string) => void;
  targetChildId: string | null;
  category: QuestCategory;
  weekStartDay: number;
  onWeekStartChange: (value: number) => void;
  dailyEndTime: string;
  onDailyEndTimeChange: (value: string) => void;
};

/** 繰り返しの説明と、複数の子がいる家庭だけに出す担当の選択。 */
export default function QuestAssignmentFields(props: Props) {
  const endMinutes = parseQuestDailyEndTime(props.dailyEndTime);
  const period = props.category === "daily" && endMinutes === null ? null
    : currentQuestPeriod(props.category, props.weekStartDay as QuestWeekStartDay, Date.now(), endMinutes ?? 0);
  return <>
    {props.category === "daily" ? <QuestDailyEndTimeField
      value={props.dailyEndTime} onChange={props.onDailyEndTimeChange} disabled={props.disabled}
    /> : null}
    {props.category === "weekly" ? <>
      <Text className="mt-4 text-xs font-semibold text-slate-500">週の開始曜日</Text>
      <View className="mt-1 flex-row gap-1">
        {QUEST_WEEKDAY_LABELS.map((label, day) => <Pressable
          key={day} accessibilityRole="button" accessibilityLabel={`${label}曜始まり`}
          accessibilityState={{ selected: props.weekStartDay === day, disabled: props.disabled }}
          disabled={props.disabled} onPress={() => props.onWeekStartChange(day)}
          className={`flex-1 items-center rounded-xl py-2.5 ${props.weekStartDay === day ? "bg-slate-900" : "bg-slate-50"}`}
        ><Text className={props.weekStartDay === day ? "text-white" : "text-slate-600"}>{label}</Text></Pressable>)}
      </View>
    </> : null}
    <Text className={`mt-2 text-xs ${NOTICE_TEXT_CLASS}`}>
      {props.category === "daily" ? "終了時刻の24時間前から始まり、終了時刻に新しい回へ切り替わります。"
        : props.category === "weekly" ? `毎週${QUEST_WEEKDAY_LABELS[props.weekStartDay]}曜0時（日本時間）からの1週間を繰り返します。`
        : "限定タスクは繰り返しません。"}
    </Text>
    {period ? <Text className={`mt-1 text-xs ${NOTICE_TEXT_CLASS}`}>
      {`現在の期間：${formatQuestDeadline(period.startsAt)} 〜 ${formatQuestDeadline(period.endsAt)}（日本時間）`}
    </Text> : null}
    {props.category !== "limited" ? <Text className={`mt-1 text-xs ${NOTICE_TEXT_CLASS}`}>
      未着手・進行中は期間終了で締め切り、申請済みは後から承認できます。
    </Text> : null}
    {props.children.length > 1 ? <>
      <Text className="mt-4 text-xs font-semibold text-slate-500">担当する子</Text>
      <View className="mt-1 flex-row gap-2">
        {AUDIENCES.map(({ value, label }) => <Pressable key={value}
          accessibilityRole="button" accessibilityState={{ selected: props.audience === value, disabled: props.disabled }}
          disabled={props.disabled} onPress={() => props.onAudienceChange(value)}
          className={`flex-1 items-center rounded-xl py-2.5 ${props.audience === value ? "bg-slate-900" : "bg-slate-50"}`}
        ><Text className={props.audience === value ? "text-white" : "text-slate-600"}>{label}</Text></Pressable>)}
      </View>
      {props.audience === "specific" ? <View className="mt-2 flex-row flex-wrap gap-2">
        {props.children.map((child) => <Pressable key={child.id} accessibilityRole="button"
          accessibilityLabel={`担当：${child.name}`} disabled={props.disabled}
          accessibilityState={{ selected: child.id === props.targetChildId, disabled: props.disabled }}
          onPress={() => props.onTargetChange(child.id)}
          className={`rounded-xl px-4 py-2 ${child.id === props.targetChildId ? "bg-slate-900" : "bg-slate-50"}`}
        ><Text className={child.id === props.targetChildId ? "text-white" : "text-slate-600"}>{child.name}</Text></Pressable>)}
      </View> : null}
      {props.audience === "all" ? <Text className={`mt-2 text-xs ${NOTICE_TEXT_CLASS}`}>報酬は表示額を子供1人ずつに支払います。</Text> : null}
    </> : null}
  </>;
}
