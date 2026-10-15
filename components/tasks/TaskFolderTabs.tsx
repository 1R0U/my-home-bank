import { View } from "react-native";
import type { QuestCategory } from "../../types";
import { taskStyles as styles } from "./taskStyles";
import TutorialPressable from "../tutorial/TutorialPressable";
import { useTutorial } from "../tutorial/TutorialContext";
import { stripFurigana } from "../../lib/furigana";
import Furigana from "../Furigana";
import { QUEST_CATEGORY_LABELS_FOR_CHILD } from "./taskUtils";

const categories = Object.keys(QUEST_CATEGORY_LABELS_FOR_CHILD) as QuestCategory[];

type TaskFolderTabsProps = {
  activeCategory: QuestCategory;
  onChange: (category: QuestCategory) => void;
};

export default function TaskFolderTabs({ activeCategory, onChange }: TaskFolderTabsProps) {
  const tutorial = useTutorial();
  const highlightedCategory = categories.find((category) => tutorial?.step?.id === `child-${category}`);
  return (
    <View accessibilityRole="tablist" style={[styles.tabsRow, highlightedCategory && { alignItems: "center" }]}>
      {categories.map((category, index) => {
        const isActive = category === activeCategory;

        return (
          <TutorialPressable tutorialId={`child-${category}`}
            // 名前を中の文字から組み立てると、ふりがなまで読まれるため明示する（Issue #347）
            accessibilityLabel={stripFurigana(QUEST_CATEGORY_LABELS_FOR_CHILD[category])}
            accessibilityRole="tab"
            accessibilityState={{ selected: isActive }}
            key={category}
            onPress={() => onChange(category)}
            style={[
              styles.categoryTab,
              index === 0 && styles.categoryTabFirst,
              isActive && styles.categoryTabActive,
              // tabsRow・boardFrameの内側に枠を収め、overflow: hiddenで切れないようにする。
              highlightedCategory === category && { margin: 9 },
            ]}
          >
            <Furigana noWrap style={[styles.categoryTabText, isActive && styles.categoryTabTextActive, highlightedCategory && { fontSize: 14 }]}>
              {QUEST_CATEGORY_LABELS_FOR_CHILD[category]}
            </Furigana>
          </TutorialPressable>
        );
      })}
    </View>
  );
}
