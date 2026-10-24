import { fireEvent, render, screen, waitFor } from "@testing-library/react-native";
import { beforeEach, expect, jest, test } from "@jest/globals";
import { Alert } from "react-native";
import { getByFuriganaText, getInputByLabel } from "./furiganaQueries";

const mockBack = jest.fn();
const mockCanGoBack = jest.fn(() => true);
const mockReplace = jest.fn<(href: unknown) => void>();
// 送信中に離れさせないこと（usePreventRemove とスワイプの止め方）を確かめるため、最後に渡された内容を持っておく
let mockPreventRemove = false;
let mockPreventRemoveCallback: (() => void) | undefined;
const mockStackScreen = jest.fn<(props: { options?: Record<string, unknown> }) => null>(() => null);

jest.mock("expo-router", () => ({
  // 画面の import より先にこの factory が動くので、モックは呼ばれたときに参照する
  router: {
    back: () => mockBack(),
    canGoBack: () => mockCanGoBack(),
    replace: (href: unknown) => mockReplace(href),
  },
  Stack: { Screen: (props: { options?: Record<string, unknown> }) => mockStackScreen(props) },
  usePreventRemove: (preventRemove: boolean, callback: () => void) => {
    mockPreventRemove = preventRemove;
    mockPreventRemoveCallback = callback;
  },
}));

const mockCreateTaskReport = jest.fn<(...args: unknown[]) => Promise<unknown>>();

jest.mock("../lib/taskReportService", () => ({
  createTaskReport: (...args: unknown[]) => mockCreateTaskReport(...args),
}));

import TaskReportScreen from "../components/TaskReportScreen";
import { useAppStore } from "../store";
import { pressWithoutWaiting } from "./pressWithoutWaiting";

// 実際のSupabaseユーザーはIDがuuid。書き込みが通る経路のテストはこちらを使う
const child = {
  family_id: "10000000-0000-4000-8000-000000000208",
  id: "22222222-2222-2222-2222-222222222222",
  name: "たろう",
  role: "child" as const,
  balance: 320,
  created_at: "2026-07-01T00:00:00Z",
};

const parent = {
  id: "33333333-3333-3333-3333-333333333333",
  name: "はなこ",
  role: "parent" as const,
  balance: 0,
  created_at: "2026-07-01T00:00:00Z",
};

// 開発用クイックログイン（「子供として入る」）で入るモックID。uuidではない
const quickLoginChild = { ...child, id: "user-child-1" };

async function fillForm() {
  await fireEvent.changeText(screen.getByLabelText("タイトル"), "食器洗い");
  await fireEvent.changeText(getInputByLabel("説明"), "夕飯の後、自分から食器を洗った");
}

beforeEach(() => {
  jest.clearAllMocks();
  mockCanGoBack.mockReturnValue(true);
  useAppStore.setState({ user: child });
});

test("未ログインの場合はログインを促す表示のみになる", async () => {
  useAppStore.setState({ user: null });
  await render(<TaskReportScreen />);

  expect(screen.getByText("ログインしてください")).toBeTruthy();
  expect(screen.queryByLabelText("報告する")).toBeNull();
});

test("下の「戻る」ボタンで前の画面へ戻れる", async () => {
  await render(<TaskReportScreen />);

  await fireEvent.press(screen.getByRole("button", { name: "前の画面に戻る" }));

  expect(mockBack).toHaveBeenCalledTimes(1);
  expect(mockCreateTaskReport).not.toHaveBeenCalled();
});

test("戻れる画面がないとき（Webでの再読み込みなど）は、下の「戻る」ボタンでタスク画面へ移る", async () => {
  mockCanGoBack.mockReturnValue(false);
  await render(<TaskReportScreen />);

  await fireEvent.press(screen.getByRole("button", { name: "前の画面に戻る" }));

  expect(mockReplace).toHaveBeenCalledWith("/tasks-child");
  expect(mockBack).not.toHaveBeenCalled();
});

test("開発用クイックログイン（非UUIDのモックID）では報告できず、プレビュー中の表示になる", async () => {
  // isLive は true のままなので、uuidを見ないと書き込みが通ってしまい必ず失敗する
  useAppStore.setState({ user: quickLoginChild });
  await render(<TaskReportScreen />);
  await fillForm();

  const submitButton = screen.getByRole("button", { name: "報告する" });
  expect(submitButton.props.accessibilityState.disabled).toBe(true);
  expect(getByFuriganaText("※ プレビュー中はボタンを操作できません")).toBeTruthy();

  await fireEvent.press(submitButton);
  expect(mockCreateTaskReport).not.toHaveBeenCalled();
});

