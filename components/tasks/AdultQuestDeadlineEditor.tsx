import { useEffect, useRef, useState } from "react";
import { Pressable, Text, View } from "react-native";
import { ERROR_TEXT_CLASS, NOTICE_TEXT_CLASS } from "../../constants/ui";
import { toErrorMessage } from "../../lib/errorMessage";
import { formatQuestDeadline, parseQuestDeadlineInput, questDeadlineInputError } from "../../lib/questDeadline";
import { updateQuestDeadline } from "../../lib/taskService";
import type { Quest } from "../../types";
import QuestDeadlineField from "./QuestDeadlineField";

/** タスクごとの初期化は呼び出し元のkeyに任せ、自分の保存結果の再取得では成功表示を保つ。 */
export default function AdultQuestDeadlineEditor({ quest, canWrite, onSaved }: {
  quest: Quest;
  canWrite: boolean;
  onSaved: () => void;
}) {
  const original = quest.expires_at ? formatQuestDeadline(quest.expires_at) : "";
  const [value, setValue] = useState(original);
  const [savedValue, setSavedValue] = useState(original);
  const hasEditedRef = useRef(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    // 編集を始めたら、詳細を閉じるまで入力と保存結果を優先する。
    // 応答に更新版番号がないため、保存後の古い再取得と外部更新を区別できない。
    if (hasEditedRef.current) return;
    setValue(original);
    setSavedValue(original);
    setError(null);
    setSaved(false);
  }, [original]);

  const canSave = canWrite && !busy && value !== savedValue && !questDeadlineInputError(value);
  const save = async () => {
    if (!canSave) return;
    setBusy(true);
    setError(null);
    setSaved(false);
    try {
      await updateQuestDeadline(quest.id, parseQuestDeadlineInput(value));
      setSavedValue(value);
      setSaved(true);
      onSaved();
    } catch (cause) {
      setError(toErrorMessage(cause, "期限の更新に失敗しました"));
    } finally {
      setBusy(false);
    }
  };

  return (
    <View>
      <QuestDeadlineField disabled={busy || !canWrite} onChange={(text) => {
        hasEditedRef.current = true;
        setValue(text);
        setSaved(false);
      }} value={value} />
      <Pressable
        accessibilityRole="button"
        accessibilityState={{ disabled: !canSave }}
        className={`mt-3 items-center rounded-xl py-3 ${canSave ? "bg-slate-900" : "bg-slate-200"}`}
        disabled={!canSave}
        onPress={save}
      >
        <Text className={`text-sm font-bold ${canSave ? "text-white" : "text-slate-400"}`}>期限を保存</Text>
      </Pressable>
      {error ? <Text className={`mt-2 text-xs ${ERROR_TEXT_CLASS}`}>{error}</Text> : null}
      {saved ? <Text className={`mt-2 text-xs ${NOTICE_TEXT_CLASS}`}>期限を更新しました</Text> : null}
    </View>
  );
}
