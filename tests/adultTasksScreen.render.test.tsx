import { act, fireEvent, render, screen } from "@testing-library/react-native";
import { beforeEach, expect, jest, test } from "@jest/globals";
import { useState } from "react";
import { Text } from "react-native";
import { TutorialContext } from "../components/tutorial/TutorialContext";
import { TUTORIAL_STEPS } from "../lib/tutorial";
import { advanceCatalogStep } from "./helpers/TutorialHarness";

let mockParams: { navKey?: string; tab?: string; questId?: string } = {};
jest.mock("../lib/useFamilyMembers", () => ({ useFamilyMembers: () => ({ members: [], loading: false, error: null, reload: jest.fn() }) }));

jest.mock("expo-router", () => ({
  Stack: { Screen: () => null },
  useFocusEffect: (effect: () => void) => require("react").useEffect(effect, [effect]),
  useLocalSearchParams: () => mockParams,
}));

const mockFetchQuests = jest.fn<(...args: unknown[]) => Promise<unknown>>();
const mockCreateQuest = jest.fn<(...args: unknown[]) => Promise<unknown>>();

jest.mock("../lib/taskService", () => ({
  createQuest: (...args: unknown[]) => mockCreateQuest(...args),
  fetchQuests: (...args: unknown[]) => mockFetchQuests(...args),
}));

import AdultTasksScreen from "../components/AdultTasksScreen";
import { useAppStore } from "../store";

function AdultTutorialHarness() {
  const [index, setIndex] = useState(1);
  return <TutorialContext.Provider value={{
    role: "parent", mode: "running", index, step: TUTORIAL_STEPS.parent[index], storageError: false,
    home: () => undefined, start: () => undefined, stop: () => undefined, retrySave: () => undefined,
    advance: (id) => setIndex((current) => advanceCatalogStep("parent", current, id)),
  }}><Text testID="tutorial-step">{TUTORIAL_STEPS.parent[index].id}</Text><AdultTasksScreen /></TutorialContext.Provider>;
}

test("案内で実際のデイリー・追加・閉じる・承認を操作し、タスクを保存せず進める", async () => {
  mockFetchQuests.mockResolvedValue([]);
  render(<AdultTutorialHarness />);
  fireEvent.press(await screen.findByRole("tab", { name: "デイリー" }));
  expect(screen.getByTestId("tutorial-frame-parent-create")).toBeTruthy();
  fireEvent.press(screen.getByRole("button", { name: "＋ タスクを追加" }));
  expect(screen.getByTestId("tutorial-frame-parent-form-close")).toBeTruthy();
  expect(screen.getByPlaceholderText("タスク名を入力")).toBeTruthy();
  fireEvent.press(screen.getByRole("button", { name: "タスク追加を閉じる" }));
  expect(screen.queryByPlaceholderText("タスク名を入力")).toBeNull();
  expect(screen.getByTestId("tutorial-frame-parent-approval")).toBeTruthy();
  fireEvent.press(screen.getByRole("tab", { name: "承認" }));
  expect(screen.getByTestId("tutorial-step").props.children).toBe("parent-weekly");
  fireEvent.press(screen.getByRole("tab", { name: "ウィークリー" }));
  expect(screen.getByTestId("tutorial-frame-parent-limited")).toBeTruthy();
  fireEvent.press(screen.getByRole("tab", { name: "限定" }));
  expect(screen.getByTestId("tutorial-step").props.children).toBe("parent-task-summary");
  expect(mockCreateQuest).not.toHaveBeenCalled();
});

test("案内中にタスクを保存しても閉じる案内は進まず、開き直して×を押すと進む", async () => {
  mockFetchQuests.mockResolvedValue([]);
  mockCreateQuest.mockResolvedValue(dailyQuest);
  render(<AdultTutorialHarness />);
  fireEvent.press(await screen.findByRole("tab", { name: "デイリー" }));
  fireEvent.press(screen.getByRole("button", { name: "＋ タスクを追加" }));
  fireEvent.changeText(screen.getByPlaceholderText("タスク名を入力"), "テストタスク");
  fireEvent.changeText(screen.getByPlaceholderText("1"), "10");

  await act(async () => {
    fireEvent.press(screen.getByRole("button", { name: "追加" }));
  });

  expect(mockCreateQuest).toHaveBeenCalledWith(expect.objectContaining({
    title: "テストタスク", reward_amount: 10,
  }));
  expect(mockFetchQuests).toHaveBeenCalledTimes(2);
  expect(screen.queryByPlaceholderText("タスク名を入力")).toBeNull();
  expect(screen.getByTestId("tutorial-step").props.children).toBe("parent-form-close");

  fireEvent.press(screen.getByRole("button", { name: "＋ タスクを追加" }));
  expect(screen.getByTestId("tutorial-frame-parent-form-close")).toBeTruthy();
  fireEvent.press(screen.getByRole("button", { name: "タスク追加を閉じる" }));
  expect(screen.queryByPlaceholderText("タスク名を入力")).toBeNull();
  expect(screen.getByTestId("tutorial-step").props.children).toBe("parent-approval");
});

