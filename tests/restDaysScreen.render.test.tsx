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
  children: { id: string; name: string }[];
  restDays: { user_id: string; rest_on: string }[];
  today: string;
  loading: boolean;
  error: string | null;
  isLive: boolean;
};
jest.mock("../lib/useQuestRestDays", () => ({
  useQuestRestDays: () => ({ ...mockState, reload: mockReload }),
}));

const mockSetQuestRestDays = jest.fn<(...args: unknown[]) => Promise<number>>(() => Promise.resolve(2));
jest.mock("../lib/questRestDayService", () => ({
  setQuestRestDays: (...args: unknown[]) => mockSetQuestRestDays(...args),
}));

import RestDaysScreen from "../components/RestDaysScreen";

beforeEach(() => {
  jest.clearAllMocks();
  mockState = {
    children: [
      { id: "child-a", name: "たろう" },
      { id: "child-b", name: "はなこ" },
    ],
    error: null,
    isLive: true,
    loading: false,
    restDays: [{ rest_on: "2026-05-22", user_id: "child-a" }],
    today: "2026-05-20",
  };
});

test("最初は子供全員を選んでいて、選んだ日をまとめてお休みにできる", async () => {
  render(<RestDaysScreen />);

  expect(screen.getByRole("checkbox", { name: "たろう" }).props.accessibilityState).toMatchObject({ checked: true });
  expect(screen.getByRole("checkbox", { name: "はなこ" }).props.accessibilityState).toMatchObject({ checked: true });

  fireEvent.press(screen.getByTestId("rest-day-2026-05-23"));
  fireEvent.press(screen.getByTestId("rest-day-2026-05-24"));
  fireEvent.press(screen.getByRole("button", { name: "お休みにする" }));

  await waitFor(() => expect(mockSetQuestRestDays).toHaveBeenCalledTimes(1));
  expect(mockSetQuestRestDays).toHaveBeenCalledWith(["child-a", "child-b"], ["2026-05-23", "2026-05-24"], true);
  await waitFor(() => expect(screen.getByText("お休みの日にしました")).toBeTruthy());
  expect(mockReload).toHaveBeenCalledTimes(1);
});

test("1人だけ選んで、その子のお休みをやめられる", async () => {
  render(<RestDaysScreen />);

  fireEvent.press(screen.getByRole("checkbox", { name: "はなこ" }));
  fireEvent.press(screen.getByTestId("rest-day-2026-05-22"));

  // たろうは5/22がお休みなので「お休みにする」は押せず、「やめる」だけ押せる
  expect(screen.getByRole("button", { name: "お休みにする" }).props.accessibilityState).toMatchObject({ disabled: true });
  fireEvent.press(screen.getByRole("button", { name: "お休みをやめる" }));

  await waitFor(() => expect(mockSetQuestRestDays).toHaveBeenCalledWith(["child-a"], ["2026-05-22"], false));
});

test("1週間より前の日は選べない", () => {
  render(<RestDaysScreen />);

  expect(screen.getByTestId("rest-day-2026-05-12").props.accessibilityState).toMatchObject({ disabled: true });
  expect(screen.getByTestId("rest-day-2026-05-13").props.accessibilityState).toMatchObject({ disabled: false });
});

test("お休みの日は、何人お休みかと一覧に出す", () => {
  render(<RestDaysScreen />);

  expect(screen.getByRole("button", { name: "5月22日（金）、1人お休み" })).toBeTruthy();
  // 子供を選ぶボタンと、これからのお休みの一覧の2か所に出る
  expect(screen.getAllByText("たろう")).toHaveLength(2);
});

test("保存に失敗したら、理由を出す", async () => {
  mockSetQuestRestDays.mockRejectedValueOnce({ message: "さかのぼれるのは7日前まで、先は365日後までです" });
  render(<RestDaysScreen />);

  fireEvent.press(screen.getByTestId("rest-day-2026-05-23"));
  fireEvent.press(screen.getByRole("button", { name: "お休みにする" }));

  await waitFor(() => expect(screen.getByRole("alert")).toBeTruthy());
  expect(mockReload).not.toHaveBeenCalled();
});

test("プレビュー中は設定できない", () => {
  mockState.isLive = false;
  render(<RestDaysScreen />);

  fireEvent.press(screen.getByTestId("rest-day-2026-05-23"));
  expect(screen.getByRole("button", { name: "お休みにする" }).props.accessibilityState).toMatchObject({ disabled: true });
});

test("選び直したあとに子供の一覧が変わったら、いなくなった子供は保存に渡さない", async () => {
  const { rerender } = render(<RestDaysScreen />);

  // はなこを外してから、もう一度選ぶ（選んだ子供が固定される）
  fireEvent.press(screen.getByRole("checkbox", { name: "はなこ" }));
  fireEvent.press(screen.getByRole("checkbox", { name: "はなこ" }));

  // 取り直したら、はなこが家族からいなくなっていた
  mockState = { ...mockState, children: [{ id: "child-a", name: "たろう" }] };
  rerender(<RestDaysScreen />);

  fireEvent.press(screen.getByTestId("rest-day-2026-05-23"));
  fireEvent.press(screen.getByRole("button", { name: "お休みにする" }));

  await waitFor(() => expect(mockSetQuestRestDays).toHaveBeenCalledWith(["child-a"], ["2026-05-23"], true));
});
