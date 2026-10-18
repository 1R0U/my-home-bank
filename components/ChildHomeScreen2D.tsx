import { useFocusEffect, useRouter } from "expo-router";
import { useCallback, useState } from "react";
import { Pressable, Text, View } from "react-native";
import { useMapStore } from "../store/mapStore";
import { type BuildingMapObject, type NpcMapObject } from "../types/map";
import { resolveMapRoute, TELEPORT_ROUTES } from "../lib/rpg-hub/routes";
import { useActiveRole } from "../store";
import { SEASON_COLORS } from "../lib/rpg-hub/seasonalLook";
import { getBuildingMapLabel } from "../lib/rpg-hub/minimap";

export default function ChildHomeScreen2D() {
  const router = useRouter();
  // 行き先は3D版と同じ決め方にそろえる（ロールで変わる／Issue #247）。
  const role = useActiveRole();
  const objects = useMapStore((state) => state.objects);
  const currentSeason = useMapStore((state) => state.currentSeason);
  const [navigationLocked, setNavigationLocked] = useState(false);
  // 家族一人ひとりの家（Issue #244）のラベルに名前を出すため。既に objects に混ざっている
  // 家族NPCの名前を使う（1R0Uさんレビュー指摘：lib/useFamilyMembers.ts を別に使うと、
  // 家族の取得が2重になり、モックアカウントとの取り方のずれも起きうる）。
  const familyMemberNames = Object.fromEntries(
    objects
      .filter((object): object is NpcMapObject & { familyMemberId: string } =>
        object.type === "npc" && !!object.familyMemberId,
      )
      .map((npc) => [npc.familyMemberId, npc.name]),
  );

  // 戻って画面が再フォーカスされた時に必ず入力を再有効化する。
  useFocusEffect(
    useCallback(() => {
      setNavigationLocked(false);
    }, []),
  );

  // 自分の家（house）と家の中の玄関（exit）は、3D版（RpgHubScreen.tsx）ではテレポートで出入りする
  // 場所で、画面遷移ではない（Issue #444）。この2D比較画面には行き先が無いので、ボタンを出さない
  // （出すと押しても何も起きないボタンになる。1R0Uさんレビュー指摘）。
  const buildings = objects.filter(
    (object): object is BuildingMapObject =>
      object.type === "building" && !TELEPORT_ROUTES.has(object.route),
  );

  // resolveMapRoute はテレポート系の建物に /rpg-hub という「表を満たすためだけの未使用の
  // フォールバック」を返す。ボタンは上で除いてあるが、念のためここでも素通しせず無視する
  // （素通しすると未使用のはずの値へ実際に遷移してしまう。1R0Uさんレビュー指摘）。
  const handleBuildingPress = (object: BuildingMapObject) => {
    if (navigationLocked || TELEPORT_ROUTES.has(object.route)) return;
    setNavigationLocked(true);
    try {
      router.push(resolveMapRoute(object.route, role));
    } catch (error) {
      console.warn("2D比較画面の遷移に失敗しました", error);
      setNavigationLocked(false);
    }
  };

  return (
    <View
      className="flex-1"
      style={{ backgroundColor: SEASON_COLORS[currentSeason].sky }}
    >
      <View className="px-5 pt-14">
        <View className="rounded-2xl bg-white/90 px-4 py-3">
          <Text className="text-lg font-bold text-slate-900">我が家タウン（2D比較用）</Text>
          <Text className="mt-1 text-xs text-slate-600">
            建物をタップして、家族の冒険を始めよう
          </Text>
        </View>
      </View>

      <View className="gap-3 px-5 pt-6">
        {buildings.map((object) => (
          <Pressable
            key={object.id}
            accessibilityRole="button"
            className="rounded-xl bg-white/90 px-5 py-4 active:bg-white"
            onPress={() => handleBuildingPress(object)}
          >
            <Text className="text-center text-base font-semibold text-slate-900">
              {getBuildingMapLabel(object, familyMemberNames)}
            </Text>
          </Pressable>
        ))}
      </View>

      {navigationLocked && (
        <View
          className="absolute inset-0 items-center justify-center bg-slate-950/20"
          pointerEvents="auto"
        >
          <View className="rounded-full bg-white px-5 py-3">
            <Text className="font-semibold text-slate-700">移動しています…</Text>
          </View>
        </View>
      )}
    </View>
  );
}