const dailyQuest = {
  assigned_to: null,
  category: "daily" as const,
  is_required: false,
  created_at: "2026-07-01T00:00:00Z",
  created_by: "11111111-1111-1111-1111-111111111111",
  description: "浴槽を洗う",
  family_id: "10000000-0000-4000-8000-000000000208",
  id: "q1",
  reward_amount: 10,
  status: "open" as const,
  title: "お風呂掃除",
};

test("受注中の限定タスクが期限切れになったら、文字と色を未受注側へそろえる", async () => {
  mockParams = { tab: "limited" };
  mockFetchQuests.mockResolvedValue([{ ...dailyQuest, category: "limited", status: "accepted", expires_at: "2020-01-01T00:00:00Z" }]);
  render(<AdultTasksScreen />);
  const badge = await screen.findByText("期限切れ");
  expect(badge.props.className).toContain("text-slate-500");
  expect(badge.props.className).not.toContain("text-blue-600");
  expect(screen.queryByText("受注中")).toBeNull();
});

beforeEach(() => {
  jest.clearAllMocks();
  mockParams = {};
  mockFetchQuests.mockResolvedValue([dailyQuest]);
  // isLiveをtrueにして実際に取得したクエスト（承認待ちゼロ件）だけを表示させ、
  // MOCK_QUESTSの承認待ち件数バッジで「承認」タブのラベルが変わらないようにする。
  useAppStore.setState({
    user: {
      balance: 500,
      created_at: "2026-07-01T00:00:00Z",
      family_id: "10000000-0000-4000-8000-000000000208",
      id: "11111111-1111-1111-1111-111111111111",
      name: "お父さん",
      role: "parent",
    },
  });
});

test("開発用クイックログイン（非UUIDのモックID）でもタスク追加フォームを操作できる", async () => {
  useAppStore.setState({
    user: {
      balance: 500,
      created_at: "2026-07-01T00:00:00Z",
      family_id: "10000000-0000-4000-8000-000000000208",
      id: "user-parent-1",
      name: "お父さん",
      role: "parent",
    },
  });

  render(<AdultTasksScreen />);

  fireEvent.press(await screen.findByRole("tab", { name: "デイリー" }));
  fireEvent.press(screen.getByRole("button", { name: "＋ タスクを追加" }));

  fireEvent.changeText(screen.getByPlaceholderText("タスク名を入力"), "テストタスク");
  fireEvent.changeText(screen.getByPlaceholderText("1"), "10");

  const submitButton = screen.getByRole("button", { name: "追加" });
  expect(submitButton.props.accessibilityState.disabled).toBe(false);
  expect(screen.queryByText("※ プレビュー中はボタンを操作できません")).toBeNull();
});

test("タスクの取得に失敗したら、そのことを表示する（黙って「ありません」と出さない）", async () => {
  // Issue #212: 失敗しても error がどこにも出ておらず、0件と見分けがつかなかった
  const warnSpy = jest.spyOn(console, "warn").mockImplementation(() => undefined);
  mockFetchQuests.mockRejectedValue(new Error("network error"));

  render(<AdultTasksScreen />);

  expect(await screen.findByText("タスクを取得できませんでした")).toBeTruthy();
  expect(screen.queryByText("タスクがありません")).toBeNull();

  warnSpy.mockRestore();
});

test("最初の取得中は、一覧の代わりに真ん中でぐるぐるを出す（「タスクがありません」と出さない。Issue #261）", async () => {
  let resolveQuests: (quests: unknown) => void = () => undefined;
  mockFetchQuests.mockReturnValue(new Promise((resolve) => (resolveQuests = resolve)));
  mockParams = { tab: "daily" };

  render(<AdultTasksScreen />);

  expect(screen.getByLabelText("タスクを読み込み中")).toBeTruthy();
  expect(screen.queryByText("タスクがありません")).toBeNull();

  await act(async () => {
    resolveQuests([dailyQuest]);
  });

  expect(screen.queryByLabelText("タスクを読み込み中")).toBeNull();
  expect(screen.getByText("お風呂掃除")).toBeTruthy();
});

