import { act, fireEvent, render, screen } from "@testing-library/react-native";
import { afterEach, beforeEach, expect, jest, test } from "@jest/globals";
import { AppState, type AppStateStatus, View } from "react-native";
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
import AdultTaskDetail from "../components/tasks/AdultTaskDetail";
import AdultQuestDeadlineEditor from "../components/tasks/AdultQuestDeadlineEditor";
import QuestDeadlineField from "../components/tasks/QuestDeadlineField";
import QuestDeadlinePicker from "../components/tasks/QuestDeadlinePicker";
import TaskDetail from "../components/tasks/TaskDetail";
import TaskList from "../components/tasks/TaskList";
import { useQuestDeadlineClock } from "../lib/useQuestDeadlineClock";
import { useAppStore } from "../store";
import { pressWithoutWaiting } from "./pressWithoutWaiting";

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
  mockAccept.mockResolvedValue();
  mockReport.mockResolvedValue();
});
afterEach(() => {
  jest.useRealTimers();
  jest.restoreAllMocks();
});

async function openLimitedForm() {
  await render(<AdultTaskCreateForm creator={parent} isLive onClose={jest.fn()} onCreated={changed} />);
  await fireEvent.changeText(screen.getByPlaceholderText("タスク名を入力"), "限定のお手伝い");
  await fireEvent.changeText(screen.getByPlaceholderText("1"), "10");
  await fireEvent.press(screen.getByRole("button", { name: "限定" }));
}

async function choosePart(label: string, option: string) {
  await fireEvent.press(screen.getByRole("button", { name: `期限の${label}` }));
  await fireEvent.press(screen.getByRole("button", { name: option }));
}

async function chooseDeadline(day: number, hour = 18) {
  await fireEvent.press(screen.getByRole("button", { name: "限定タスクの期限" }));
  await choosePart("日", `${day}日`);
  await choosePart("時", `${hour}時`);
  await fireEvent.press(screen.getByRole("button", { name: "この日時にする" }));
}

test("親が限定タスクを日時付きで作成し、日本時間をUTCにして保存する", async () => {
  await openLimitedForm();
  await chooseDeadline(20);
  await act(async () => { await fireEvent.press(screen.getByRole("button", { name: "追加" })); });
  expect(mockCreate).toHaveBeenCalledWith(expect.objectContaining({ category: "limited", expires_at: quest.expires_at }));
  expect(changed).toHaveBeenCalled();
});

test("期限は任意で、期限なしの限定タスクも作れる", async () => {
  await openLimitedForm();
  await act(async () => { await fireEvent.press(screen.getByRole("button", { name: "追加" })); });
  expect(mockCreate).toHaveBeenCalledWith(expect.objectContaining({ category: "limited", expires_at: null }));
});

test("選択した期限があっても、デイリーへ切り替えたら期限を保存しない", async () => {
  await openLimitedForm();
  await chooseDeadline(20);
  await fireEvent.press(screen.getByRole("button", { name: "デイリー" }));
  expect(screen.queryByLabelText("限定タスクの期限")).toBeNull();
  await act(async () => { await fireEvent.press(screen.getByRole("button", { name: "追加" })); });
  expect(mockCreate).toHaveBeenCalledWith(expect.objectContaining({ category: "daily", expires_at: null }));
});

test("詳細から期限を延長・解除して保存し、一覧を再取得する", async () => {
  const { rerender } = await render(<View><AdultQuestDeadlineEditor canWrite key={quest.id} onSaved={changed} quest={quest} /></View>);
  expect(screen.getByLabelText("限定タスクの期限").props.accessibilityValue.text).toBe("2026/10/20 18:00");
  await chooseDeadline(21, 19);
  await act(async () => { await fireEvent.press(screen.getByRole("button", { name: "期限を保存" })); });
  expect(mockUpdate).toHaveBeenCalledWith("limited", "2026-10-21T10:00:00.000Z");
  await rerender(<View><AdultQuestDeadlineEditor canWrite key={quest.id} onSaved={changed} quest={{ ...quest, expires_at: "2026-10-21T10:00:00.000Z" }} /></View>);
  expect(screen.getByText("期限を更新しました")).toBeTruthy();
  await fireEvent.press(screen.getByRole("button", { name: "期限なしにする" }));
  await act(async () => { await fireEvent.press(screen.getByRole("button", { name: "期限を保存" })); });
  expect(mockUpdate).toHaveBeenLastCalledWith("limited", null);
  await rerender(<View><AdultQuestDeadlineEditor canWrite key={quest.id} onSaved={changed} quest={{ ...quest, expires_at: null }} /></View>);
  expect(screen.getByText("期限を更新しました")).toBeTruthy();
  expect(changed).toHaveBeenCalledTimes(2);
  // 保存済みの表示が届いた後でも、さらに遅れた旧応答で巻き戻さない。
  await rerender(<View><AdultQuestDeadlineEditor canWrite key={quest.id} onSaved={changed} quest={quest} /></View>);
  expect(screen.getByText("期限を更新しました")).toBeTruthy();
  expect(screen.getByLabelText("限定タスクの期限").props.accessibilityValue.text).toBe("期限なし");
  expect(screen.getByRole("button", { name: "期限を保存" }).props.accessibilityState.disabled).toBe(true);
});

