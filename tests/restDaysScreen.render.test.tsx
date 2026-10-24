import { fireEvent, render, screen, waitFor } from "@testing-library/react-native";
import { beforeEach, expect, jest, test } from "@jest/globals";

/**
 * 親が「家事をしなくていい日」を決める画面（Issue #396）。
 */

jest.mock("expo-router", () => ({
  router: { back: jest.fn(), canGoBack: () => true, push: jest.fn(), replace: jest.fn() },
  Stack: { Screen: () => null },
}));

const mockReload = jest.fn(() => Promise.resolve());
let mockState: {
  restDays: { user_id: string; rest_on: string }[];
  today: string;
  loading: boolean;
  error: string | null;
  isLive: boolean;
};
jest.mock("../lib/useQuestRestDays", () => ({
  useQuestRestDays: () => ({ ...mockState, reload: mockReload }),
}));

// 家族の一覧は既存の useFamilyMembers から取る（大人も含まれ、子供だけを選べるようにする）
let mockMembers: { id: string; name: string; role: "parent" | "child" }[];
const mockReloadMembers = jest.fn(() => Promise.resolve());
jest.mock("../lib/useFamilyMembers", () => ({
  useFamilyMembers: () => ({ error: null, loading: false, members: mockMembers, reload: mockReloadMembers }),
}));

const mockSetQuestRestDays = jest.fn<(...args: unknown[]) => Promise<number>>(() => Promise.resolve(2));
jest.mock("../lib/questRestDayService", () => ({
  setQuestRestDays: (...args: unknown[]) => mockSetQuestRestDays(...args),
}));

import RestDaysScreen from "../components/RestDaysScreen";

beforeEach(() => {
  jest.clearAllMocks();
  mockMembers = [
    { id: "parent-1", name: "お父さん", role: "parent" },
    { id: "child-a", name: "たろう", role: "child" },
    { id: "child-b", name: "はなこ", role: "child" },
  ];
  mockState = {
    error: null,
    isLive: true,
    loading: false,
    restDays: [{ rest_on: "2026-05-22", user_id: "child-a" }],
    today: "2026-05-20",
  };
});

test("最初は子供全員を選んでいて、選んだ日をまとめてお休みにできる", async () => {
  await render(<RestDaysScreen />);

  expect(screen.getByRole("checkbox", { name: "たろう" }).props.accessibilityState).toMatchObject({ checked: true });
  expect(screen.getByRole("checkbox", { name: "はなこ" }).props.accessibilityState).toMatchObject({ checked: true });
  // 大人はお休みの対象にしない
  expect(screen.queryByRole("checkbox", { name: "お父さん" })).toBeNull();

  await fireEvent.press(screen.getByTestId("rest-day-2026-05-23"));
  await fireEvent.press(screen.getByTestId("rest-day-2026-05-24"));
  await fireEvent.press(screen.getByRole("button", { name: "お休みにする" }));

  await waitFor(() => expect(mockSetQuestRestDays).toHaveBeenCalledTimes(1));
  expect(mockSetQuestRestDays).toHaveBeenCalledWith(["child-a", "child-b"], ["2026-05-23", "2026-05-24"], true);
  await waitFor(() => expect(screen.getByText("お休みの日にしました")).toBeTruthy());
  expect(mockReload).toHaveBeenCalledTimes(1);
});

test("1人だけ選んで、その子のお休みをやめられる", async () => {
  await render(<RestDaysScreen />);

  await fireEvent.press(screen.getByRole("checkbox", { name: "はなこ" }));
  await fireEvent.press(screen.getByTestId("rest-day-2026-05-22"));

  // たろうは5/22がお休みなので「お休みにする」は押せず、「やめる」だけ押せる
  expect(screen.getByRole("button", { name: "お休みにする" }).props.accessibilityState).toMatchObject({ disabled: true });
  await fireEvent.press(screen.getByRole("button", { name: "お休みをやめる" }));

  await waitFor(() => expect(mockSetQuestRestDays).toHaveBeenCalledWith(["child-a"], ["2026-05-22"], false));
});

test("1週間より前の日は選べない", async () => {
  await render(<RestDaysScreen />);

  expect(screen.getByTestId("rest-day-2026-05-12").props.accessibilityState).toMatchObject({ disabled: true });
  expect(screen.getByTestId("rest-day-2026-05-13").props.accessibilityState).toMatchObject({ disabled: false });
});

test("お休みの日は、何人お休みかと一覧に出す", async () => {
  await render(<RestDaysScreen />);

  expect(screen.getByRole("button", { name: "5月22日（金）、1人お休み" })).toBeTruthy();
  // 子供を選ぶボタンと、これからのお休みの一覧の2か所に出る
  expect(screen.getAllByText("たろう")).toHaveLength(2);
});

test("保存に失敗したら、理由を出す", async () => {
  mockSetQuestRestDays.mockRejectedValueOnce({ message: "さかのぼれるのは7日前まで、先は365日後までです" });
  await render(<RestDaysScreen />);

  await fireEvent.press(screen.getByTestId("rest-day-2026-05-23"));
  await fireEvent.press(screen.getByRole("button", { name: "お休みにする" }));

  await waitFor(() => expect(screen.getByRole("alert")).toBeTruthy());
  expect(mockReload).not.toHaveBeenCalled();
});

test("プレビュー中は設定できない", async () => {
  mockState.isLive = false;
  await render(<RestDaysScreen />);

  await fireEvent.press(screen.getByTestId("rest-day-2026-05-23"));
  expect(screen.getByRole("button", { name: "お休みにする" }).props.accessibilityState).toMatchObject({ disabled: true });
});

test("選び直したあとに子供の一覧が変わったら、いなくなった子供は保存に渡さない", async () => {
  const { rerender } = await render(<RestDaysScreen />);

  // はなこを外してから、もう一度選ぶ（選んだ子供が固定される）
  await fireEvent.press(screen.getByRole("checkbox", { name: "はなこ" }));
  await fireEvent.press(screen.getByRole("checkbox", { name: "はなこ" }));

  // 取り直したら、はなこが家族からいなくなっていた
  mockMembers = mockMembers.filter((member) => member.id !== "child-b");
  await rerender(<RestDaysScreen />);

  await fireEvent.press(screen.getByTestId("rest-day-2026-05-23"));
  await fireEvent.press(screen.getByRole("button", { name: "お休みにする" }));

  await waitFor(() => expect(mockSetQuestRestDays).toHaveBeenCalledWith(["child-a"], ["2026-05-23"], true));
});

test("選んだまま日付が変わり範囲を出た日は外し、範囲内の日だけを保存する（PR #420 のレビュー）", async () => {
  const { rerender } = await render(<RestDaysScreen />);

  // 7日前（ぎりぎり選べる日）と、先の日を選ぶ
  await fireEvent.press(screen.getByTestId("rest-day-2026-05-13"));
  await fireEvent.press(screen.getByTestId("rest-day-2026-05-23"));

  // 日本時間の0時をまたぎ、5/13は8日前になった
  mockState = { ...mockState, today: "2026-05-21" };
  await rerender(<RestDaysScreen />);

  await waitFor(() =>
    expect(screen.getByText("日付が変わったので、えらべる範囲を過ぎた日を外しました")).toBeTruthy(),
  );
  expect(screen.getByTestId("rest-day-2026-05-13").props.accessibilityState).toMatchObject({
    disabled: true,
    selected: false,
  });

  await fireEvent.press(screen.getByRole("button", { name: "お休みにする" }));
  await waitFor(() => expect(mockSetQuestRestDays).toHaveBeenCalledWith(["child-a", "child-b"], ["2026-05-23"], true));
});