test("タスクが0件のときに取り直しても、ぐるぐるに切り替えず一覧を残す（PR #421 レビュー対応）", async () => {
  // 0件の状態で最初のタスクを作ると、作った後の取り直し（reload）が走る
  mockFetchQuests.mockResolvedValueOnce([]);
  mockCreateQuest.mockResolvedValue(dailyQuest);
  mockParams = { tab: "daily" };
  render(<AdultTasksScreen />);
  expect(await screen.findByText("タスクがありません")).toBeTruthy();

  // 取り直しは終わらないままにしておく
  mockFetchQuests.mockReturnValue(new Promise(() => undefined));
  fireEvent.press(screen.getByRole("button", { name: "＋ タスクを追加" }));
  fireEvent.changeText(screen.getByPlaceholderText("タスク名を入力"), "テストタスク");
  fireEvent.changeText(screen.getByPlaceholderText("1"), "10");
  await act(async () => {
    fireEvent.press(screen.getByRole("button", { name: "追加" }));
  });

  expect(mockFetchQuests).toHaveBeenCalledTimes(2);
  expect(screen.queryByLabelText("タスクを読み込み中")).toBeNull();
  expect(screen.getByText("タスクがありません")).toBeTruthy();
});

test("params付きで開いたときはそのタブ・クエストを表示する", async () => {
  mockParams = { questId: "q1", tab: "daily" };

  render(<AdultTasksScreen />);

  expect(await screen.findByText("浴槽を洗う")).toBeTruthy();
  expect(screen.getByRole("tab", { name: "デイリー" }).props.accessibilityState.selected).toBe(true);
});

test("画面がマウントされたまま別のparamsで再遷移した場合、タブを更新する", async () => {
  mockParams = { questId: "q1", tab: "daily" };
  const { rerender } = render(<AdultTasksScreen />);
  expect(await screen.findByText("浴槽を洗う")).toBeTruthy();

  mockParams = { tab: "weekly" };
  rerender(<AdultTasksScreen />);

  expect(screen.getByRole("tab", { name: "ウィークリー" }).props.accessibilityState.selected).toBe(true);
});

test("questIdを空文字で明示された場合、選択中のクエストを解除する（TabRouterはparams無しのnavigateで直前のparamsをマージするため、呼び出し側は空文字で明示する必要がある）", async () => {
  mockParams = { questId: "q1", tab: "daily" };
  const { rerender } = render(<AdultTasksScreen />);
  expect(await screen.findByText("浴槽を洗う")).toBeTruthy();

  mockParams = { questId: "", tab: "approval" };
  rerender(<AdultTasksScreen />);

  expect(screen.queryByText("浴槽を洗う")).toBeNull();
  expect(screen.getByRole("tab", { name: "承認" }).props.accessibilityState.selected).toBe(true);
});

test("タスク追加フォームを開いた状態でクエスト詳細へのparams付き遷移が来ると、フォームを閉じて詳細を表示する", async () => {
  mockParams = {};
  const { rerender } = render(<AdultTasksScreen />);

  fireEvent.press(screen.getByRole("tab", { name: "デイリー" }));
  // 最初の取得中は一覧の代わりにぐるぐるが出ているので、取得を待ってから押す
  fireEvent.press(await screen.findByRole("button", { name: "＋ タスクを追加" }));
  expect(screen.getByText("タスクを追加")).toBeTruthy();

  mockParams = { questId: "q1", tab: "daily" };
  rerender(<AdultTasksScreen />);

  expect(screen.queryByText("タスクを追加")).toBeNull();
  expect(await screen.findByText("浴槽を洗う")).toBeTruthy();
});

test("前回と全く同じtab/questIdでもnavKeyが異なれば再遷移として同期する（例: 「デイリータスクをすべて見る」を連続で押した場合）", async () => {
  mockParams = { navKey: "1", questId: "", tab: "daily" };
  const { rerender } = render(<AdultTasksScreen />);
  expect(await screen.findByText("お風呂掃除")).toBeTruthy();

  // ローカル状態（タスク追加フォームを開く）を、paramsに連動しない形で変化させる
  fireEvent.press(screen.getByRole("button", { name: "＋ タスクを追加" }));
  expect(screen.getByText("タスクを追加")).toBeTruthy();

  // ホーム画面で「デイリータスクをすべて見る」をもう一度押した状況（tab/questIdは前回と同一）
  mockParams = { navKey: "2", questId: "", tab: "daily" };
  rerender(<AdultTasksScreen />);

  expect(screen.queryByText("タスクを追加")).toBeNull();
});
