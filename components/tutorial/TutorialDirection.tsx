import { Ionicons } from "@expo/vector-icons";
import { StyleSheet, View } from "react-native";
import { BUILDING_MAP_FURIGANA_LABELS } from "../../lib/rpg-hub/minimap";
import { getTutorialArrowRotation } from "../../lib/rpg-hub/tutorialArrow";
import type { MapObject } from "../../types/map";
import { CHILD_THEME } from "../childTheme";
import Furigana from "../Furigana";
import { useTutorial } from "./TutorialContext";

/** ミニマップとメニューの間で行き先を示す。町のタップや移動を妨げない。 */
export default function TutorialDirection({ objects, player, nearbyId }: {
  objects: MapObject[];
  player: { x: number; z: number };
  nearbyId: string | null;
}) {
  const tutorial = useTutorial();
  if (tutorial?.role !== "child" || tutorial.mode !== "running" || !tutorial.step?.townRoute) return null;
  const target = objects.find((object) => object.type === "building" && object.route === tutorial.step.townRoute);
  if (target?.type !== "building") return null;
  const rotation = getTutorialArrowRotation(player, target);
  const arrived = nearbyId === target.id || rotation === null;
  return <View pointerEvents="none" style={styles.container} testID="tutorial-direction">
    <View testID="tutorial-direction-arrow" style={[styles.arrow, { transform: [{ rotate: `${arrived ? 0 : rotation}deg` }] }]}>
      <Ionicons
        name={arrived ? "checkmark" : "arrow-up"}
        size={40}
        color={CHILD_THEME.tutorialRed}
      />
    </View>
    <Furigana style={styles.label}>{BUILDING_MAP_FURIGANA_LABELS[target.route]}</Furigana>
    {arrived && <Furigana style={styles.hint}>{target.route === "board" ? "「{見|み}る」を{押|お}そう" : "「{入|はい}る」を{押|お}そう"}</Furigana>}
  </View>;
}

const styles = StyleSheet.create({
  container: { alignItems: "center", gap: 3 },
  arrow: { borderRadius: 28, backgroundColor: CHILD_THEME.parchment, padding: 4 },
  label: { color: CHILD_THEME.darkWood, backgroundColor: CHILD_THEME.parchment, borderRadius: 6, paddingHorizontal: 6, fontSize: 12, fontWeight: "bold" },
  hint: { color: CHILD_THEME.darkWood, backgroundColor: CHILD_THEME.parchment, borderRadius: 6, paddingHorizontal: 4, fontSize: 10 },
});
