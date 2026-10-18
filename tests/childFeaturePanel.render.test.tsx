import { fireEvent, render, screen, waitFor } from "@testing-library/react-native";
import { beforeEach, expect, jest, test } from "@jest/globals";

/**
 * 親の設定画面で、子供ごとに機能を使う・使わないを切り替える欄（Issue #348）。
 */

let mockMembers: { id: string; name: string; role: "parent" | "child" }[];
let mockMembersError: string | null = null;
const mockReloadMembers = jest.fn(() => Promise.resolve());
jest.mock("../lib/useFamilyMembers", () => ({
  useFamilyMembers: () => ({ error: mockMembersError, loading: false, members: mockMembers, reload: mockReloadMembers }),
}));

const mockReload = jest.fn(() => Promise.resolve());
const mockUpdateData = jest.fn();
let mockState: {
  restrictions: { user_id: string; feature: "bank" }[];
  isLive: boolean;
  loading: boolean;
  error: string | null;
  hasData: boolean;
};
jest.mock("../lib/useChildFeatureRestrictions", () => ({
  useChildFeatureRestrictions: () => ({ ...mockState, reload: mockReload, updateData: mockUpdateData }),
}));

const mockSetChildFeatureEnabled = jest.fn<(...args: unknown[]) => Promise<void>>(() => Promise.resolve());
jest.mock("../lib/childFeatureService", () => ({
  setChildFeatureEnabled: (...args: unknown[]) => mockSetChildFeatureEnabled(...args),
}));

import ChildFeaturePanel from "../components/settings/ChildFeaturePanel";

beforeEach(() => {
  jest.clearAllMocks();
  mockMembers = [
    { id: "parent-1", name: "お父さん", role: "parent" },
    { id: "child-a", name: "たろう", role: "child" },
    { id: "child-b", name: "はなこ", role: "child" },
  ];
  mockMembersError = null;
  mockState = { error: null, hasData: true, isLive: true, loading: false, restrictions: [{ feature: "bank", user_id: "child-b" }] };
});

test("子供ごとに銀行のスイッチを出し、使わないにした子供はオフになっている", () => {
  render(<ChildFeaturePanel />);

  expect(screen.getByLabelText("たろうの銀行").props.value).toBe(true);
  expect(screen.getByLabelText("はなこの銀行").props.value).toBe(false);
  // 状態は accessibilityState で読み上げる（ラベルに「オン・オフ」を入れると二重に読まれる）
  expect(screen.getByLabelText("たろうの銀行").props.accessibilityState).toMatchObject({ checked: true });
  expect(screen.getByLabelText("はなこの銀行").props.accessibilityState).toMatchObject({ checked: false });
  // 大人は切り替えの対象にしない
  expect(screen.queryByText("お父さん")).toBeNull();
});

test("スイッチを切ると保存し、取り直す", async () => {
  render(<ChildFeaturePanel />);

  fireEvent(screen.getByLabelText("たろうの銀行"), "valueChange", false);

  await waitFor(() => expect(mockReload).toHaveBeenCalledTimes(1));
  expect(mockSetChildFeatureEnabled).toHaveBeenCalledWith("child-a", "bank", false);
  expect(mockUpdateData).toHaveBeenCalledTimes(1);
});

test("保存に失敗したら理由を出し、表示は変えない", async () => {
  mockSetChildFeatureEnabled.mockRejectedValueOnce(new Error("機能の使う・使わないを決められるのは親だけです"));
  render(<ChildFeaturePanel />);

  fireEvent(screen.getByLabelText("はなこの銀行"), "valueChange", true);

  await waitFor(() => expect(screen.getByText("機能の使う・使わないを決められるのは親だけです")).toBeTruthy());
  expect(mockUpdateData).not.toHaveBeenCalled();
  expect(mockReload).not.toHaveBeenCalled();
});

test("プレビュー中はスイッチを押せない", () => {
  mockState = { ...mockState, isLive: false, restrictions: [] };
  render(<ChildFeaturePanel />);

  expect(screen.getByLabelText("たろうの銀行").props.disabled).toBe(true);
  expect(screen.getByText("※ プレビュー中はボタンを操作できません")).toBeTruthy();
});

test("子供がいなければ、その旨を出す", () => {
  mockMembers = [{ id: "parent-1", name: "お父さん", role: "parent" }];
  render(<ChildFeaturePanel />);

  expect(screen.getByText("まだ子供が登録されていません")).toBeTruthy();
});

test("子供の一覧を取れなかったときは、「まだ子供が登録されていません」を出さず、再試行できる", () => {
  mockMembers = [];
  mockMembersError = "家族の子供を取得できませんでした";
  render(<ChildFeaturePanel />);

  expect(screen.getByText("家族の子供を取得できませんでした")).toBeTruthy();
  expect(screen.queryByText("まだ子供が登録されていません")).toBeNull();
  fireEvent.press(screen.getByRole("button", { name: "家族の子供の取得を再試行" }));
  expect(mockReloadMembers).toHaveBeenCalledTimes(1);
});

test("設定を取れなかったときは、スイッチを出さず（オンに見せず）、再試行できる", () => {
  mockState = { ...mockState, error: "子供ごとの機能の設定を取得できませんでした", hasData: false, restrictions: [] };
  render(<ChildFeaturePanel />);

  expect(screen.queryByLabelText("たろうの銀行")).toBeNull();
  fireEvent.press(screen.getByRole("button", { name: "子供ごとの機能の取得を再試行" }));
  expect(mockReload).toHaveBeenCalledTimes(1);
});
