import { fireEvent, render, screen, waitFor } from "@testing-library/react-native";
import { beforeEach, expect, jest, test } from "@jest/globals";
import { router } from "expo-router";
import ChildTasksScreen from "../components/ChildTasksScreen";
import { useAppStore } from "../store";

jest.mock("expo-router", () => ({
  router: { back: jest.fn(), push: jest.fn() },
  Stack: { Screen: () => null },
  useFocusEffect: (effect: () => void) => require("react").useEffect(effect, [effect]),
}));

const mockFetchQuests = jest.fn<(...args: unknown[]) => Promise<unknown>>();
const mockAcceptQuest = jest.fn<(...args: unknown[]) => Promise<unknown>>();

jest.mock("../lib/taskService", () => ({
  acceptQuest: (...args: unknown[]) => mockAcceptQuest(...args),
  fetchQuests: (...args: unknown[]) => mockFetchQuests(...args),
}));

const mockFetchUserBalance = jest.fn<(...args: unknown[]) => Promise<number>>();

jest.mock("../lib/userService", () => ({
  fetchUserBalance: (...args: unknown[]) => mockFetchUserBalance(...args),
}));

const openQuest = {
  assigned_to: null,
  category: "daily" as const,
  created_at: "2026-07-01T00:00:00Z",
  created_by: "11111111-1111-1111-1111-111111111111",
  description: "浴槽を洗う",
  id: "quest-1",
  reward_amount: 10,
  status: "open" as const,
  title: "お風呂掃除",
};

beforeEach(() => {
  jest.clearAllMocks();
  mockFetchQuests.mockResolvedValue([openQuest]);
  mockFetchUserBalance.mockResolvedValue(0);
  useAppStore.setState({ user: null });
});

test("開発用クイックログイン（非UUIDのモックID）ではisLiveがtrueでも受注できず、プレビュー中の表示になる", async () => {
  useAppStore.setState({
    user: {
      balance: 320,
      created_at: "2026-07-01T00:00:00Z",
      id: "user-child-1",
      name: "たろう",
      role: "child",
    },
  });

  render(<ChildTasksScreen />);

  fireEvent.press(await screen.findByText("お風呂掃除"));

  const acceptButton = await screen.findByRole("button", { name: "受注する" });
  expect(acceptButton.props.accessibilityState.disabled).toBe(true);
  expect(screen.getByText("※ プレビュー中はボタンを操作できません")).toBeTruthy();

  fireEvent.press(acceptButton);
  expect(mockAcceptQuest).not.toHaveBeenCalled();
});

test("開発用クイックログイン（非UUIDのモックID）では残高を取りに行かず、モックの残高を出す", async () => {
  // users.id は uuid 型。モックIDで問い合わせると uuid のパースに失敗するため、
  // 実APIを叩かずログイン中ユーザーの残高をそのまま使う（#174）
  useAppStore.setState({
    user: {
      balance: 320,
      created_at: "2026-07-01T00:00:00Z",
      id: "user-child-1",
      name: "たろう",
      role: "child",
    },
  });

  render(<ChildTasksScreen />);
  await screen.findByText("お風呂掃除");

  expect(mockFetchUserBalance).not.toHaveBeenCalled();
});

test("戻るボタンで直前の画面に戻る", () => {
  render(<ChildTasksScreen />);

  fireEvent.press(screen.getByRole("button", { name: "前の画面に戻る" }));

  expect(router.back).toHaveBeenCalledTimes(1);
});

test("報告ボタンから自主報告画面へ遷移する", () => {
  render(<ChildTasksScreen />);

  fireEvent.press(screen.getByRole("button", { name: "タスクとして発行されていない家事を報告" }));

  expect(router.push).toHaveBeenCalledWith("/task-report");
});

test("タスクの取得に失敗したら、そのことを表示する（黙って空の板を見せない）", async () => {
  // Issue #212: 失敗しても error がどこにも出ておらず、0件と見分けがつかなかった
  const warnSpy = jest.spyOn(console, "warn").mockImplementation(() => undefined);
  useAppStore.setState({
    user: {
      balance: 320,
      created_at: "2026-07-01T00:00:00Z",
      id: "22222222-2222-2222-2222-222222222222",
      name: "たろう",
      role: "child",
    },
  });
  mockFetchQuests.mockRejectedValue(new Error("network error"));

  render(<ChildTasksScreen />);

  expect(await screen.findByText("タスクをよみこめませんでした")).toBeTruthy();

  warnSpy.mockRestore();
});

test("おサイフの取得に失敗したら、そのことを表示する", async () => {
  // 失敗時はモックの残高がそのまま出るため、数字が本物でないことを添える
  const warnSpy = jest.spyOn(console, "warn").mockImplementation(() => undefined);
  useAppStore.setState({
    user: {
      balance: 320,
      created_at: "2026-07-01T00:00:00Z",
      id: "22222222-2222-2222-2222-222222222222",
      name: "たろう",
      role: "child",
    },
  });
  mockFetchUserBalance.mockRejectedValue(new Error("network error"));

  render(<ChildTasksScreen />);

  // チップ（minWidth 124）の中で折り返さない短い文言にしている
  expect(await screen.findByText("よみこめません")).toBeTruthy();

  warnSpy.mockRestore();
});
