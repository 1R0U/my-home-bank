import { fireEvent, render, screen } from "@testing-library/react-native";
import { beforeEach, expect, jest, test } from "@jest/globals";
import { router } from "expo-router";

jest.mock("@expo/vector-icons", () => ({ Ionicons: () => null }));

jest.mock("expo-router", () => ({
  Stack: { Screen: () => null },
  router: { back: jest.fn(), push: jest.fn() },
}));

let mockCanUseRealData = true;
jest.mock("../store", () => ({
  useDataAccess: () => ({ canUseRealData: mockCanUseRealData }),
}));

const mockSelectCharacterType = jest.fn();
jest.mock("../lib/useCharacterAppearance", () => ({
  useCharacterAppearance: () => ({ select: mockSelectCharacterType }),
}));

import CharacterSelectScreen from "../components/CharacterSelectScreen";
import { useAppearanceStore } from "../store/appearanceStore";

beforeEach(() => {
  jest.clearAllMocks();
  mockCanUseRealData = true;
  useAppearanceStore.setState({ characterType: "frog", palette: {} });
});

test.each([true, false])(
  "色の案内から更衣室へ進め、キャラクターの種類は保存しない（実データ利用: %s）",
  (canUseRealData) => {
    mockCanUseRealData = canUseRealData;
    render(<CharacterSelectScreen />);

    fireEvent.press(screen.getByRole("link", { name: "きがえ（更衣室）で色を選ぶ" }));

    expect(router.push).toHaveBeenCalledTimes(1);
    expect(router.push).toHaveBeenCalledWith("/wardrobe");
    expect(mockSelectCharacterType).not.toHaveBeenCalled();
    expect(useAppearanceStore.getState().characterType).toBe("frog");
  },
);
