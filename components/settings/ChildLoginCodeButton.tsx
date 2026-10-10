import { useCallback, useEffect, useRef, useState } from "react";
import { useFocusEffect } from "expo-router";
import { Pressable, Text, View } from "react-native";
import { issueChildLoginCode, type ChildLoginCode } from "../../lib/childLoginService";
import { ERROR_TEXT_CLASS } from "../../constants/ui";

/** コードは画面を離れたら破棄し、履歴や永続ストアには保存しない。 */
export default function ChildLoginCodeButton({ childId, name, enabled }: { childId: string; name: string; enabled: boolean }) {
  const [issued, setIssued] = useState<ChildLoginCode | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [expired, setExpired] = useState(false);
  const submitting = useRef(false);
  const generation = useRef(0);
  useFocusEffect(useCallback(() => () => {
    generation.current++;
    submitting.current = false;
    setBusy(false);
    setIssued(null);
    setError("");
  }, []));
  useEffect(() => {
    generation.current++;
    setIssued(null);
    setError("");
    setBusy(false);
    submitting.current = false;
    return () => { generation.current++; };
  }, [childId, enabled]);
  useEffect(() => {
    if (!issued) return;
    const remaining = Date.parse(issued.expiresAt) - Date.now();
    setExpired(remaining <= 0);
    const timer = setTimeout(() => setExpired(true), Math.max(0, remaining));
    return () => clearTimeout(timer);
  }, [issued]);
  const issue = async () => {
    if (!enabled || submitting.current) return;
    submitting.current = true;
    const current = generation.current;
    setBusy(true);
    setIssued(null);
    setError("");
    try {
      const result = await issueChildLoginCode(childId);
      if (generation.current === current) setIssued(result);
    } catch (cause) {
      if (generation.current === current) setError(cause instanceof Error ? cause.message : "コードを発行できませんでした");
    } finally {
      if (generation.current === current) { submitting.current = false; setBusy(false); }
    }
  };
  return <View className="gap-2">
    <Pressable accessibilityLabel={`${name}さんのログインコードを発行`} accessibilityRole="button"
      accessibilityState={{ disabled: !enabled || busy }} disabled={!enabled || busy} onPress={issue}
      className="self-start rounded-full bg-blue-50 px-4 py-2">
      <Text className="text-sm font-semibold text-blue-700">{busy ? "発行中..." : "ログインコードを発行"}</Text>
    </Pressable>
    {issued && enabled ? <View className="gap-1 rounded-xl bg-slate-50 p-3">
      {expired ? <Text className="text-sm text-slate-600">コードの有効期限が切れました。再発行してください。</Text> : <>
        <Text selectable accessibilityLabel={`${name}さんのログインコード`} className="text-2xl font-bold text-slate-900">{issued.code}</Text>
        <Text className="text-xs text-slate-600">有効期限：{new Date(issued.expiresAt).toLocaleTimeString("ja-JP", { hour: "2-digit", minute: "2-digit" })}（1回のみ）</Text>
      </>}
      <Text className="text-xs text-slate-600">子供の端末の「こどもはこちら」で入力します。ログインすると以前の端末は使えなくなります。再発行すると前のコードは使えません。</Text>
    </View> : null}
    {error ? <Text accessibilityRole="alert" className={`text-xs ${ERROR_TEXT_CLASS}`}>{error}</Text> : null}
  </View>;
}
