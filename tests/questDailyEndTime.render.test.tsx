import { fireEvent, render, screen, within } from "@testing-library/react-native";
import { expect, jest, test } from "@jest/globals";
import QuestDailyEndTimeField from "../components/tasks/QuestDailyEndTimeField";

const open = () => fireEvent.press(screen.getByRole("button", { name: "デイリーの終了時刻" }));

test.each(["00:00", "05:15", "05:30", "23:45"])("保存済みの%sを選択状態にして開き、そのまま確定できる", async (value) => {
  const onChange = jest.fn();
  await render(<QuestDailyEndTimeField value={value} onChange={onChange} disabled={false} />);
  await open();
  const [hour, minute] = value.split(":").map(Number);
  expect(screen.getByRole("button", { name: `${hour}時` }).props.accessibilityState.selected).toBe(true);
  expect(screen.getByRole("button", { name: `${minute}分` }).props.accessibilityState.selected).toBe(true);
  expect(screen.queryByRole("button", { name: "24時" })).toBeNull();
  expect(screen.queryByRole("button", { name: "60分" })).toBeNull();
  expect(within(screen.getByLabelText("終了時刻の分")).getAllByRole("button")
    .map((option) => option.props.accessibilityLabel)).toEqual(["0分", "15分", "30分", "45分"]);
  await fireEvent.press(screen.getByRole("button", { name: "この時刻にする" }));
  expect(onChange).toHaveBeenCalledWith(value);
  expect(screen.queryByText("終了時刻を選択")).toBeNull();
});

test.each(["キャンセル", "戻る"])("確定前の変更を%sで破棄し、開き直すと保存済みの時刻に戻る", async (action) => {
  const onChange = jest.fn();
  await render(<QuestDailyEndTimeField value="00:00" onChange={onChange} disabled={false} />);
  await open();
  await fireEvent.press(screen.getByRole("button", { name: "1時" }));
  await fireEvent.press(screen.getByRole("button", { name: "15分" }));
  expect(onChange).not.toHaveBeenCalled();
  if (action === "キャンセル") await fireEvent.press(screen.getByRole("button", { name: "キャンセル" }));
  else await fireEvent(screen.getByTestId("daily-end-time-picker"), "requestClose");
  expect(screen.queryByText("終了時刻を選択")).toBeNull();
  await open();
  await fireEvent.press(screen.getByRole("button", { name: "この時刻にする" }));
  expect(onChange).toHaveBeenCalledWith("00:00");
});

test("保存中は選択を閉じ、再び有効になるまで開けない", async () => {
  const onChange = jest.fn();
  const { rerender } = await render(<QuestDailyEndTimeField value="00:00" onChange={onChange} disabled={false} />);
  await open();
  await fireEvent.press(screen.getByRole("button", { name: "2時" }));
  await rerender(<QuestDailyEndTimeField value="00:00" onChange={onChange} disabled />);
  expect(screen.queryByText("終了時刻を選択")).toBeNull();
  await open();
  expect(screen.queryByText("終了時刻を選択")).toBeNull();
  expect(onChange).not.toHaveBeenCalled();
  await rerender(<QuestDailyEndTimeField value="00:00" onChange={onChange} disabled={false} />);
  expect(screen.queryByText("終了時刻を選択")).toBeNull();
  await open();
  expect(screen.getByRole("button", { name: "0時" }).props.accessibilityState.selected).toBe(true);
});

test("不正な値は選択を促し、選び直すと正しい時刻を渡す", async () => {
  const onChange = jest.fn();
  await render(<QuestDailyEndTimeField value="24:00" onChange={onChange} disabled={false} />);
  expect(screen.getByText("終了時刻を選択してください")).toBeTruthy();
  await open();
  await fireEvent.press(screen.getByRole("button", { name: "3時" }));
  await fireEvent.press(screen.getByRole("button", { name: "15分" }));
  await fireEvent.press(screen.getByRole("button", { name: "この時刻にする" }));
  expect(onChange).toHaveBeenCalledWith("03:15");
});

test("既存の端数は直前の15分を候補にし、確定するまで元の時刻を変更しない", async () => {
  const onChange = jest.fn();
  await render(<QuestDailyEndTimeField value="23:59" onChange={onChange} disabled={false} />);
  await open();
  expect(screen.getByRole("button", { name: "45分" }).props.accessibilityState.selected).toBe(true);
  await fireEvent.press(screen.getByRole("button", { name: "キャンセル" }));
  expect(onChange).not.toHaveBeenCalled();
  expect(screen.getByLabelText("デイリーの終了時刻").props.accessibilityValue.text).toBe("23:59");
  await open();
  await fireEvent.press(screen.getByRole("button", { name: "この時刻にする" }));
  expect(onChange).toHaveBeenCalledWith("23:45");
});
