import { act, fireEvent, render, screen, waitFor } from "@testing-library/react-native";
import { beforeEach, expect, jest, test } from "@jest/globals";
import { useAppStore } from "../store";

// Issue #424: タスクが承認されてゴルが入ったことを子供に知らせる

jest.mock("expo-router", () => ({
  useFocusEffect: (effect: () => void) => {
    require("react").useEffect(() => {
      effect();
    }, [effect]);
  },
}));

const mockPlayFanfare = jest.fn<() => Promise<void>>(() => Promise.resolve());
jest.mock("../lib/audio", () => ({
  AUDIO_SOURCES: { purchaseSuccess: 1 },
  useSoundEffect: () => mockPlayFanfare,
}));

const mockFetchUnseenQuestRewards = jest.fn<() => Promise<unknown>>();
const mockMarkQuestRewardsSeen = jest.fn<(ids: readonly string[]) => Promise<number>>();
jest.mock("../lib/questRewardService", () => ({
  fetchUnseenQuestRewards: () => mockFetchUnseenQuestRewards(),
  markQuestRewardsSeen: (ids: readonly string[]) => mockMarkQuestRewardsSeen(ids),
}));

import QuestRewardNotice from "../components/QuestRewardNotice";

const child = {
  balance: 0,
  created_at: "2026-07-01T00:00:00Z",
  family_id: "33333333-3333-3333-3333-333333333333",
  id: "11111111-1111-1111-1111-111111111111",
  name: "たろう",
  role: "child" as const,
};

const parent = { ...child, id: "22222222-2222-2222-2222-222222222222", name: "お父さん", role: "parent" as const };

function reward(questLogId: string, title: string, amount: number) {
  return { amount, approvedAt: "2026-10-14T00:00:00Z", questLogId, title };
}

beforeEach(() => {
  jest.clearAllMocks();
  mockFetchUnseenQuestRewards.mockReset();
  mockMarkQuestRewardsSeen.mockReset();
  useAppStore.setState({ user: child });
});

test("1件なら、タスクの名前と入ったゴルを出して音を鳴らす", async () => {
  mockFetchUnseenQuestRewards.mockResolvedValue([reward("log-1", "おさらあらい", 100)]);

  render(<QuestRewardNotice />);

  expect(await screen.findByText("「おさらあらい」の タスクが")).toBeTruthy();
  expect(screen.getByText("みとめられたよ！")).toBeTruthy();
  expect(screen.getByLabelText("プラス100ゴル")).toBeTruthy();
  expect(screen.queryByText("くわしく みる")).toBeNull();
  expect(mockPlayFanfare).toHaveBeenCalledTimes(1);
});

test("複数件なら件数と合計を出し、「くわしく みる」で全部のタスクを見られる", async () => {
  mockFetchUnseenQuestRewards.mockResolvedValue([
    reward("log-1", "おさらあらい", 100),
    reward("log-2", "おふろそうじ", 50),
    reward("log-3", "せんたく", 30),
  ]);

  render(<QuestRewardNotice />);

  expect(await screen.findByText("3つの タスクが")).toBeTruthy();
  expect(screen.getByLabelText("プラス180ゴル")).toBeTruthy();
  expect(screen.queryByText("おふろそうじ")).toBeNull();

  fireEvent.press(screen.getByText("くわしく みる"));

  expect(screen.getByLabelText("おさらあらい、プラス100ゴル")).toBeTruthy();
  expect(screen.getByLabelText("おふろそうじ、プラス50ゴル")).toBeTruthy();
  expect(screen.getByLabelText("せんたく、プラス30ゴル")).toBeTruthy();
});

test("閉じると見せた承認を全部記録し、出し直さない", async () => {
  const onVisibleChange = jest.fn<(visible: boolean) => void>();
  mockFetchUnseenQuestRewards.mockResolvedValue([reward("log-1", "おさらあらい", 100), reward("log-2", "おふろそうじ", 50)]);
  mockMarkQuestRewardsSeen.mockResolvedValue(2);

  render(<QuestRewardNotice onVisibleChange={onVisibleChange} />);
  fireEvent.press(await screen.findByText("やったね！"));

  expect(mockMarkQuestRewardsSeen).toHaveBeenCalledWith(["log-1", "log-2"]);
  expect(screen.queryByText("みとめられたよ！")).toBeNull();
  expect(onVisibleChange).toHaveBeenLastCalledWith(false);
});

test("記録に失敗しても、子供にはエラーを見せずに閉じる", async () => {
  const warn = jest.spyOn(console, "warn").mockImplementation(() => {});
  mockFetchUnseenQuestRewards.mockResolvedValue([reward("log-1", "おさらあらい", 100)]);
  mockMarkQuestRewardsSeen.mockRejectedValue(new Error("通信に失敗しました"));

  render(<QuestRewardNotice />);
  fireEvent.press(await screen.findByText("やったね！"));
  await act(async () => {});

  expect(screen.queryByText("みとめられたよ！")).toBeNull();
  expect(warn).toHaveBeenCalled();
  warn.mockRestore();
});

test("まだ見せていない承認がなければ何も出さない", async () => {
  mockFetchUnseenQuestRewards.mockResolvedValue([]);

  render(<QuestRewardNotice />);

  await waitFor(() => expect(mockFetchUnseenQuestRewards).toHaveBeenCalled());
  expect(screen.queryByText("みとめられたよ！")).toBeNull();
  expect(mockPlayFanfare).not.toHaveBeenCalled();
});

test("大人には取得せず、何も出さない", async () => {
  useAppStore.setState({ user: parent });

  render(<QuestRewardNotice />);
  await act(async () => {});

  expect(mockFetchUnseenQuestRewards).not.toHaveBeenCalled();
  expect(screen.queryByText("みとめられたよ！")).toBeNull();
});
