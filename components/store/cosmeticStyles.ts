import { StyleSheet } from "react-native";
import { CHILD_THEME } from "../childTheme";

/**
 * 子供用ストアの「きせかえ・かざり」の棚（Issue #225）。
 * 色はストアの棚（storeStyles.ts）と同じ木と羊皮紙の世界観にそろえる。
 */
export const cosmeticStyles = StyleSheet.create({
  tabRow: {
    flexDirection: "row",
    gap: 8,
    justifyContent: "center",
    marginBottom: 10,
  },
  tab: {
    backgroundColor: "#2a2036",
    borderColor: CHILD_THEME.fadedBeige,
    borderRadius: 10,
    borderWidth: 1,
    minHeight: 40,
    justifyContent: "center",
    paddingHorizontal: 14,
  },
  tabSelected: {
    backgroundColor: CHILD_THEME.gold,
    borderColor: CHILD_THEME.paleYellow,
  },
  tabText: {
    color: "#c7bca8",
    fontSize: 13,
    fontWeight: "800",
  },
  tabTextSelected: {
    color: CHILD_THEME.darkWood,
  },
  scroll: {
    flex: 1,
  },
  scrollContent: {
    paddingBottom: 12,
  },
  sectionTitle: {
    color: CHILD_THEME.brightYellow,
    fontSize: 14,
    fontWeight: "900",
    marginBottom: 8,
    marginTop: 6,
  },
  grid: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8,
  },
  card: {
    alignItems: "center",
    backgroundColor: "#2a2036",
    borderColor: "#5b4636",
    borderRadius: 12,
    borderWidth: 1,
    minHeight: 112,
    paddingHorizontal: 6,
    paddingVertical: 10,
    width: "31%",
  },
  cardOwned: {
    opacity: 0.6,
  },
  cardPressed: {
    opacity: 0.7,
    transform: [{ scale: 0.97 }],
  },
  cardTitle: {
    color: CHILD_THEME.parchment,
    fontSize: 12,
    fontWeight: "800",
    marginTop: 6,
    textAlign: "center",
  },
  cardPrice: {
    color: CHILD_THEME.brightYellow,
    fontSize: 13,
    fontWeight: "900",
    marginTop: 4,
  },
  ownedBadge: {
    color: "#c7bca8",
    fontSize: 11,
    fontWeight: "800",
    marginTop: 4,
  },
  note: {
    color: "#cbbd9f",
    fontSize: 11,
    fontWeight: "700",
    marginTop: 10,
    textAlign: "center",
  },
});
