import { StyleSheet } from "react-native";
import { CHILD_THEME } from "../childTheme";

/** 子供用の貯金画面（`ChildSavingsScreen`）の見た目。木の板と羊皮紙の世界観（Issue #440）。 */
const WOOD = "#3a2416";
const WOOD_EDGE = "#9b6338";
const PARCHMENT_CARD = "#f4e4bc";
const DISABLED = "#8a7a63";
const ERROR = "#8f1d1d";

export const childSavingsStyles = StyleSheet.create({
  safeArea: { flex: 1, backgroundColor: WOOD },
  content: { padding: 18, paddingBottom: 48 },
  title: { color: CHILD_THEME.parchment, fontSize: 25, fontWeight: "900", letterSpacing: 1, marginBottom: 6 },
  lead: { color: CHILD_THEME.parchment, fontSize: 14, lineHeight: 20, marginBottom: 12 },
  card: {
    backgroundColor: PARCHMENT_CARD,
    borderColor: CHILD_THEME.fadedBeige,
    borderRadius: 16,
    borderWidth: 3,
    marginVertical: 8,
    padding: 16,
  },
  cardTitle: { color: CHILD_THEME.darkWood, fontSize: 16, fontWeight: "900", marginBottom: 4 },
  text: { color: CHILD_THEME.darkWood, fontSize: 14, lineHeight: 22 },
  note: { color: CHILD_THEME.darkWood, fontSize: 12, lineHeight: 18, marginTop: 6, opacity: 0.85 },
  historyItem: { color: CHILD_THEME.darkWood, fontSize: 12, marginTop: 6 },
  message: { color: CHILD_THEME.darkWood, fontSize: 14, fontWeight: "700" },
  error: { color: ERROR, fontSize: 14, fontWeight: "700" },
  input: {
    backgroundColor: CHILD_THEME.parchment,
    borderColor: WOOD_EDGE,
    borderRadius: 12,
    borderWidth: 2,
    color: CHILD_THEME.darkWood,
    fontSize: 16,
    marginTop: 10,
    padding: 12,
  },
  button: {
    alignItems: "center",
    backgroundColor: CHILD_THEME.brightYellow,
    borderColor: CHILD_THEME.paleYellow,
    borderRadius: 14,
    borderWidth: 2,
    marginTop: 12,
    padding: 14,
  },
  buttonDisabled: { backgroundColor: DISABLED, borderColor: DISABLED },
  buttonText: { color: CHILD_THEME.darkWood, fontSize: 16, fontWeight: "900" },
});