test("未編集なら外部の期限を同期し、編集・保存中・保存後は再取得で上書きしない", async () => {
  let resolveSave: () => void = () => undefined;
  mockUpdate.mockImplementationOnce(() => new Promise<void>((resolve) => { resolveSave = resolve; }));
  const editor = (expires_at: string | null) => <AdultQuestDeadlineEditor canWrite onSaved={changed} quest={{ ...quest, expires_at }} />;
  const { rerender } = await render(editor(quest.expires_at!));
  await rerender(editor("2026-10-22T09:00:00Z"));
  expect(screen.getByLabelText("限定タスクの期限").props.accessibilityValue.text).toBe("2026/10/22 18:00");
  await chooseDeadline(23, 19);
  await rerender(editor("2026-10-24T09:00:00Z"));
  expect(screen.getByLabelText("限定タスクの期限").props.accessibilityValue.text).toBe("2026/10/23 19:00");
  await pressWithoutWaiting(screen.getByRole("button", { name: "期限を保存" }));
  await rerender(editor(quest.expires_at!));
  expect(screen.getByLabelText("限定タスクの期限").props.accessibilityValue.text).toBe("2026/10/23 19:00");
  await act(async () => resolveSave());
  expect(mockUpdate).toHaveBeenCalledWith(quest.id, "2026-10-23T10:00:00.000Z");
  await rerender(editor("2026-10-24T09:00:00Z"));
  expect(screen.getByText("期限を更新しました")).toBeTruthy();
  expect(screen.getByLabelText("限定タスクの期限").props.accessibilityValue.text).toBe("2026/10/23 19:00");
  expect(screen.getByRole("button", { name: "期限を保存" }).props.accessibilityState.disabled).toBe(true);
});

test("保存失敗は表示し、別タスクへ切り替えると入力とエラーを引き継がない", async () => {
  mockUpdate.mockRejectedValue(new Error("期限の更新に失敗しました"));
  const { rerender } = await render(<View><AdultQuestDeadlineEditor canWrite key={quest.id} onSaved={changed} quest={quest} /></View>);
  await fireEvent.press(screen.getByRole("button", { name: "期限なしにする" }));
  await act(async () => { await fireEvent.press(screen.getByRole("button", { name: "期限を保存" })); });
  expect(screen.getByText("期限の更新に失敗しました")).toBeTruthy();
  expect(changed).not.toHaveBeenCalled();
  await rerender(<View><AdultQuestDeadlineEditor canWrite key="other" onSaved={changed} quest={{ ...quest, id: "other" }} /></View>);
  expect(screen.getByLabelText("限定タスクの期限").props.accessibilityValue.text).toBe("2026/10/20 18:00");
  expect(screen.queryByText("期限の更新に失敗しました")).toBeNull();
});

test("日時選択は確定するまで保存せず、キャンセルなら期限なしを保つ", async () => {
  await openLimitedForm();
  await fireEvent.press(screen.getByRole("button", { name: "限定タスクの期限" }));
  await choosePart("日", "20日");
  await fireEvent.press(screen.getByRole("button", { name: "キャンセル" }));
  expect(screen.getByLabelText("限定タスクの期限").props.accessibilityValue.text).toBe("期限なし");
  await act(async () => { await fireEvent.press(screen.getByRole("button", { name: "追加" })); });
  expect(mockCreate).toHaveBeenCalledWith(expect.objectContaining({ expires_at: null }));
});

