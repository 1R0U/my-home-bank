import { fireEvent, render, screen } from "@testing-library/react-native";
import { expect, jest, test } from "@jest/globals";
import DecorationMode from "../components/rpg-hub-web/DecorationMode";

test("未配置の所有がなくても、しまう操作を使える", () => {
  const onPlace = jest.fn(), onRemove = jest.fn();
  const props = {
    assetIds: ["decoration-tree"], selectedAssetId: "decoration-tree", availableCount: 0,
    placedCount: 1, placing: false, message: null, nearbyPlacedId: "placed-tree",
    onPlace, onRemove, onExit: jest.fn(), onSelect: jest.fn(),
  };
  const { rerender } = render(<DecorationMode {...props} />);
  expect(screen.getByLabelText("ここにおく").props.accessibilityState.disabled).toBe(true);
  fireEvent.press(screen.getByLabelText("ここにおく"));
  expect(onPlace).not.toHaveBeenCalled();
  fireEvent.press(screen.getByLabelText("ちかくのかざりをしまう"));
  expect(onRemove).toHaveBeenCalledTimes(1);
  rerender(<DecorationMode {...props} placedCount={0} availableCount={1} nearbyPlacedId={null} />);
  expect(screen.getByText("あと 1 こ おけるよ")).toBeTruthy();
  fireEvent.press(screen.getByLabelText("ここにおく"));
  expect(onPlace).toHaveBeenCalledTimes(1);
});

test("持っている装飾がなければストアの棚を案内し、配置できない", () => {
  render(<DecorationMode assetIds={[]} selectedAssetId="" availableCount={0} placedCount={0}
    placing={false} message={null} nearbyPlacedId={null} onPlace={jest.fn()} onRemove={jest.fn()}
    onExit={jest.fn()} onSelect={jest.fn()} />);
  expect(screen.getByText("ストアの「かざり」の棚で買うと使えるよ")).toBeTruthy();
  expect(screen.getByLabelText("ここにおく").props.accessibilityState.disabled).toBe(true);
});
