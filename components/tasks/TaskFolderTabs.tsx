import { Text, View } from "react-native";
import type { QuestCategory } from "../../types";
import { taskStyles as styles } from "./taskStyles";
import { QUEST_CATEGORY_LABELS } from "./taskUtils";
import TutorialPressable from "../tutorial/TutorialPressable";

const categories = Object.keys(QUEST_CATEGORY_LABELS) as QuestCategory[];

type TaskFolderTabsProps = {
  activeCategory: QuestCategory;
  onChange: (category: QuestCategory) => void;
};

export default function TaskFolderTabs({ activeCategory, onChange }: TaskFolderTabsProps) {
  return (
    <View accessibilityRole="tablist" style={styles.tabsRow}>
      {categories.map((category, index) => {
        const isActive = category === activeCategory;

        return (
          <TutorialPressable tutorialId={`child-${category}`}
            accessibilityRole="tab"
            accessibilityState={{ selected: isActive }}
            key={category}
            onPress={() => onChange(category)}
            style={[
              styles.categoryTab,
              index === 0 && styles.categoryTabFirst,
              isActive && styles.categoryTabActive,
            ]}
          >
            <Text style={[styles.categoryTabText, isActive && styles.categoryTabTextActive]}>
              {QUEST_CATEGORY_LABELS[category]}
            </Text>
          </TutorialPressable>
        );
      })}
    </View>
  );
}
