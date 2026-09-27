import { act, fireEvent, render, screen } from "@testing-library/react-native";
import { beforeEach, expect, jest, test } from "@jest/globals";

jest.mock("../lib/devRole", () => ({ DEV_ROLE_OVERRIDE: undefined }));

const mockFetchUserFamilyId = jest.fn<(...args: unknown[]) => Promise<string | null>>();
jest.mock("../lib/userService", () => ({
  fetchUserFamilyId: (...args: unknown[]) => mockFetchUserFamilyId(...args),
}));

const mockCreateChildAccount = jest.fn<(...args: unknown[]) => Promise<string>>();
const mockFetchFamilyChildren = jest.fn<(...args: unknown[]) => Promise<{ id: string; name: string }[]>>();
jest.mock("../lib/childAccountService", () => {
  const actual = jest.requireActual<typeof import("../lib/childAccountService")>("../lib/childAccountService");
  return {
    ...actual,
    createChildAccount: (...args: unknown[]) => mockCreateChildAccount(...args),
    fetchFamilyChildren: (...args: unknown[]) => mockFetchFamilyChildren(...args),
  };
});

import FamilyChildrenPanel from "../components/settings/FamilyChildrenPanel";
import { useAppStore } from "../store";

const parent = {
  balance: 0,
  created_at: "2026-07-01T00:00:00Z",
  id: "22222222-2222-4222-8222-222222222222",
  name: "お父さん",
  role: "parent" as const,
};

beforeEach(() => {
  jest.clearAllMocks();
  useAppStore.setState({ user: parent });
  mockFetchUserFamilyId.mockResolvedValue("family-1");
  mockFetchFamilyChildren.mockResolvedValue([{ id: "c1", name: "たろう" }]);
  mockCreateChildAccount.mockResolvedValue("c2");
});

const renderLoaded = async () => {
  render(<FamilyChildrenPanel />);
  await act(async () => undefined);
};

test("ログイン中の親の家族の子供を一覧する", async () => {
  await renderLoaded();

  expect(mockFetchUserFamilyId).toHaveBeenCalledWith(parent.id);
  expect(mockFetchFamilyChildren).toHaveBeenCalledWith("family-1");
  expect(screen.getByText("たろう")).toBeTruthy();
});

test("名前を入れて追加すると、子供アカウントを作って一覧を取り直す", async () => {
  await renderLoaded();
  mockFetchFamilyChildren.mockResolvedValue([
    { id: "c1", name: "たろう" },
    { id: "c2", name: "はなこ" },
  ]);

  fireEvent.changeText(screen.getByLabelText("追加する子供の名前"), "  はなこ ");
  await act(async () => {
    fireEvent.press(screen.getByLabelText("子供を追加"));
  });

  expect(mockCreateChildAccount).toHaveBeenCalledWith("はなこ");
  expect(screen.getByText("はなこ")).toBeTruthy();
  expect(screen.getByLabelText("追加する子供の名前").props.value).toBe("");
  expect(screen.getByText(/はなこさんを追加しました/)).toBeTruthy();
});

test("追加に失敗したら理由を表示し、入力は残す", async () => {
  mockCreateChildAccount.mockRejectedValue(new Error("先に家族を作成してください"));
  await renderLoaded();

  fireEvent.changeText(screen.getByLabelText("追加する子供の名前"), "はなこ");
  await act(async () => {
    fireEvent.press(screen.getByLabelText("子供を追加"));
  });

  expect(screen.getByText("先に家族を作成してください")).toBeTruthy();
  expect(screen.getByLabelText("追加する子供の名前").props.value).toBe("はなこ");
});

test("名前が空のあいだは追加できない", async () => {
  await renderLoaded();

  expect(screen.getByLabelText("子供を追加").props.accessibilityState.disabled).toBe(true);
  fireEvent.changeText(screen.getByLabelText("追加する子供の名前"), "   ");
  expect(screen.getByLabelText("子供を追加").props.accessibilityState.disabled).toBe(true);
});

test("未ログイン（プレビュー）では取得も追加もしない", async () => {
  useAppStore.setState({ user: null });
  await renderLoaded();

  expect(mockFetchUserFamilyId).not.toHaveBeenCalled();
  expect(screen.getByText("※ プレビュー中はボタンを操作できません")).toBeTruthy();
  expect(screen.getByLabelText("子供を追加").props.accessibilityState.disabled).toBe(true);
});
