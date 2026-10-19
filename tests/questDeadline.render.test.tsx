import { act, fireEvent, render, screen } from "@testing-library/react-native";
import { afterEach, beforeEach, expect, jest, test } from "@jest/globals";
import { AppState } from "react-native";
import type { Quest, User } from "../types";

const mockCreate = jest.fn<(...args: unknown[]) => Promise<unknown>>();
const mockUpdate = jest.fn<(...args: unknown[]) => Promise<void>>();
const mockAccept = jest.fn<(...args: unknown[]) => Promise<void>>();
const mockReport = jest.fn<(...args: unknown[]) => Promise<void>>();
jest.mock("../lib/taskService", () => ({
  createQuest: (...args: unknown[]) => mockCreate(...args),
  updateQuestDeadline: (...args: unknown[]) => mockUpdate(...args),
  acceptQuest: (...args: unknown[]) => mockAccept(...args),
  submitQuestCompletion: (...args: unknown[]) => mockReport(...args),
}));
jest.mock("../lib/userService", () => ({ ensureDbUser: async (user: User) => user }));
jest.mock("../lib/audio", () => ({ playSoundEffect: jest.fn() }));

import AdultTaskCreateForm from "../components/tasks/AdultTaskCreateForm";
import AdultQuestDeadlineEditor from "../components/tasks/AdultQuestDeadlineEditor";
import QuestDeadlineField from "../components/tasks/QuestDeadlineField";
import QuestDeadlinePicker from "../components/tasks/QuestDeadlinePicker";
import TaskDetail from "../components/tasks/TaskDetail";
import TaskList from "../components/tasks/TaskList";
import { useQuestDeadlineClock } from "../lib/useQuestDeadlineClock";

const parent: User = { id: "parent", family_id: "family", name: "親", role: "parent", balance: 0, created_at: "2026-10-01T00:00:00Z" };
const quest: Quest = {
  id: "limited", family_id: "family", title: "限定のお手伝い", description: "片付ける", category: "limited",
  expires_at: "2026-10-20T09:00:00.000Z", reward_amount: 10, is_required: false,
  status: "open", assigned_to: null, created_by: "parent", created_at: "2026-10-01T00:00:00Z",
};
const quests = [quest];
const changed = jest.fn();

beforeEach(() => {
  jest.clearAllMocks();
  jest.useFakeTimers();
  jest.setSystemTime(new Date("2026-10-20T08:59:30Z"));
  mockCreate.mockResolvedValue(quest);
  mockUpdate.mockResolvedValue();
});
afterEach(() => {
  jest.useRealTimers();
  jest.restoreAllMocks();
});

function openLimitedForm() {
  render(<AdultTaskCreateForm creator={parent} isLive onClose={jest.fn()} onCreated={changed} />);
  fireEvent.changeText(screen.getByPlaceholderText("タスク名を入力"), "限定のお手伝い");
  fireEvent.changeText(screen.getByPlaceholderText("1"), "10");
  fireEvent.press(screen.getByRole("button", { name: "限定" }));
}

function choosePart(label: string, option: string) {
  fireEvent.press(screen.getByRole("button", { name: `期限の${label}` }));
  fireEvent.press(screen.getByRole("button", { name: option }));
}

function chooseDeadline(day: number, hour = 18) {
  fireEvent.press(screen.getByRole("button", { name: "限定タスクの期限" }));
  choosePart("日", `${day}日`);
  choosePart("時", `${hour}時`);
  fireEvent.press(screen.getByRole("button", { name: "この日時にする" }));
}

test("親が限定タスクを日時付きで作成し、日本時間をUTCにして保存する", async () => {
  openLimitedForm();
  chooseDeadline(20);
  await act(async () => { fireEvent.press(screen.getByRole("button", { name: "追加" })); });
  expect(mockCreate).toHaveBeenCalledWith(expect.objectContaining({ category: "limited", expires_at: quest.expires_at }));
  expect(changed).toHaveBeenCalled();
});

test("期限は任意で、期限なしの限定タスクも作れる", async () => {
  openLimitedForm();
  await act(async () => { fireEvent.press(screen.getByRole("button", { name: "追加" })); });
  expect(mockCreate).toHaveBeenCalledWith(expect.objectContaining({ category: "limited", expires_at: null }));
});

test("選択した期限があっても、デイリーへ切り替えたら期限を保存しない", async () => {
  openLimitedForm();
  chooseDeadline(20);
  fireEvent.press(screen.getByRole("button", { name: "デイリー" }));
  expect(screen.queryByLabelText("限定タスクの期限")).toBeNull();
  await act(async () => { fireEvent.press(screen.getByRole("button", { name: "追加" })); });
  expect(mockCreate).toHaveBeenCalledWith(expect.objectContaining({ category: "daily", expires_at: null }));
});

test("詳細から期限を延長・解除して保存し、一覧を再取得する", async () => {
  render(<AdultQuestDeadlineEditor canWrite onSaved={changed} quest={quest} />);
  expect(screen.getByLabelText("限定タスクの期限").props.accessibilityValue.text).toBe("2026/10/20 18:00");
  chooseDeadline(21, 19);
  await act(async () => { fireEvent.press(screen.getByRole("button", { name: "期限を保存" })); });
  expect(mockUpdate).toHaveBeenCalledWith("limited", "2026-10-21T10:00:00.000Z");
  fireEvent.press(screen.getByRole("button", { name: "期限なしにする" }));
  await act(async () => { fireEvent.press(screen.getByRole("button", { name: "期限を保存" })); });
  expect(mockUpdate).toHaveBeenLastCalledWith("limited", null);
  expect(changed).toHaveBeenCalledTimes(2);
});

