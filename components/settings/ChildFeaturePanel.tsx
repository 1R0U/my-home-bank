import { useState } from "react";
import { Switch, Text, View } from "react-native";
import { CHILD_FEATURES, isChildFeatureEnabled } from "../../lib/childFeatures";
import { setChildFeatureEnabled } from "../../lib/childFeatureService";
import { toErrorMessage } from "../../lib/errorMessage";
import { useChildFeatureRestrictions } from "../../lib/useChildFeatureRestrictions";
import { useFamilyMembers } from "../../lib/useFamilyMembers";
import type { ChildFeature } from "../../types";
import { ERROR_TEXT_CLASS, NOTICE_TEXT_CLASS, PREVIEW_DISABLED_NOTICE } from "../../constants/ui";
import ErrorWithRetry from "../ErrorWithRetry";
import LoadingSpinner from "../LoadingSpinner";

/**
 * 親の設定画面で、子供ごとに機能を使う・使わないを切り替える欄（Issue #348）。
 *
 * 切り替えはすぐに保存する（通知のスイッチと同じ）。保存に成功してから表示を変える。
 * プレビュー中は子供の一覧だけを出し、スイッチは押せない。
 */
export default function ChildFeaturePanel() {
  const { members, loading: membersLoading, error: membersError, reload: reloadMembers } = useFamilyMembers({
    errorMessage: "家族の子供を取得できませんでした",
    requireRealData: true,
  });
  const { restrictions, loading, error, hasData, isLive, reload, updateData } = useChildFeatureRestrictions();
  // 保存中の「子供:機能」。保存中はその1つだけ押せなくする
  const [savingKey, setSavingKey] = useState<string | null>(null);
  const [saveError, setSaveError] = useState<string | null>(null);

  const children = members.filter((member) => member.role === "child");
  // スピナーは、設定をまだ一度も取れていないときだけ出す。取り直し中（切り替えの保存後・画面に戻ったとき）は
  // スイッチを残す。消すと切り替えのたびに一覧がちらつき、読み上げのフォーカスも外れる
  const isLoading = membersLoading || (isLive && loading && !hasData);

  const handleToggle = async (userId: string, feature: ChildFeature, enabled: boolean) => {
    if (!isLive || savingKey) return;
    setSaveError(null);
    setSavingKey(`${userId}:${feature}`);
    try {
      await setChildFeatureEnabled(userId, feature, enabled);
      updateData((rows) => [
        ...rows.filter((row) => !(row.user_id === userId && row.feature === feature)),
        ...(enabled ? [] : [{ feature, user_id: userId }]),
      ]);
      await reload();
    } catch (e) {
      setSaveError(toErrorMessage(e, "機能の切り替えを保存できませんでした"));
    } finally {
      setSavingKey(null);
    }
  };

  return (
    <View className="gap-3">
      <Text className="text-xs text-slate-500">
        子供ごとに、使わない機能をオフにできます。オフにした機能の建物は町に残りますが、中には入れません。
      </Text>

      {isLoading ? (
        <LoadingSpinner className="items-center justify-center py-4" label="子供ごとの機能を読み込み中" />
      ) : membersError ? (
        // 子供の一覧が取れていないので、「まだ子供が登録されていません」とは言えない
        <ErrorWithRetry message={membersError} onRetry={() => void reloadMembers()} retryLabel="家族の子供の取得を再試行" />
      ) : isLive && error && !hasData ? (
        // 設定が取れていないのにスイッチを出すと、使わないにした機能まで「オン」に見える
        <ErrorWithRetry message={error} onRetry={() => void reload()} retryLabel="子供ごとの機能の取得を再試行" />
      ) : children.length === 0 ? (
        <Text className="text-sm text-slate-500">まだ子供が登録されていません</Text>
      ) : (
        <View className="gap-4">
          {children.map((child) => (
            <View className="gap-2" key={child.id}>
              <Text className="text-sm font-medium text-slate-900">{child.name}</Text>
              {CHILD_FEATURES.map((feature) => {
                const enabled = isChildFeatureEnabled(restrictions, child.id, feature.id);
                const disabled = !isLive || savingKey !== null;
                return (
                  <View className="flex-row items-center justify-between gap-3" key={feature.id}>
                    <View className="flex-1">
                      <Text className="text-sm text-slate-700">{feature.label}</Text>
                      <Text className="text-xs text-slate-500">{feature.description}</Text>
                    </View>
                    <Switch
                      // 状態（オン・オフ）は accessibilityState で読み上げる。ラベルにも入れると二重に読まれる
                      accessibilityLabel={`${child.name}の${feature.label}`}
                      accessibilityState={{ checked: enabled, disabled }}
                      disabled={disabled}
                      onValueChange={(value) => handleToggle(child.id, feature.id, value)}
                      value={enabled}
                    />
                  </View>
                );
              })}
            </View>
          ))}
        </View>
      )}

      {!isLive ? <Text className={`text-xs ${NOTICE_TEXT_CLASS}`}>{PREVIEW_DISABLED_NOTICE}</Text> : null}
      {/* 一度取れた設定の取り直しに失敗したときは、スイッチは残してエラーだけ添える */}
      {error && hasData ? <Text className={`text-xs ${ERROR_TEXT_CLASS}`}>{error}</Text> : null}
      {saveError ? <Text className={`text-xs ${ERROR_TEXT_CLASS}`}>{saveError}</Text> : null}
    </View>
  );
}
