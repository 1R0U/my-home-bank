import { act, render, screen } from "@testing-library/react-native";
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

test("子供には漢字の上にふりがなを出し、読み上げは記法を除いた文言にする", async () => {
  setRole("child");
  await render(<Furigana testID="label">{"{積立|つみたて}の{日|ひ}"}</Furigana>);

  expect(screen.getByText("つみたて")).toBeTruthy();
  expect(screen.getByText("積立")).toBeTruthy();
  expect(screen.getByText("ひ")).toBeTruthy();
  expect(screen.getByTestId("label").props.accessibilityLabel).toBe("積立の日");
  expect(screen.getByLabelText("積立の日")).toBeTruthy();
});

test("ログイン前（ロール未確定）も子供と同じようにふりがなを出す", async () => {
  await render(<Furigana>{"{家|いえ}"}</Furigana>);

  expect(screen.getByText("いえ")).toBeTruthy();
});

test("大人にはふりがなを出さず、普通の文字として表示する", async () => {
  setRole("parent");
  await render(<Furigana>{"{積立|つみたて}の{日|ひ}"}</Furigana>);

  expect(screen.getByText("積立の日")).toBeTruthy();
  expect(screen.queryByText("つみたて")).toBeNull();
});

test("ふりがなの無い文言は、折り返しを自前で行わず1つの Text で表示する", async () => {
  setRole("child");
  await render(<Furigana>{"ひらがな だけ"}</Furigana>);

  expect(screen.getByText("ひらがな だけ")).toBeTruthy();
});

test("文字の見た目は本文へ、余白は外側の箱へ振り分け、ふりがなは本文の半分の大きさにする", async () => {
  setRole("child");
  await render(
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

test("noWrap を付けると折り返さない（ボタンの「入る」が2行に分かれないように）", async () => {
  setRole("child");
  await render(<Furigana noWrap testID="label">{"{入|はい}る"}</Furigana>);

  expect(screen.getByTestId("label").props.style).toEqual(expect.arrayContaining([{ flexWrap: "nowrap" }]));
});

/** 測った幅を、onLayout と同じ形で渡す */
async function layout(element: { props: { onLayout?: (event: unknown) => void } }, width: number) {
  await act(() => element.props.onLayout?.({ nativeEvent: { layout: { height: 20, width, x: 0, y: 0 } } }));
}

test("numberOfLines を付けると、幅に収まる間はふりがな付きのまま1行で出す", async () => {
  setRole("child");
  await render(
    <Furigana ellipsizeMode="tail" numberOfLines={1} testID="label">
      {"お{手伝|てつだ}い{報告|ほうこく}"}
    </Furigana>,
  );

  const box = screen.getByTestId("label");
  await layout(box, 200);
  await layout(box.children[0] as never, 120);

  expect(screen.getByText("てつだ")).toBeTruthy();
});

test("numberOfLines を付けると、幅に収まらないときはふりがなの無い文字にして末尾を省略する", async () => {
  setRole("child");
  await render(
    <Furigana ellipsizeMode="tail" numberOfLines={1} testID="label">
      {"お{手伝|てつだ}い{報告|ほうこく}"}
    </Furigana>,
  );

  const box = screen.getByTestId("label");
  await layout(box, 100);
  await layout(box.children[0] as never, 120);

  const text = screen.getByText("お手伝い報告");
  expect(text.props.numberOfLines).toBe(1);
  expect(text.props.ellipsizeMode).toBe("tail");
  expect(screen.queryByText("てつだ")).toBeNull();
});

test("ふりがなの無い文字に切り替えた後、幅が広がったらふりがな付きに戻す", async () => {
  setRole("child");
  await render(
    <Furigana ellipsizeMode="tail" numberOfLines={1} testID="label">
      {"お{手伝|てつだ}い{報告|ほうこく}"}
    </Furigana>,
  );

  const box = screen.getByTestId("label");
  await layout(box, 100);
  await layout(box.children[0] as never, 120);

  // 画面の回転などで幅が広がっても、ふりがな付きで並べた幅に届かない間は切り替えたまま
  await layout(screen.getByText("お手伝い報告"), 110);
  expect(screen.queryByText("てつだ")).toBeNull();

  await layout(screen.getByText("お手伝い報告"), 130);
  expect(screen.getByText("てつだ")).toBeTruthy();
});

test("文言が変わったら、前の文言の幅を使わずに測り直す", async () => {
  setRole("child");
  const { rerender } = await render(
    <Furigana ellipsizeMode="tail" numberOfLines={1} testID="label">
      {"お{手伝|てつだ}い{報告|ほうこく}"}
    </Furigana>,
  );
  const box = screen.getByTestId("label");
  await layout(box, 200);
  await layout(box.children[0] as never, 120);

  await rerender(
    <Furigana ellipsizeMode="tail" numberOfLines={1} testID="label">
      {"{商品|しょうひん}"}
    </Furigana>,
  );
  // 外側の箱の幅が中身より先に届いても、前の文言の幅（120）で「はみ出し」と判定しない
  await layout(screen.getByTestId("label"), 100);
  expect(screen.getByText("しょうひん")).toBeTruthy();

  await layout(screen.getByTestId("label").children[0] as never, 40);
  expect(screen.getByText("しょうひん")).toBeTruthy();
});
