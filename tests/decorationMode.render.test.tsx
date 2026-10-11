import { fireEvent, render, screen } from "@testing-library/react-native";
import { useState } from "react";
import { beforeEach, describe, expect, jest, test } from "@jest/globals";
import DecorationMode from "../components/rpg-hub-web/DecorationMode";

const ASSET_IDS = [
  "decoration-bush",
  "decoration-bush-berry",
  "decoration-lamp",
  "decoration-tree",
  "decoration-tree-pine",
];

const mockSelect = jest.fn<(assetId: string) => void>();

/** 選んだものを覚えておく親の代わり。画面（RpgHubScreen）と同じく選択は親が持つ。 */
function Harness({ initial = "decoration-bush" }: { initial?: string }) {
  const [selected, setSelected] = useState(initial);
  return (
    <DecorationMode
      assetIds={ASSET_IDS}
      message={null}
      nearbyPlacedId={null}
      onExit={() => undefined}
      onPlace={() => undefined}
      onRemove={() => undefined}
      onSelect={(assetId) => {
        mockSelect(assetId);
        setSelected(assetId);
      }}
      placedCount={0}
      placing={false}
      selectedAssetId={selected}
    />
  );
}

const button = (name: string) => screen.getByRole("button", { name });
const isSelected = (name: string) => button(name).props.accessibilityState?.selected;

beforeEach(() => {
  mockSelect.mockClear();
});

describe("かざるメニューの2段の選び方", () => {
  test("1段目には種類だけを出し、中身は出さない", () => {
    render(<Harness />);

    expect(button("しげみを ひらく")).toBeTruthy();
    expect(button("きを ひらく")).toBeTruthy();
    expect(screen.queryByRole("button", { name: "きのみのしげみをえらぶ" })).toBeNull();
  });

  test("1つしかない種類は、開かずにそのまま選ぶ", () => {
    render(<Harness />);

    fireEvent.press(button("ランプをえらぶ"));

    expect(mockSelect).toHaveBeenLastCalledWith("decoration-lamp");
    expect(screen.queryByRole("button", { name: "しゅるいの いちらんに もどる" })).toBeNull();
  });

  test("種類を開くと中身が並び、選んだものが選ばれた状態になる", () => {
    render(<Harness />);

    fireEvent.press(button("しげみを ひらく"));
    fireEvent.press(button("きのみのしげみをえらぶ"));

    expect(mockSelect).toHaveBeenLastCalledWith("decoration-bush-berry");
    expect(isSelected("きのみのしげみをえらぶ")).toBe(true);
    expect(isSelected("しげみをえらぶ")).toBe(false);
  });

  test("選んでいない種類を開くと、その最初の1つを選ぶ", () => {
    // 開いただけで選び直さないと、「ここに おく」で前の種類のものが置かれてしまう
    render(<Harness />);

    fireEvent.press(button("きを ひらく"));

    expect(mockSelect).toHaveBeenLastCalledWith("decoration-tree");
  });

  test("選んでいるものが入った種類を開いても、選び直さない", () => {
    render(<Harness initial="decoration-tree-pine" />);

    fireEvent.press(button("きを ひらく"));

    expect(mockSelect).not.toHaveBeenCalled();
    expect(isSelected("とがったきをえらぶ")).toBe(true);
  });

  test("もどるで1段目に戻り、選んだものは残る", () => {
    render(<Harness />);

    fireEvent.press(button("きを ひらく"));
    fireEvent.press(button("とがったきをえらぶ"));
    fireEvent.press(button("しゅるいの いちらんに もどる"));

    expect(button("きを ひらく")).toBeTruthy();
    expect(isSelected("きを ひらく")).toBe(true);
    expect(isSelected("しげみを ひらく")).toBe(false);
  });
});