test("保存失敗は表示し、別タスクへ切り替えると入力とエラーを引き継がない", async () => {
  mockUpdate.mockRejectedValue(new Error("期限の更新に失敗しました"));
  const { rerender } = render(<AdultQuestDeadlineEditor canWrite onSaved={changed} quest={quest} />);
  fireEvent.press(screen.getByRole("button", { name: "期限なしにする" }));
  await act(async () => { fireEvent.press(screen.getByRole("button", { name: "期限を保存" })); });
  expect(screen.getByText("期限の更新に失敗しました")).toBeTruthy();
  expect(changed).not.toHaveBeenCalled();
  rerender(<AdultQuestDeadlineEditor canWrite onSaved={changed} quest={{ ...quest, id: "other" }} />);
  expect(screen.getByLabelText("限定タスクの期限").props.accessibilityValue.text).toBe("2026/10/20 18:00");
  expect(screen.queryByText("期限の更新に失敗しました")).toBeNull();
});

test("日時選択は確定するまで保存せず、キャンセルなら期限なしを保つ", async () => {
  openLimitedForm();
  fireEvent.press(screen.getByRole("button", { name: "限定タスクの期限" }));
  choosePart("日", "20日");
  fireEvent.press(screen.getByRole("button", { name: "キャンセル" }));
  expect(screen.getByLabelText("限定タスクの期限").props.accessibilityValue.text).toBe("期限なし");
  await act(async () => { fireEvent.press(screen.getByRole("button", { name: "追加" })); });
  expect(mockCreate).toHaveBeenCalledWith(expect.objectContaining({ expires_at: null }));
});

test("1月31日から2月へ変えると28日になり、うるう年なら29日も選べる", () => {
  const confirm = jest.fn();
  render(<QuestDeadlinePicker initial={{ year: 2026, month: 1, day: 31, hour: 23, minute: 59 }} onCancel={jest.fn()} onConfirm={confirm} />);
  choosePart("月", "2月");
  expect(screen.getByLabelText("期限の日").props.accessibilityValue.text).toBe("28日");
  choosePart("年", "2028年");
  choosePart("日", "29日");
  fireEvent.press(screen.getByRole("button", { name: "この日時にする" }));
  expect(confirm).toHaveBeenCalledWith("2028/02/29 23:59");
});

test("分単位の選択と保存済み日時のキャンセル、無効状態での操作を扱う", () => {
  const onChange = jest.fn();
  const { rerender } = render(<QuestDeadlineField onChange={onChange} value="2026/10/20 18:00" />);
  fireEvent.press(screen.getByRole("button", { name: "限定タスクの期限" }));
  choosePart("分", "5分");
  fireEvent.press(screen.getByRole("button", { name: "この日時にする" }));
  expect(onChange).toHaveBeenLastCalledWith("2026/10/20 18:05");
  onChange.mockClear();
  fireEvent.press(screen.getByRole("button", { name: "限定タスクの期限" }));
  choosePart("時", "19時");
  fireEvent.press(screen.getByRole("button", { name: "キャンセル" }));
  expect(onChange).not.toHaveBeenCalled();
  rerender(<QuestDeadlineField disabled onChange={onChange} value="2026/10/20 18:00" />);
  fireEvent.press(screen.getByRole("button", { name: "限定タスクの期限" }));
  expect(screen.queryByText("期限を選択")).toBeNull();
});

function ChildDeadlineHarness({ items = quests }: { items?: Quest[] }) {
  const now = useQuestDeadlineClock(items);
  return <>
    <TaskList now={now} onSelect={jest.fn()} quests={items} />
    <TaskDetail currentUserId="child" height={280} isLive now={now} onActionComplete={changed} onClose={jest.fn()} quest={items[0]} />
  </>;
}

test("画面を開いたまま期限ちょうどになったら受注を停止し、一覧に残す", () => {
  render(<ChildDeadlineHarness />);
  expect(screen.getByRole("button", { name: "受注する" }).props.accessibilityState.disabled).toBe(false);
  act(() => jest.advanceTimersByTime(30_000));
  expect(screen.getByRole("button", { name: "受注する" }).props.accessibilityState.disabled).toBe(true);
  expect(screen.getAllByText("限定のお手伝い")).toHaveLength(2);
  expect(screen.getByRole("button", { name: /期限切れ/ })).toBeTruthy();
  expect(mockAccept).not.toHaveBeenCalled();
});

test("受注済みでも期限で完了申請を止め、前面復帰でも時刻を更新する", () => {
  let resume: (state: string) => void = () => undefined;
  jest.spyOn(AppState, "addEventListener").mockImplementation((_, listener) => {
    resume = listener;
    return { remove: jest.fn() };
  });
  render(<ChildDeadlineHarness items={[{ ...quest, status: "accepted", assigned_to: "child" }]} />);
  expect(screen.getByRole("button", { name: "完了報告" }).props.accessibilityState.disabled).toBe(false);
  jest.setSystemTime(new Date("2026-10-20T09:00:00Z"));
  act(() => resume("active"));
  expect(screen.getByRole("button", { name: "完了報告" }).props.accessibilityState.disabled).toBe(true);
  expect(mockReport).not.toHaveBeenCalled();
});