test("親ユーザーの場合は報告ボタンが無効化され、送信されない", async () => {
  useAppStore.setState({ user: parent });
  await render(<TaskReportScreen />);

  await fireEvent.press(screen.getByRole("button", { name: "報告する" }));

  expect(screen.getByText("※ お手伝いの報告は子供用アカウントのみ利用できます")).toBeTruthy();
  expect(mockCreateTaskReport).not.toHaveBeenCalled();
});

test("未入力のまま送信するとエラーメッセージが表示され、送信されない", async () => {
  await render(<TaskReportScreen />);

  await fireEvent.press(screen.getByRole("button", { name: "報告する" }));

  expect(getByFuriganaText("タイトルを入力してください。")).toBeTruthy();
  expect(mockCreateTaskReport).not.toHaveBeenCalled();
});

test("必要項目を入力して送信すると報告が保存され、成功後にタスク画面へ戻る", async () => {
  mockCreateTaskReport.mockResolvedValueOnce({ id: "report-1" });
  const alertSpy = jest.spyOn(Alert, "alert").mockImplementation((_title, _message, buttons) => {
    buttons?.[0]?.onPress?.();
  });
  await render(<TaskReportScreen />);

  await fillForm();
  await fireEvent.press(screen.getByRole("button", { name: "報告する" }));

  await waitFor(() => expect(mockCreateTaskReport).toHaveBeenCalledTimes(1));
  expect(mockCreateTaskReport).toHaveBeenCalledWith({
    description: "夕飯の後、自分から食器を洗った",
    family_id: child.family_id,
    reported_by: child.id,
    title: "食器洗い",
  });
  expect(alertSpy).toHaveBeenCalled();
  expect(mockBack).toHaveBeenCalledTimes(1);
});

test("送信に失敗した場合はエラーメッセージを表示し、入力内容を保持する", async () => {
  mockCreateTaskReport.mockRejectedValueOnce(new Error("タスクの報告に失敗しました。時間をおいて再度お試しください。"));
  await render(<TaskReportScreen />);

  await fillForm();
  await fireEvent.press(screen.getByRole("button", { name: "報告する" }));

  await waitFor(() =>
    expect(screen.getByText("タスクの報告に失敗しました。時間をおいて再度お試しください。")).toBeTruthy(),
  );
  expect(screen.getByLabelText("タイトル").props.value).toBe("食器洗い");
  expect(mockBack).not.toHaveBeenCalled();
});

test("送信中は二重送信できない", async () => {
  let resolveCreate!: (value: unknown) => void;
  mockCreateTaskReport.mockReturnValueOnce(
    new Promise((resolve) => {
      resolveCreate = resolve;
    }),
  );
  await render(<TaskReportScreen />);

  await fillForm();
  await pressWithoutWaiting(screen.getByRole("button", { name: "報告する" }));
  await pressWithoutWaiting(screen.getByRole("button", { name: "報告する" }));

  expect(mockCreateTaskReport).toHaveBeenCalledTimes(1);
  resolveCreate({ id: "report-1" });
});

test("送信中は下の「戻る」ボタン・スワイプ・Androidの戻る操作で離れられず、終わったら戻せる", async () => {
  let resolveCreate!: (value: unknown) => void;
  mockCreateTaskReport.mockReturnValueOnce(
    new Promise((resolve) => {
      resolveCreate = resolve;
    }),
  );
  const alertSpy = jest.spyOn(Alert, "alert").mockImplementation(() => {});
  await render(<TaskReportScreen />);

  expect(mockPreventRemove).toBe(false);
  expect(mockStackScreen).toHaveBeenLastCalledWith(
    expect.objectContaining({ options: expect.objectContaining({ gestureEnabled: true }) }),
  );

  await fillForm();
  await pressWithoutWaiting(screen.getByRole("button", { name: "報告する" }));
  await waitFor(() => expect(mockCreateTaskReport).toHaveBeenCalledTimes(1));

  const backButton = screen.getByRole("button", { name: "前の画面に戻る" });
  expect(backButton.props.accessibilityState).toMatchObject({ disabled: true });
  await fireEvent.press(backButton);
  expect(mockBack).not.toHaveBeenCalled();

  expect(mockPreventRemove).toBe(true);
  expect(mockStackScreen).toHaveBeenLastCalledWith(
    expect.objectContaining({ options: expect.objectContaining({ gestureEnabled: false }) }),
  );
  mockPreventRemoveCallback?.();
  expect(alertSpy).toHaveBeenCalledWith("そうしんしています", "おわるまで まってね。");

  resolveCreate({ id: "report-1" });
  await waitFor(() => expect(mockPreventRemove).toBe(false));
});
