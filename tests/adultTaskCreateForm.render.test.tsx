import { fireEvent, render, screen, waitFor } from "@testing-library/react-native";
import { beforeEach, expect, jest, test } from "@jest/globals";

const mockCreateQuest = jest.fn<(...args: unknown[]) => Promise<unknown>>();
const mockEnsureDbUser = jest.fn<(...args: unknown[]) => Promise<unknown>>();

jest.mock("../lib/taskService", () => ({
  createQuest: (...args: unknown[]) => mockCreateQuest(...args),
}));
jest.mock("../lib/userService", () => ({
  ensureDbUser: (...args: unknown[]) => mockEnsureDbUser(...args),
}));

import AdultTaskCreateForm from "../components/tasks/AdultTaskCreateForm";
import { useAppStore } from "../store";

const mockParent = {
  id: "user-parent-1",
  name: "お父さん",
  role: "parent" as const,
  balance: 500,
  created_at: "2026-07-01T00:00:00Z",
};
const dbParent = {
  ...mockParent,
  id: "11111111-1111-1111-1111-111111111111",
};

beforeEach(() => {
  jest.clearAllMocks();
  useAppStore.setState({ user: mockParent });
  mockEnsureDbUser.mockImplementation(async (user) => user);
  mockCreateQuest.mockResolvedValue({ id: "quest-1" });
});

function fillAndSubmit() {
  fireEvent.changeText(screen.getByPlaceholderText("タスク名を入力"), "お風呂掃除");
  fireEvent.changeText(screen.getByPlaceholderText("0"), "50");
  fireEvent.press(screen.getByText("追加"));
}

test("クイックログインの親は保存済みのDBユーザーを取得し、そのUUIDでタスクを追加する", async () => {
  mockEnsureDbUser.mockResolvedValue(dbParent);
  const onCreated = jest.fn();
  const onClose = jest.fn();
  render(<AdultTaskCreateForm creator={mockParent} isLive onClose={onClose} onCreated={onCreated} />);

  fillAndSubmit();

  await waitFor(() => {
    expect(mockEnsureDbUser).toHaveBeenCalledWith(mockParent);
    expect(mockCreateQuest).toHaveBeenCalledWith(expect.objectContaining({
      created_by: dbParent.id,
      title: "お風呂掃除",
      reward_amount: 50,
    }));
    expect(useAppStore.getState().user).toEqual(dbParent);
    expect(onCreated).toHaveBeenCalledTimes(1);
    expect(onClose).toHaveBeenCalledTimes(1);
  });
});

test("DBユーザーでログイン済みなら同じユーザーでタスクを作成する", async () => {
  useAppStore.setState({ user: dbParent });
  render(<AdultTaskCreateForm creator={dbParent} isLive onClose={jest.fn()} onCreated={jest.fn()} />);

  fillAndSubmit();

  await waitFor(() => expect(mockCreateQuest).toHaveBeenCalledWith(expect.objectContaining({
    created_by: dbParent.id,
  })));
  expect(mockEnsureDbUser).toHaveBeenCalledWith(dbParent);
});

test("DBユーザー取得に失敗したらタスクを送信せずエラーを表示する", async () => {
  mockEnsureDbUser.mockRejectedValue(new Error("ユーザーを取得できません"));
  render(<AdultTaskCreateForm creator={mockParent} isLive onClose={jest.fn()} onCreated={jest.fn()} />);

  fillAndSubmit();

  await waitFor(() => expect(screen.getByText("ユーザーを取得できません")).toBeTruthy());
  expect(mockCreateQuest).not.toHaveBeenCalled();
});

test("Supabaseが返した通常のエラーオブジェクトの理由も表示する", async () => {
  mockEnsureDbUser.mockRejectedValue({ message: "Supabaseに接続できません" });
  render(<AdultTaskCreateForm creator={mockParent} isLive onClose={jest.fn()} onCreated={jest.fn()} />);

  fillAndSubmit();

  await waitFor(() => expect(screen.getByText("Supabaseに接続できません")).toBeTruthy());
  expect(mockCreateQuest).not.toHaveBeenCalled();
});

test("タスク保存に失敗したらグローバルユーザーを切り替えない", async () => {
  const warnSpy = jest.spyOn(console, "warn").mockImplementation(() => undefined);
  mockEnsureDbUser.mockResolvedValue(dbParent);
  mockCreateQuest.mockRejectedValue({ message: "タスクを保存できません" });
  render(<AdultTaskCreateForm creator={mockParent} isLive onClose={jest.fn()} onCreated={jest.fn()} />);

  fillAndSubmit();

  await waitFor(() => expect(screen.getByText("タスクを保存できません")).toBeTruthy());
  expect(useAppStore.getState().user).toEqual(mockParent);
  warnSpy.mockRestore();
});
