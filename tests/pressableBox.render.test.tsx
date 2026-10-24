import { expect, jest, test } from "@jest/globals";
import { type ComponentRef, createRef } from "react";
import { Pressable, StyleSheet, Text } from "react-native";
import { fireEvent, render, screen } from "@testing-library/react-native";
import PressableBox from "../components/PressableBox";

const BASE = { backgroundColor: "red", padding: 10 };
const PRESSED = { opacity: 0.5 };

async function renderBox(props: Partial<Parameters<typeof PressableBox>[0]> = {}) {
  await render(
    <PressableBox accessibilityRole="button" pressedStyle={PRESSED} style={BASE} {...props}>
      <Text>ボタン</Text>
    </PressableBox>,
  );
  return screen.getByRole("button");
}

test("押している間だけ pressedStyle を style の後ろに足し、離すと外す（Issue #502）", async () => {
  const button = await renderBox();
  expect(StyleSheet.flatten(button.props.style)).toEqual(BASE);

  await fireEvent(button, "pressIn");
  expect(StyleSheet.flatten(button.props.style)).toEqual({ ...BASE, ...PRESSED });

  await fireEvent(button, "pressOut");
  expect(StyleSheet.flatten(button.props.style)).toEqual(BASE);
});

test("渡した onPressIn / onPressOut も呼ぶ", async () => {
  const onPressIn = jest.fn();
  const onPressOut = jest.fn();
  const button = await renderBox({ onPressIn, onPressOut });

  await fireEvent(button, "pressIn");
  expect(onPressIn).toHaveBeenCalledTimes(1);
  await fireEvent(button, "pressOut");
  expect(onPressOut).toHaveBeenCalledTimes(1);
});

test("ref を中の Pressable へ渡す", async () => {
  const ref = createRef<ComponentRef<typeof Pressable>>();
  await renderBox({ ref });
  expect(ref.current).not.toBeNull();
});
