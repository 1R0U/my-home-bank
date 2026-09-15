import { fireEvent, render, screen } from "@testing-library/react-native";
import { beforeEach, expect, jest, test } from "@jest/globals";
import { router } from "expo-router";
import ScreenHeader from "../components/ScreenHeader";

jest.mock("expo-router", () => ({
  router: { back: jest.fn(), canGoBack: jest.fn(), replace: jest.fn() },
}));

beforeEach(() => {
  jest.clearAllMocks();
});

test("戻る履歴がある場合はrouter.back()で戻る", () => {
  (router.canGoBack as jest.Mock).mockReturnValue(true);
  render(<ScreenHeader fallbackHref="/main-adult" title="設定" />);

  fireEvent.press(screen.getByLabelText("前の画面に戻る"));

  expect(router.back).toHaveBeenCalledTimes(1);
  expect(router.replace).not.toHaveBeenCalled();
});

test("戻る履歴が無くfallbackHrefがある場合はそちらへ置き換え遷移する", () => {
  (router.canGoBack as jest.Mock).mockReturnValue(false);
  render(<ScreenHeader fallbackHref="/main-adult" title="設定" />);

  fireEvent.press(screen.getByLabelText("前の画面に戻る"));

  expect(router.back).not.toHaveBeenCalled();
  expect(router.replace).toHaveBeenCalledWith("/main-adult");
});

test("戻る履歴が無くfallbackHrefも無い場合は何もしない", () => {
  (router.canGoBack as jest.Mock).mockReturnValue(false);
  render(<ScreenHeader title="設定" />);

  fireEvent.press(screen.getByLabelText("前の画面に戻る"));

  expect(router.back).not.toHaveBeenCalled();
  expect(router.replace).not.toHaveBeenCalled();
});
