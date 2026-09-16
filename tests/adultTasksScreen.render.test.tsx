import { fireEvent, render, screen } from "@testing-library/react-native";
import { beforeEach, expect, jest, test } from "@jest/globals";
import AdultTasksScreen from "../components/AdultTasksScreen";
import { useAppStore } from "../store";

jest.mock("expo-router", () => ({
  Stack: { Screen: () => null },
  useLocalSearchParams: () => ({}),
}));

const mockFetchQuests = jest.fn<(...args: unknown[]) => Promise<unknown>>();
const mockCreateQuest = jest.fn<(...args: unknown[]) => Promise<unknown>>();

jest.mock("../lib/taskService", () => ({
  createQuest: (...args: unknown[]) => mockCreateQuest(...args),
  fetchQuests: (...args: unknown[]) => mockFetchQuests(...args),
}));

beforeEach(() => {
  jest.clearAllMocks();
  mockFetchQuests.mockResolvedValue([]);
  useAppStore.setState({ user: null });
});

test("開発用クイックログイン（非UUIDのモックID）ではisLiveがtrueでもタスクを追加できず、プレビュー中の表示になる", async () => {
  useAppStore.setState({
    user: {
      balance: 500,
      created_at: "2026-07-01T00:00:00Z",
      id: "user-parent-1",
      name: "お父さん",
      role: "parent",
    },
  });

  render(<AdultTasksScreen />);

  fireEvent.press(await screen.findByRole("tab", { name: "デイリー" }));
  fireEvent.press(screen.getByRole("button", { name: "＋ タスクを追加" }));

  fireEvent.changeText(screen.getByPlaceholderText("タスク名を入力"), "テストタスク");
  fireEvent.changeText(screen.getByPlaceholderText("0"), "10");

  const submitButton = screen.getByRole("button", { name: "追加" });
  expect(submitButton.props.accessibilityState.disabled).toBe(true);
  expect(screen.getByText("※ プレビュー中はボタンを操作できません")).toBeTruthy();

  fireEvent.press(submitButton);
  expect(mockCreateQuest).not.toHaveBeenCalled();
});

test("タスクの取得に失敗したら、そのことを表示する（黙って「ありません」と出さない）", async () => {
  // Issue #212: 失敗しても error がどこにも出ておらず、0件と見分けがつかなかった
  const warnSpy = jest.spyOn(console, "warn").mockImplementation(() => undefined);
  useAppStore.setState({
    user: {
      balance: 500,
      created_at: "2026-07-01T00:00:00Z",
      id: "11111111-1111-1111-1111-111111111111",
      name: "お父さん",
      role: "parent",
    },
  });
  mockFetchQuests.mockRejectedValue(new Error("network error"));

  render(<AdultTasksScreen />);

  expect(await screen.findByText("タスクを取得できませんでした")).toBeTruthy();
  expect(screen.queryByText("タスクがありません")).toBeNull();

  warnSpy.mockRestore();
});

