import { Pressable, Text, View } from "react-native";
import type { QuestCategory } from "../../types";
import { taskStyles as styles } from "./taskStyles";
import { QUEST_CATEGORY_LABELS } from "./taskUtils";

const categories = Object.keys(QUEST_CATEGORY_LABELS) as QuestCategory[];

type TaskFolderTabsProps = {
  activeCategory: QuestCategory;
  onChange: (category: QuestCategory) => void;
};

export default function TaskFolderTabs({ activeCategory, onChange }: TaskFolderTabsProps) {
  return (
    <View accessibilityRole="tablist" style={styles.tabsRow}>
      {categories.map((category) => {
        const isActive = category === activeCategory;

        return (
          <Pressable
            accessibilityRole="tab"
            accessibilityState={{ selected: isActive }}
            key={category}
            onPress={() => onChange(category)}
            style={[styles.folderTab, isActive && styles.folderTabActive]}
          >
            <View style={[styles.folderTabTop, isActive && styles.folderTabTopActive]} />
            <Text style={[styles.folderTabText, isActive && styles.folderTabTextActive]}>
              {QUEST_CATEGORY_LABELS[category]}
            </Text>
          </Pressable>
        );
      })}
    </View>
  );
}
