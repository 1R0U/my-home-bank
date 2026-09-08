import { fireEvent, render, screen } from "@testing-library/react-native";
import { beforeEach, expect, jest, test } from "@jest/globals";

const mockPush = jest.fn();

jest.mock("expo-router", () => ({
  useFocusEffect: jest.fn(),
  useRouter: () => ({ push: mockPush }),
}));

jest.mock("../components/rpg-hub/RpgHubScene", () => ({
  RpgHubScene: () => null,
}));

jest.mock("../components/rpg-hub/VirtualPad", () => ({
  VirtualPad: ({ children }: { children: React.ReactNode }) => children,
}));

import ChildHomeScreen from "../components/ChildHomeScreen";
import { usePlayerStore } from "../store/playerStore";

beforeEach(() => {
  jest.clearAllMocks();
  mockPush.mockImplementation(() => undefined);
  usePlayerStore.setState({ nearbyBuildingId: null });
});

test("設定ボタンから設定画面へ1回だけ遷移する", () => {
  render(<ChildHomeScreen />);

  const settingsButton = screen.getByRole("button", { name: "設定を開く" });
  fireEvent.press(settingsButton);
  fireEvent.press(settingsButton);

  expect(mockPush).toHaveBeenCalledTimes(1);
  expect(mockPush).toHaveBeenCalledWith("/settings");
});

test("設定画面への遷移に失敗した場合は再操作できる", () => {
  mockPush.mockImplementationOnce(() => {
    throw new Error("navigation failed");
  });
  const warnSpy = jest.spyOn(console, "warn").mockImplementation(() => undefined);
  render(<ChildHomeScreen />);

  const settingsButton = screen.getByRole("button", { name: "設定を開く" });
  fireEvent.press(settingsButton);
  fireEvent.press(settingsButton);

  expect(mockPush).toHaveBeenCalledTimes(2);
  expect(warnSpy).toHaveBeenCalledWith("設定画面への遷移に失敗しました", expect.any(Error));
  warnSpy.mockRestore();
});

test("建物の近くにいないときは「入る」ボタンを表示しない", () => {
  render(<ChildHomeScreen />);

  expect(screen.queryByRole("button", { name: "入る" })).toBeNull();
});

test("建物の入口に近づくと「入る」ボタンから対応する画面へ遷移する", () => {
  usePlayerStore.setState({ nearbyBuildingId: "bank-building" });
  render(<ChildHomeScreen />);

  fireEvent.press(screen.getByRole("button", { name: "入る" }));

  expect(mockPush).toHaveBeenCalledWith("/bank");
});
