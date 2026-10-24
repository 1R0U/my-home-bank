import { beforeEach, expect, jest, test } from "@jest/globals";
import { Pressable, Text } from "react-native";
import { router, Stack } from "expo-router";
import { act, fireEvent, renderRouter, screen, waitFor } from "expo-router/testing-library";
import AdultTabsLayout from "../app/(adult)/_layout";
import { ADULT_NAV_ITEMS } from "../constants/adultNav";
import { useAppStore } from "../store";

jest.mock("@expo/vector-icons", () => ({ Ionicons: () => null }));

function Tab() {
  return <Pressable onPress={() => router.push("/settings-adult")}><Text>設定を開く</Text></Pressable>;
}

function Settings() {
  return <Pressable onPress={() => router.back()}><Text>設定から戻る</Text></Pressable>;
}

/** 本物の大人用タブを描き、設定（Issue #320）はアプリと同じくルート直下の Stack 画面にする。 */
async function renderAdultRoutes(initialUrl: string) {
  const tabRoutes = Object.fromEntries(ADULT_NAV_ITEMS.map(({ name }) => [`(adult)/${name}`, Tab]));
  return renderRouter({
    _layout: () => <Stack id={undefined} screenOptions={{ headerShown: false, animation: "none" }} />,
    "(adult)/_layout": AdultTabsLayout,
    ...tabRoutes,
    "settings-adult": Settings,
  }, { initialUrl });
}

beforeEach(() => {
  useAppStore.setState({ user: { id: "settings-back-test", role: "parent", name: "テスト", balance: 0, created_at: "2026-10-24T00:00:00Z" } });
});

test("タブバーには5つのタブだけを描く（設定の枠を残さない。Issue #498）", async () => {
  await renderAdultRoutes("/main-adult");

  // iOSのタブの読み上げ名は、タブバーに並ぶルートの数を含む。隠しタブがあると「of 6」になる
  ADULT_NAV_ITEMS.forEach(({ label }, index) => {
    expect(screen.getByRole("button", { name: `${label}, tab, ${index + 1} of ${ADULT_NAV_ITEMS.length}` })).toBeTruthy();
  });
});

test.each(["/main-adult", "/tasks-adult", "/history-adult"])("%s から開いた設定を戻ると、開いたタブへ戻る（Issue #498）", async (tabPath) => {
  const view = await renderAdultRoutes(tabPath);

  await fireEvent.press(screen.getByText("設定を開く"));
  await waitFor(() => expect(view.getPathname()).toBe("/settings-adult"));
  // 設定はタブではなく Stack に積むので、タブバーは隠れる
  expect(screen.queryByRole("button", { name: /, tab, / })).toBeNull();

  await fireEvent.press(screen.getByText("設定から戻る"));
  await waitFor(() => expect(view.getPathname()).toBe(tabPath));
  await act(async () => undefined);
});