test("1月31日から2月へ変えると28日になり、うるう年なら29日も選べる", async () => {
  const confirm = jest.fn();
  await render(<QuestDeadlinePicker initial={{ year: 2026, month: 1, day: 31, hour: 23, minute: 59 }} onCancel={jest.fn()} onConfirm={confirm} />);
  await choosePart("月", "2月");
  expect(screen.getByLabelText("期限の日").props.accessibilityValue.text).toBe("28日");
  await choosePart("年", "2028年");
  await choosePart("日", "29日");
  await fireEvent.press(screen.getByRole("button", { name: "この日時にする" }));
  expect(confirm).toHaveBeenCalledWith("2028/02/29 23:59");
});

test("分単位の選択と保存済み日時のキャンセル、無効状態での操作を扱う", async () => {
  const onChange = jest.fn();
  const { rerender } = await render(<QuestDeadlineField onChange={onChange} value="2026/10/20 18:00" />);
  await fireEvent.press(screen.getByRole("button", { name: "限定タスクの期限" }));
  await choosePart("分", "5分");
  await fireEvent.press(screen.getByRole("button", { name: "この日時にする" }));
  expect(onChange).toHaveBeenLastCalledWith("2026/10/20 18:05");
  onChange.mockClear();
  await fireEvent.press(screen.getByRole("button", { name: "限定タスクの期限" }));
  await choosePart("時", "19時");
  await fireEvent.press(screen.getByRole("button", { name: "キャンセル" }));
  expect(onChange).not.toHaveBeenCalled();
  await rerender(<QuestDeadlineField disabled onChange={onChange} value="2026/10/20 18:00" />);
  await fireEvent.press(screen.getByRole("button", { name: "限定タスクの期限" }));
  expect(screen.queryByText("期限を選択")).toBeNull();
});

function ChildDeadlineHarness({ items = quests }: { items?: Quest[] }) {
  const now = useQuestDeadlineClock(items);
  return <>
    <TaskList currentUserId="child" now={now} onSelect={jest.fn()} quests={items} />
    <TaskDetail currentUserId="child" height={280} isLive now={now} onActionComplete={changed} onClose={jest.fn()} quest={items[0]} />
  </>;
}

test("画面を開いたまま期限ちょうどになったら受注を停止し、一覧に残す", async () => {
  await render(<ChildDeadlineHarness />);
  expect(screen.getByRole("button", { name: "受注する" }).props.accessibilityState.disabled).toBe(false);
  await act(() => jest.advanceTimersByTime(30_000));
  expect(screen.getByRole("button", { name: "受注する" }).props.accessibilityState.disabled).toBe(true);
  expect(screen.getAllByText("限定のお手伝い")).toHaveLength(2);
  const label = screen.getByRole("button", { name: /期限切れ/ }).props.accessibilityLabel;
  expect(label).not.toMatch(/未受注|受注中/);
  expect(label.match(/期限切れ/g)).toHaveLength(1);
  expect(mockAccept).not.toHaveBeenCalled();
});

test("大人の詳細も期限切れを表示し、承認待ちは期限後も承認待ちのまま表示する", async () => {
  const props = { approver: parent, canWrite: false, isLive: false, onActionComplete: changed, onClose: jest.fn(), now: Date.parse(quest.expires_at!) };
  const { rerender } = await render(<AdultTaskDetail {...props} quest={{ ...quest, status: "accepted" }} />);
  expect(screen.getByText("現在：期限切れ")).toBeTruthy();
  expect(screen.queryByText("現在：受注中")).toBeNull();
  await rerender(<AdultTaskDetail {...props} quest={{ ...quest, status: "pending" }} />);
  expect(screen.getByText("現在：承認待")).toBeTruthy();
});

test("子供の期限の日本時間にもふりがなを付ける", async () => {
  const previous = useAppStore.getState().user;
  useAppStore.setState({ user: { ...parent, role: "child" } });
  try {
    await render(<ChildDeadlineHarness />);
    expect(screen.getByText("にほんじかん")).toBeTruthy();
  } finally {
    await act(() => useAppStore.setState({ user: previous }));
  }
});

test("受注済みでも期限で完了申請を止め、前面復帰でも時刻を更新する", async () => {
  let resume: (state: AppStateStatus) => void = () => undefined;
  jest.spyOn(AppState, "addEventListener").mockImplementation((_, listener) => {
    resume = listener;
    return { remove: jest.fn() };
  });
  await render(<ChildDeadlineHarness items={[{ ...quest, status: "accepted", assigned_to: "child" }]} />);
  expect(screen.getByRole("button", { name: "完了報告" }).props.accessibilityState.disabled).toBe(false);
  jest.setSystemTime(new Date("2026-10-20T09:00:00Z"));
  await act(() => resume("active"));
  expect(screen.getByRole("button", { name: "完了報告" }).props.accessibilityState.disabled).toBe(true);
  expect(mockReport).not.toHaveBeenCalled();
});

