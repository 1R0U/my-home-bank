import { useCallback, useEffect, useState } from "react";
import { Pressable, Text, TextInput, View } from "react-native";
import {
  createChildAccount,
  fetchFamilyChildren,
  getChildNameDraftState,
  type FamilyChild,
} from "../../lib/childAccountService";
import { toErrorMessage } from "../../lib/errorMessage";
import { fetchUserFamilyId } from "../../lib/userService";
import { useCurrentUser, useDataAccess } from "../../store";
import { ERROR_TEXT_CLASS, NOTICE_TEXT_CLASS, PLACEHOLDER_TEXT_COLOR, PREVIEW_DISABLED_NOTICE } from "../../constants/ui";

/**
 * 親の設定画面で、家族の子供を一覧し、子供アカウントを追加する欄（Issue #264）。
 *
 * 実データに書き込めるとき（Supabase Authでログイン中）だけ取得・追加する。
 * プレビュー中は入力欄だけを出し、ボタンは押せない。
 */
export default function FamilyChildrenPanel() {
  const currentUser = useCurrentUser();
  const { canUseRealData } = useDataAccess();
  const userId = canUseRealData ? currentUser?.id ?? null : null;

  const [children, setChildren] = useState<FamilyChild[]>([]);
  const [isLoading, setIsLoading] = useState(userId !== null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [draftName, setDraftName] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [addedName, setAddedName] = useState<string | null>(null);

  const draft = getChildNameDraftState(draftName);
  const canSubmit = canUseRealData && draft.canSubmit && !isSubmitting && !isLoading;

  const loadChildren = useCallback(async () => {
    if (!userId) return;
    setLoadError(null);
    try {
      const familyId = await fetchUserFamilyId(userId);
      setChildren(familyId ? await fetchFamilyChildren(familyId) : []);
    } catch (e) {
      setLoadError(toErrorMessage(e, "家族の子供を取得できませんでした"));
    }
  }, [userId]);

  useEffect(() => {
    if (!userId) {
      setIsLoading(false);
      return;
    }
    setIsLoading(true);
    loadChildren().finally(() => setIsLoading(false));
  }, [loadChildren, userId]);

  const handleAdd = async () => {
    if (!canSubmit) return;
    setSubmitError(null);
    setAddedName(null);
    setIsSubmitting(true);
    try {
      await createChildAccount(draft.trimmed);
      setAddedName(draft.trimmed);
      setDraftName("");
      await loadChildren();
    } catch (e) {
      setSubmitError(toErrorMessage(e, "子供アカウントを追加できませんでした"));
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <View className="gap-3">
      {isLoading ? (
        <Text className="text-sm text-slate-500">読み込み中...</Text>
      ) : children.length === 0 ? (
        <Text className="text-sm text-slate-500">まだ子供が登録されていません</Text>
      ) : (
        <View accessible accessibilityLabel="家族の子供" className="gap-2">
          {children.map((child) => (
            <Text className="text-sm font-medium text-slate-900" key={child.id}>
              {child.name}
            </Text>
          ))}
        </View>
      )}
      {loadError ? <Text className={`text-xs ${ERROR_TEXT_CLASS}`}>{loadError}</Text> : null}

      <View className="gap-2">
        <Text className="text-sm text-slate-500">子供を追加</Text>
        <TextInput
          accessibilityLabel="追加する子供の名前"
          className="rounded-xl bg-slate-50 px-4 py-3 text-sm text-slate-900"
          editable={canUseRealData && !isSubmitting}
          onChangeText={setDraftName}
          placeholder="名前"
          placeholderTextColor={PLACEHOLDER_TEXT_COLOR}
          value={draftName}
        />
        {draft.error ? <Text className={`text-xs ${ERROR_TEXT_CLASS}`}>{draft.error}</Text> : null}
      </View>

      <Pressable
        accessibilityLabel="子供を追加"
        accessibilityRole="button"
        accessibilityState={{ disabled: !canSubmit }}
        className={`self-end rounded-full px-6 py-2 ${canSubmit ? "bg-blue-600 active:bg-blue-700" : "bg-slate-300"}`}
        disabled={!canSubmit}
        onPress={handleAdd}
      >
        <Text className="text-sm font-semibold text-white">{isSubmitting ? "追加中..." : "追加"}</Text>
      </Pressable>

      {!canUseRealData ? <Text className={`text-xs ${NOTICE_TEXT_CLASS}`}>{PREVIEW_DISABLED_NOTICE}</Text> : null}
      {submitError ? <Text className={`text-xs ${ERROR_TEXT_CLASS}`}>{submitError}</Text> : null}
      {addedName ? (
        <Text className="text-xs text-slate-600">
          {addedName}さんを追加しました。子供の端末でログインするためのコードは、今後この画面から発行できるようにします。
        </Text>
      ) : null}
    </View>
  );
}
