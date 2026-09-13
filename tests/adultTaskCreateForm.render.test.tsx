import { fireEvent, render, screen, waitFor } from "@testing-library/react-native";
import { beforeEach, expect, jest, test } from "@jest/globals";

const mockCreateQuest = jest.fn<(...args: unknown[]) => Promise<unknown>>();
const mockCreateUserProfile = jest.fn<(...args: unknown[]) => Promise<unknown>>();

jest.mock("../lib/taskService", () => ({
  createQuest: (...args: unknown[]) => mockCreateQuest(...args),
}));
jest.mock("../lib/userService", () => ({
  createUserProfile: (...args: unknown[]) => mockCreateUserProfile(...args),
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
  mockCreateQuest.mockResolvedValue({ id: "quest-1" });
});

function fillAndSubmit() {
  fireEvent.changeText(screen.getByPlaceholderText("タスク名を入力"), "お風呂掃除");
  fireEvent.changeText(screen.getByPlaceholderText("0"), "50");
  fireEvent.press(screen.getByText("追加"));
}

test("クイックログインの親は初回保存時にDBユーザーを作り、そのUUIDでタスクを追加する", async () => {
  mockCreateUserProfile.mockResolvedValue(dbParent);
  const onCreated = jest.fn();
  const onClose = jest.fn();
  render(<AdultTaskCreateForm creator={mockParent} isLive onClose={onClose} onCreated={onCreated} />);

  fillAndSubmit();

  await waitFor(() => {
    expect(mockCreateUserProfile).toHaveBeenCalledWith({ name: "お父さん", role: "parent" });
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

test("DBユーザーでログイン済みならプロフィールを重複作成しない", async () => {
  useAppStore.setState({ user: dbParent });
  render(<AdultTaskCreateForm creator={dbParent} isLive onClose={jest.fn()} onCreated={jest.fn()} />);

  fillAndSubmit();

  await waitFor(() => expect(mockCreateQuest).toHaveBeenCalledWith(expect.objectContaining({
    created_by: dbParent.id,
  })));
  expect(mockCreateUserProfile).not.toHaveBeenCalled();
});

test("DBユーザー作成に失敗したらタスクを送信せずエラーを表示する", async () => {
  mockCreateUserProfile.mockRejectedValue(new Error("ユーザーを作成できません"));
  render(<AdultTaskCreateForm creator={mockParent} isLive onClose={jest.fn()} onCreated={jest.fn()} />);

  fillAndSubmit();

  await waitFor(() => expect(screen.getByText("ユーザーを作成できません")).toBeTruthy());
  expect(mockCreateQuest).not.toHaveBeenCalled();
});

test("Supabaseが返した通常のエラーオブジェクトの理由も表示する", async () => {
  mockCreateUserProfile.mockRejectedValue({ message: "Supabaseに接続できません" });
  render(<AdultTaskCreateForm creator={mockParent} isLive onClose={jest.fn()} onCreated={jest.fn()} />);

  fillAndSubmit();

  await waitFor(() => expect(screen.getByText("Supabaseに接続できません")).toBeTruthy());
  expect(mockCreateQuest).not.toHaveBeenCalled();
});
