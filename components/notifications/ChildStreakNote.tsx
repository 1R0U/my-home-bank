import { Ionicons } from "@expo/vector-icons";
import { Text, View } from "react-native";
import {
  describeQuestStreakEntry,
  QUEST_STREAK_UNAVAILABLE_TEXT,
  type QuestStreakBoardEntry,
} from "../../lib/questStreakBoard";
import Furigana from "../Furigana";
import { NOTICE_BOARD_COLORS, noticeBoardStyles as styles } from "./noticeBoardStyles";

type Props = {
  entries: QuestStreakBoardEntry[];
  error: string | null;
};

/**
 * 子供用の掲示板のいちばん上に、画びょう2つで留める家族全員の連続記録（Issue #355・#441）。
 *
 * 出すものは大人用（`QuestStreakBoardSection`）と同じで、文言は `describeQuestStreakEntry` でそろえる。
 * まだ読み込んでいない間（並べる人がいない間）は何も出さない。
 */
export default function ChildStreakNote({ entries, error }: Props) {
  if (!error && entries.length === 0) return null;

  return (
    <View style={styles.streakNote}>
      {[styles.streakPinLeft, styles.streakPinRight].map((position, i) => (
        <View key={i} style={[styles.pin, position, { backgroundColor: NOTICE_BOARD_COLORS.pinRed }]}>
          <View style={styles.pinShine} />
        </View>
      ))}

      <View style={styles.streakHeading}>
        <Ionicons color={NOTICE_BOARD_COLORS.flame} name="flame" size={18} />
        <Furigana accessibilityRole="header" noWrap style={styles.streakTitle}>
          {"{連続|れんぞく}{記録|きろく}"}
        </Furigana>
      </View>
      {/* 子供は承認された完了申請がある日を、申請した日で数える（private.quest_streak_for）。
          承認された日ではなく報告した日なので、「承認されたタスクを報告した日」と書く */}
      <Furigana style={styles.streakGuide}>
        {"{子供|こども}は{承認|しょうにん}されたタスクを{報告|ほうこく}した{日|ひ}、{大人|おとな}はアプリを{開|ひら}いた{日|ひ}をかぞえるよ"}
      </Furigana>

      {error ? (
        <Text accessibilityRole="alert" style={styles.errorText}>
          {error}
        </Text>
      ) : null}

      {entries.map((entry) => {
        const { daysText, isZero, label, nextText } = describeQuestStreakEntry(entry);
        return (
          <View
            accessibilityLabel={label}
            accessible
            key={entry.userId}
            style={styles.streakRow}
            testID={`quest-streak-${entry.userId}`}
          >
            <View style={styles.streakPerson}>
              <Text style={styles.streakName}>
                {entry.name}
                {entry.isSelf ? <Text style={styles.streakSelf}>（じぶん）</Text> : null}
              </Text>
              <Text style={styles.streakNext}>{nextText ?? QUEST_STREAK_UNAVAILABLE_TEXT}</Text>
            </View>
            {daysText ? <Text style={[styles.streakDays, isZero && styles.streakDaysZero]}>{daysText}</Text> : null}
          </View>
        );
      })}
    </View>
  );
}