test.each(["open", "accepted"] as const)("%sの操作時に期限を迎えたら、何も起きないままにせず案内する", async (status) => {
  await render(<TaskDetail currentUserId="child" height={280} isLive now={Date.now()} onActionComplete={changed} onClose={jest.fn()}
    quest={{ ...quest, status, assigned_to: "child" }} />);
  jest.setSystemTime(new Date(quest.expires_at!));
  await act(async () => { await fireEvent.press(screen.getByRole("button", { name: status === "open" ? "受注する" : "完了報告" })); });
  expect(screen.getByLabelText("期限をすぎたので、受注・完了報告はできません")).toBeTruthy();
  expect(mockAccept).not.toHaveBeenCalled();
  expect(mockReport).not.toHaveBeenCalled();
});

test.each(["open", "accepted"] as const)("%sのDBエラーは、期限切れも技術的な失敗も子供向けの案内にする", async (status) => {
  jest.spyOn(console, "warn").mockImplementation(() => undefined);
  const action = status === "open" ? mockAccept : mockReport;
  action.mockRejectedValueOnce({ message: "期限切れのタスクは受注・完了申請できません", code: "P0001" });
  action.mockRejectedValueOnce({ message: "permission denied for table quests", code: "42501" });
  action.mockRejectedValueOnce(new Error("network request failed"));
  const previous = useAppStore.getState().user;
  useAppStore.setState({ user: { ...parent, role: "child" } });
  try {
    await render(<TaskDetail currentUserId="child" height={280} isLive onActionComplete={changed} onClose={jest.fn()}
      quest={{ ...quest, status, assigned_to: "child" }} />);
    const press = async () => { await act(async () => { await fireEvent.press(screen.getByRole("button", { name: status === "open" ? "受注する" : "完了報告" })); }); };
    await press();
    expect(screen.getByText("きげん")).toBeTruthy();
    expect(screen.getByLabelText("期限をすぎたので、受注・完了報告はできません")).toBeTruthy();
    await press();
    expect(screen.getByText("しっぱい")).toBeTruthy();
    expect(screen.queryByText(/permission denied/)).toBeNull();
    await press();
    expect(screen.getByText("しっぱい")).toBeTruthy();
    expect(screen.queryByText(/network request failed/)).toBeNull();
    expect(changed).not.toHaveBeenCalled();
  } finally {
    await act(() => useAppStore.setState({ user: previous }));
  }
});

test("期限切れでも自分が受けたタスクを見分けられ、他の人の担当を自分と表示しない", async () => {
  const items: Quest[] = [
    { ...quest, status: "accepted", assigned_to: "child" },
    { ...quest, id: "other", status: "accepted", assigned_to: "sibling", title: "ほかの人のタスク" },
    { ...quest, id: "open", title: "だれも受けていないタスク" },
  ];
  await render(<TaskList currentUserId="child" now={Date.parse(quest.expires_at!)} onSelect={jest.fn()} quests={items} />);
  expect(screen.getByRole("button", { name: /限定のお手伝い.*期限切れ.*担当：あなた/ })).toBeTruthy();
  expect(screen.getByRole("button", { name: /ほかの人のタスク/ }).props.accessibilityLabel).not.toMatch(/あなた/);
  expect(screen.getByRole("button", { name: /だれも受けていないタスク/ }).props.accessibilityLabel).not.toMatch(/あなた/);
});

test.each(["pending", "completed"] as const)("%sでも期限を変更でき、変更しても状態は戻らないと案内する", async (status) => {
  await render(<AdultTaskDetail approver={parent} canWrite isLive onActionComplete={changed} onClose={jest.fn()} quest={{ ...quest, status }} />);
  expect(screen.getByText(status === "pending" ? /期限を変更しても承認待ちのまま/ : /期限を変更しても完了済みのまま/)).toBeTruthy();
  await chooseDeadline(21, 19);
  await act(async () => { await fireEvent.press(screen.getByRole("button", { name: "期限を保存" })); });
  expect(mockUpdate).toHaveBeenCalledWith(quest.id, "2026-10-21T10:00:00.000Z");
});
