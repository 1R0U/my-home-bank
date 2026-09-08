import { fireEvent, render, screen, waitFor } from "@testing-library/react-native";
import { expect, jest, test } from "@jest/globals";
import type { StoreItemRequest } from "../types";

const mockApprove = jest.fn<(...args: unknown[]) => Promise<void>>(() => Promise.resolve());
const mockReject = jest.fn<(...args: unknown[]) => Promise<void>>(() => Promise.resolve());
jest.mock("../lib/storeItemRequestService", () => ({
  approveStoreItemRequest: (...args: unknown[]) => mockApprove(...args),
  rejectStoreItemRequest: (...args: unknown[]) => mockReject(...args),
}));

import StoreItemRequestDetail from "../components/store/StoreItemRequestDetail";

const request: StoreItemRequest = {
  id: "req-1",
  requested_by: "user-child-1",
  title: "夕飯リクエスト権2",
  description: "夕飯を2回リクエストできる",
  reason: "お手伝いを頑張ったから",
  image_url: "file:///tmp/photo.jpg",
  status: "pending",
  created_at: "2026-09-04T00:00:00Z",
  approved_by: null,
  approved_at: null,
};

function renderDetail() {
  render(
    <StoreItemRequestDetail
      approverId="user-parent-1"
      isLive
      onActionComplete={jest.fn()}
      onClose={jest.fn()}
      request={request}
      requesterName="子供"
    />,
  );
  return screen.getByLabelText("ポイント数");
}

test.each([
  ["", false],
  ["0", false],
  ["-1", false],
  ["1.5", false],
  ["1", true],
  ["100", true],
])("ポイント数「%s」のとき許可ボタンの有効状態は%s", async (value, expected) => {
  const priceInput = renderDetail();

  fireEvent.changeText(priceInput, value);

  await waitFor(() => {
    expect(screen.getByRole("button", { name: "許可" }).props.accessibilityState.disabled).toBe(!expected);
  });
});

test("不正なポイント数のまま許可ボタンを押しても承認RPCは呼ばれない", async () => {
  const priceInput = renderDetail();

  fireEvent.changeText(priceInput, "0");
  fireEvent.press(screen.getByRole("button", { name: "許可" }));

  await waitFor(() => {});
  expect(mockApprove).not.toHaveBeenCalled();
});

test("有効なポイント数で許可ボタンを押すと承認RPCが呼ばれる", async () => {
  const priceInput = renderDetail();

  fireEvent.changeText(priceInput, "100");
  fireEvent.press(screen.getByRole("button", { name: "許可" }));

  await waitFor(() => expect(mockApprove).toHaveBeenCalledTimes(1));
  expect(mockApprove).toHaveBeenCalledWith("req-1", "user-parent-1", 100);
});
