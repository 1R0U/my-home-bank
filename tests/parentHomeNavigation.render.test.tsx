import { fireEvent, render, screen } from "@testing-library/react-native";
import { beforeEach, expect, jest, test } from "@jest/globals";
import { router } from "expo-router";
import ParentHomeScreen from "../components/ParentHomeScreen";
import { useAppStore } from "../store";

jest.mock("expo-router", () => ({
  Stack: { Screen: () => null },
  router: { push: jest.fn() },
  useFocusEffect: (effect: () => void) => require("react").useEffect(effect, [effect]),
}));

const mockFetchQuests = jest.fn<(...args: unknown[]) => Promise<unknown>>();
jest.mock("../lib/taskService", () => ({
  fetchQuests: (...args: unknown[]) => mockFetchQuests(...args),
}));

const mockFetchUserBalance = jest.fn<(...args: unknown[]) => Promise<unknown>>();
const mockFetchUserFamilyId = jest.fn<(...args: unknown[]) => Promise<unknown>>();
jest.mock("../lib/userService", () => ({
  fetchUserBalance: (...args: unknown[]) => mockFetchUserBalance(...args),
  fetchUserFamilyId: (...args: unknown[]) => mockFetchUserFamilyId(...args),
}));

const mockFetchGuildTreasury = jest.fn<(...args: unknown[]) => Promise<unknown>>();
jest.mock("../lib/treasuryService", () => ({
  fetchGuildTreasury: (...args: unknown[]) => mockFetchGuildTreasury(...args),
}));

beforeEach(() => {
  jest.clearAllMocks();
  mockFetchQuests.mockResolvedValue([]);
  mockFetchUserBalance.mockResolvedValue(500);
  mockFetchUserFamilyId.mockResolvedValue(null);
  mockFetchGuildTreasury.mockResolvedValue(null);
  useAppStore.setState({
    user: {
      balance: 500,
      created_at: "2026-07-01T00:00:00Z",
      id: "11111111-1111-1111-1111-111111111111",
      name: "お父さん",
      role: "parent",
    },
  });
});

test("「我が家タウンへ行く」でRPGハブへ遷移する", () => {
  // Issue #246: 大人にはRPGハブへの入口が無かった
  render(<ParentHomeScreen />);

  fireEvent.press(screen.getByLabelText("我が家タウンへ行く"));

  expect(router.push).toHaveBeenCalledWith("/rpg-hub");
});

test("通知ベルを連続で押しても、navKeyが重複せず毎回異なる値になる", () => {
  render(<ParentHomeScreen />);
  const bell = screen.getByLabelText("通知");

  fireEvent.press(bell);
  fireEvent.press(bell);

  expect(router.push).toHaveBeenCalledTimes(2);
  const [firstCall, secondCall] = (router.push as jest.Mock).mock.calls;
  const firstNavKey = (firstCall[0] as { params: { navKey: string } }).params.navKey;
  const secondNavKey = (secondCall[0] as { params: { navKey: string } }).params.navKey;
  expect(firstNavKey).not.toEqual(secondNavKey);
});
