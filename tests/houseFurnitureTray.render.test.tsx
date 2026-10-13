// もようがえの一覧から持ち上げた家具（Issue #425）の出し方のテスト。
// 指の動きそのものは実機で確かめる。ここでは、どの場合に指に重ねた家具を出すかを確かめる。
import { render, screen } from "@testing-library/react-native";
import { expect, test } from "@jest/globals";
import { Animated } from "react-native";
import { DraggedFurniture } from "../components/HouseFurnitureTray";

const position = new Animated.ValueXY();

test("部屋の外では、持ち上げた家具を指に重ねて出す", () => {
  render(<DraggedFurniture dragging={{ canPlace: true, kind: "sofa", overRoom: false }} position={position} />);
  expect(screen.getByTestId("dragged-furniture")).toBeTruthy();
  expect(screen.queryByText("おけないよ")).toBeNull();
});

test("部屋の上で置ける所があれば、部屋の中の半透明の家具だけにして、指に重ねた家具は消す", () => {
  render(<DraggedFurniture dragging={{ canPlace: true, kind: "sofa", overRoom: true }} position={position} />);
  expect(screen.queryByTestId("dragged-furniture")).toBeNull();
});

test("部屋の上でも置ける所が無ければ、指に重ねた家具を出したまま「おけないよ」と出す（1R0Uレビュー指摘）", () => {
  render(<DraggedFurniture dragging={{ canPlace: false, kind: "sofa", overRoom: true }} position={position} />);
  expect(screen.getByTestId("dragged-furniture")).toBeTruthy();
  expect(screen.getByText("おけないよ")).toBeTruthy();
});

test("持ち上げていなければ何も出さない", () => {
  render(<DraggedFurniture dragging={null} position={position} />);
  expect(screen.queryByTestId("dragged-furniture")).toBeNull();
});

test("家具の絵が届いていれば絵を、届いていなければ絵文字を出す", () => {
  const dragging = { canPlace: true, kind: "bed" as const, overRoom: false };
  const { rerender } = render(<DraggedFurniture dragging={dragging} position={position} />);
  expect(screen.getByText("🛏️")).toBeTruthy();
  rerender(<DraggedFurniture dragging={dragging} position={position} thumbnail="data:image/png;base64,AAAA" />);
  expect(screen.getByTestId("furniture-thumbnail").props.source).toEqual({ uri: "data:image/png;base64,AAAA" });
});
