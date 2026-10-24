import { fireEvent, render, screen } from "@testing-library/react-native";
import { expect, jest, test } from "@jest/globals";

// Issue #424: `npm run start:child`（開発用ロール）では、DBなしでデモ用の承認を出す

jest.mock("../lib/devRole", () => ({ DEV_ROLE_OVERRIDE: "child" }));

jest.mock("expo-router", () => ({
  useFocusEffect: (effect: () => void) => {
    require("react").useEffect(() => {
      effect();
    }, [effect]);
  },
}));

jest.mock("../lib/audio", () => ({
  AUDIO_SOURCES: { purchaseSuccess: 1 },
  useSoundEffect: () => () => Promise.resolve(),
}));

const mockFetchUnseenQuestRewards = jest.fn<() => Promise<unknown>>();
const mockMarkQuestRewardsSeen = jest.fn<(ids: readonly string[]) => Promise<number>>();
jest.mock("../lib/questRewardService", () => ({
  fetchUnseenQuestRewards: () => mockFetchUnseenQuestRewards(),
  markQuestRewardsSeen: (ids: readonly string[]) => mockMarkQuestRewardsSeen(ids),
}));

import QuestRewardNotice from "../components/QuestRewardNotice";

test("開発用ロールの子供には、取得せずにデモ用の承認を出し、閉じてもDBへ記録しない", async () => {
  await render(<QuestRewardNotice />);

  expect(await screen.findByText("3つの タスクが")).toBeTruthy();
  expect(screen.getByLabelText("プラス180ゴル")).toBeTruthy();
  expect(mockFetchUnseenQuestRewards).not.toHaveBeenCalled();

  await fireEvent.press(screen.getByText("やったね！"));

  expect(screen.queryByText("みとめられたよ！")).toBeNull();
  expect(mockMarkQuestRewardsSeen).not.toHaveBeenCalled();
});
