import { fireEvent, render, screen } from "@testing-library/react-native";
import { beforeEach, expect, jest, test } from "@jest/globals";
import type { FamilyMember } from "../lib/useFamilyMembers";
const mockCreate = jest.fn<(...args: unknown[]) => Promise<unknown>>();
let mockMembers: FamilyMember[] = [];
let mockLoading = false;
let mockError: string | null = null;
jest.mock("../lib/useFamilyMembers", () => ({ useFamilyMembers: () => ({ members: mockMembers, loading: mockLoading, error: mockError, reload: jest.fn() }) }));
jest.mock("../lib/taskService", () => ({ createQuest: (...args: unknown[]) => mockCreate(...args) }));
jest.mock("../lib/userService", () => ({ ensureDbUser: async (user: unknown) => user }));
import AdultTaskCreateForm from "../components/tasks/AdultTaskCreateForm";
const parent = { id: "parent", family_id: "family", name: "親", role: "parent" as const, balance: 0, created_at: "2026-10-01" };
const children: FamilyMember[] = [{ id: "a", name: "あおい", role: "child" }, { id: "b", name: "はる", role: "child" }];
beforeEach(() => { jest.clearAllMocks(); mockMembers = children; mockLoading = false; mockError = null; mockCreate.mockResolvedValue({ id: "quest" }); });
async function open() {
  await render(<AdultTaskCreateForm creator={parent} isLive onClose={jest.fn()} onCreated={jest.fn()} />);
  await fireEvent.changeText(screen.getByPlaceholderText("タスク名を入力"), "掃除");
  await fireEvent.changeText(screen.getByPlaceholderText("1"), "10");
}
async function submit() { await fireEvent.press(screen.getByRole("button", { name: "追加" })); }

test.each([0, 1])("子供が%d人なら担当の設定を隠し、先着1人として作る", async (count) => {
  mockMembers = children.slice(0, count); await open();
  expect(screen.queryByText("担当する子")).toBeNull();
  await submit(); expect(mockCreate).toHaveBeenCalledWith(expect.objectContaining({ audience: "first", target_child_id: null }));
});
test("特定の子は担当を選ぶまで保存できず、指定した子だけを渡す", async () => {
  await open(); await fireEvent.press(screen.getByRole("button", { name: "特定の子" })); await submit();
  expect(mockCreate).not.toHaveBeenCalled();
  await fireEvent.press(screen.getByRole("button", { name: "担当：はる" })); await submit();
  expect(mockCreate).toHaveBeenCalledWith(expect.objectContaining({ audience: "specific", target_child_id: "b" }));
});
test("全員には1人ずつの報酬を案内し、先着に戻したら担当の指定を残さない", async () => {
  await open(); await fireEvent.press(screen.getByRole("button", { name: "特定の子" }));
  await fireEvent.press(screen.getByRole("button", { name: "担当：あおい" }));
  await fireEvent.press(screen.getByRole("button", { name: "全員" }));
  expect(screen.getByText("報酬は表示額を子供1人ずつに支払います。")).toBeTruthy();
  await submit(); expect(mockCreate).toHaveBeenLastCalledWith(expect.objectContaining({ audience: "all", target_child_id: null, reward_amount: 10 }));
  await fireEvent.press(screen.getByRole("button", { name: "先着1人" })); await submit();
  expect(mockCreate).toHaveBeenLastCalledWith(expect.objectContaining({ audience: "first", target_child_id: null }));
});
test("ウィークリーの開始曜日は選択でき、限定へ変えたら曜日を保存しない", async () => {
  await open(); await fireEvent.press(screen.getByRole("button", { name: "ウィークリー" }));
  await fireEvent.press(screen.getByRole("button", { name: "土曜始まり" })); await submit();
  expect(mockCreate).toHaveBeenLastCalledWith(expect.objectContaining({ category: "weekly", week_start_day: 6, daily_end_minutes: null }));
  await fireEvent.press(screen.getByRole("button", { name: "限定" })); await submit();
  expect(mockCreate).toHaveBeenLastCalledWith(expect.objectContaining({ category: "limited", week_start_day: null, daily_end_minutes: null }));
});
test("デイリーの終了時刻を保存し、不正な時刻のまま追加できない", async () => {
  await open(); await fireEvent.changeText(screen.getByLabelText("デイリーの終了時刻"), "18:30"); await submit();
  expect(mockCreate).toHaveBeenLastCalledWith(expect.objectContaining({ daily_end_minutes: 1110, week_start_day: null }));
  mockCreate.mockClear(); await fireEvent.changeText(screen.getByLabelText("デイリーの終了時刻"), "24:00"); await submit();
  expect(mockCreate).not.toHaveBeenCalled();
  expect(screen.getByText("終了時刻は00:00〜23:59をHH:mmで入力してください")).toBeTruthy();
});
test.each(["loading", "error"])("子供の取得が%sなら担当を確定したことにせず保存を止める", async (state) => {
  mockLoading = state === "loading"; mockError = state === "error" ? "失敗" : null; await open(); await submit();
  expect(mockCreate).not.toHaveBeenCalled();
});
