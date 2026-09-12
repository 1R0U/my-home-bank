import { fireEvent, render, screen, waitFor } from "@testing-library/react-native";
import { beforeEach, expect, jest, test } from "@jest/globals";
import { Alert } from "react-native";

const mockBack = jest.fn();
const mockPush = jest.fn();

jest.mock("expo-router", () => ({
  Stack: { Screen: () => null },
  useRouter: () => ({ back: mockBack, push: mockPush }),
}));

const mockCreateTaskReport = jest.fn<(...args: unknown[]) => Promise<unknown>>();

jest.mock("../lib/taskReportService", () => ({
  createTaskReport: (...args: unknown[]) => mockCreateTaskReport(...args),
}));

import TaskReportScreen from "../components/TaskReportScreen";
import { useAppStore } from "../store";

const child = {
  id: "user-child-1",
  name: "たろう",
  role: "child" as const,
  balance: 320,
  created_at: "2026-07-01T00:00:00Z",
};

const parent = {
  id: "user-parent-1",
  name: "はなこ",
  role: "parent" as const,
  balance: 0,
  created_at: "2026-07-01T00:00:00Z",
};

function fillForm() {
  fireEvent.changeText(screen.getByLabelText("タイトル"), "食器洗い");
  fireEvent.changeText(screen.getByLabelText("説明"), "夕飯の後、自分から食器を洗った");
}

beforeEach(() => {
  jest.clearAllMocks();
  useAppStore.setState({ user: child });
});

test("未ログインの場合はログインを促す表示のみになる", () => {
  useAppStore.setState({ user: null });
  render(<TaskReportScreen />);

  expect(screen.getByText("ログインしてください")).toBeTruthy();
  expect(screen.queryByLabelText("報告する")).toBeNull();
});

test("親ユーザーの場合は報告ボタンが無効化され、送信されない", () => {
  useAppStore.setState({ user: parent });
  render(<TaskReportScreen />);

  fireEvent.press(screen.getByLabelText("報告する"));

  expect(screen.getByText("※ お手伝いの報告は子供用アカウントのみ利用できます")).toBeTruthy();
  expect(mockCreateTaskReport).not.toHaveBeenCalled();
});

test("未入力のまま送信するとエラーメッセージが表示され、送信されない", () => {
  render(<TaskReportScreen />);

  fireEvent.press(screen.getByLabelText("報告する"));

  expect(screen.getByText("タイトルを入力してください。")).toBeTruthy();
  expect(mockCreateTaskReport).not.toHaveBeenCalled();
});

test("必要項目を入力して送信すると報告が保存され、成功後にタスク画面へ戻る", async () => {
  mockCreateTaskReport.mockResolvedValueOnce({ id: "report-1" });
  const alertSpy = jest.spyOn(Alert, "alert").mockImplementation((_title, _message, buttons) => {
    buttons?.[0]?.onPress?.();
  });
  render(<TaskReportScreen />);

  fillForm();
  fireEvent.press(screen.getByLabelText("報告する"));

  await waitFor(() => expect(mockCreateTaskReport).toHaveBeenCalledTimes(1));
  expect(mockCreateTaskReport).toHaveBeenCalledWith({
    description: "夕飯の後、自分から食器を洗った",
    reported_by: "user-child-1",
    title: "食器洗い",
  });
  expect(alertSpy).toHaveBeenCalled();
  expect(mockBack).toHaveBeenCalledTimes(1);
});

test("送信に失敗した場合はエラーメッセージを表示し、入力内容を保持する", async () => {
  mockCreateTaskReport.mockRejectedValueOnce(new Error("タスクの報告に失敗しました。時間をおいて再度お試しください。"));
  render(<TaskReportScreen />);

  fillForm();
  fireEvent.press(screen.getByLabelText("報告する"));

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
  render(<TaskReportScreen />);

  fillForm();
  fireEvent.press(screen.getByLabelText("報告する"));
  fireEvent.press(screen.getByLabelText("報告する"));

  expect(mockCreateTaskReport).toHaveBeenCalledTimes(1);
  resolveCreate({ id: "report-1" });
});
