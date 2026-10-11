import { render, screen } from "@testing-library/react-native";
import { beforeEach, expect, test } from "@jest/globals";
import Furigana from "../components/Furigana";
import { useAppStore } from "../store";
import type { User } from "../types";

function setRole(role: User["role"] | null) {
  useAppStore.setState({ user: role ? ({ id: "user-1", role } as User) : null });
}

beforeEach(() => {
  setRole(null);
});

test("子供には漢字の上にふりがなを出し、読み上げは記法を除いた文言にする", () => {
  setRole("child");
  render(<Furigana testID="label">{"{積立|つみたて}の{日|ひ}"}</Furigana>);

  expect(screen.getByText("つみたて")).toBeTruthy();
  expect(screen.getByText("積立")).toBeTruthy();
  expect(screen.getByText("ひ")).toBeTruthy();
  expect(screen.getByTestId("label").props.accessibilityLabel).toBe("積立の日");
  expect(screen.getByLabelText("積立の日")).toBeTruthy();
});

test("ログイン前（ロール未確定）も子供と同じようにふりがなを出す", () => {
  render(<Furigana>{"{家|いえ}"}</Furigana>);

  expect(screen.getByText("いえ")).toBeTruthy();
});

test("大人にはふりがなを出さず、普通の文字として表示する", () => {
  setRole("parent");
  render(<Furigana>{"{積立|つみたて}の{日|ひ}"}</Furigana>);

  expect(screen.getByText("積立の日")).toBeTruthy();
  expect(screen.queryByText("つみたて")).toBeNull();
});

test("ふりがなの無い文言は、折り返しを自前で行わず1つの Text で表示する", () => {
  setRole("child");
  render(<Furigana>{"ひらがな だけ"}</Furigana>);

  expect(screen.getByText("ひらがな だけ")).toBeTruthy();
});

test("文字の見た目は本文へ、余白は外側の箱へ振り分け、ふりがなは本文の半分の大きさにする", () => {
  setRole("child");
  render(
    <Furigana style={{ color: "#402416", fontSize: 20, marginTop: 8, textAlign: "center" }} testID="label">
      {"{家|いえ}"}
    </Furigana>,
  );

  const container = screen.getByTestId("label");
  expect(container.props.style).toEqual(expect.arrayContaining([{ justifyContent: "center" }, { marginTop: 8 }]));

  const base = screen.getByText("家");
  expect(base.props.style).toEqual(expect.arrayContaining([{ color: "#402416", fontSize: 20 }]));

  const ruby = screen.getByText("いえ");
  expect(ruby.props.style).toEqual(expect.arrayContaining([expect.objectContaining({ color: "#402416", fontSize: 10 })]));
});

test("noWrap を付けると折り返さない（ボタンの「入る」が2行に分かれないように）", () => {
  setRole("child");
  render(<Furigana noWrap testID="label">{"{入|はい}る"}</Furigana>);

  expect(screen.getByTestId("label").props.style).toEqual(expect.arrayContaining([{ flexWrap: "nowrap" }]));
});
