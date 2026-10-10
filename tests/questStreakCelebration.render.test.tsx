import { act, fireEvent, render, screen, waitFor } from "@testing-library/react-native";
import { beforeEach, expect, jest, test } from "@jest/globals";
import { useAppStore } from "../store";

// Issue #372: 連続記録がキリのいい日数に届いたときのお祝い

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

const mockFetchQuestStreak = jest.fn<(userId?: string) => Promise<unknown>>();
const mockRecordQuestStreakCelebration = jest.fn<(days: number) => Promise<boolean>>();
jest.mock("../lib/questStreakService", () => ({
  fetchQuestStreak: (userId?: string) => mockFetchQuestStreak(userId),
  recordQuestStreakCelebration: (days: number) => mockRecordQuestStreakCelebration(days),
}));

import QuestStreakCelebration from "../components/QuestStreakCelebration";

const child = {
  balance: 0,
  created_at: "2026-07-01T00:00:00Z",
  family_id: "33333333-3333-3333-3333-333333333333",
  id: "11111111-1111-1111-1111-111111111111",
  name: "たろう",
  role: "child" as const,
};

const parent = { ...child, id: "22222222-2222-2222-2222-222222222222", name: "お父さん", role: "parent" as const };

function streakWith(pendingMilestone: number | null) {
  return { currentDays: 7, lastActiveOn: "2026-10-10", pendingMilestone, startedOn: "2026-10-04" };
}

beforeEach(() => {
  jest.clearAllMocks();
  mockFetchQuestStreak.mockReset();
  mockRecordQuestStreakCelebration.mockReset();
  useAppStore.setState({ user: child });
});

test("まだお祝いしていない日数があれば、お祝いを出して音を鳴らす", async () => {
  mockFetchQuestStreak.mockResolvedValue(streakWith(7));

  render(<QuestStreakCelebration />);

  expect(await screen.findByText("1しゅうかん")).toBeTruthy();
  expect(screen.getByText("れんぞく たっせい！")).toBeTruthy();
  expect(mockPlayFanfare).toHaveBeenCalledTimes(1);
});

test("閉じるとお祝いしたことを記録し、出し直さない", async () => {
  mockFetchQuestStreak.mockResolvedValue(streakWith(7));
  mockRecordQuestStreakCelebration.mockResolvedValue(true);

  render(<QuestStreakCelebration />);
  fireEvent.press(await screen.findByText("やったね！"));

  expect(mockRecordQuestStreakCelebration).toHaveBeenCalledWith(7);
  expect(screen.queryByText("れんぞく たっせい！")).toBeNull();
});

test("記録に失敗しても、子供にはエラーを見せずに閉じる", async () => {
  const warn = jest.spyOn(console, "warn").mockImplementation(() => {});
  mockFetchQuestStreak.mockResolvedValue(streakWith(3));
  mockRecordQuestStreakCelebration.mockRejectedValue(new Error("通信に失敗しました"));

  render(<QuestStreakCelebration />);
  fireEvent.press(await screen.findByText("やったね！"));
  await act(async () => {});

  expect(screen.queryByText("れんぞく たっせい！")).toBeNull();
  expect(warn).toHaveBeenCalled();
  warn.mockRestore();
});

test("お祝いする日数がなければ何も出さない", async () => {
  mockFetchQuestStreak.mockResolvedValue(streakWith(null));

  render(<QuestStreakCelebration />);

  await waitFor(() => expect(mockFetchQuestStreak).toHaveBeenCalled());
  expect(screen.queryByText("れんぞく たっせい！")).toBeNull();
  expect(mockPlayFanfare).not.toHaveBeenCalled();
});

test("大人には連続記録を取らず、何も出さない", async () => {
  useAppStore.setState({ user: parent });

  render(<QuestStreakCelebration />);
  await act(async () => {});

  expect(mockFetchQuestStreak).not.toHaveBeenCalled();
  expect(screen.queryByText("れんぞく たっせい！")).toBeNull();
});
