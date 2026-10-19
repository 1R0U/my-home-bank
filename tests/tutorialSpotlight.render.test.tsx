import { fireEvent, render, screen } from "@testing-library/react-native";
import { expect, jest, test } from "@jest/globals";
import { Dimensions, StyleSheet } from "react-native";
import TutorialGuide from "../components/tutorial/TutorialGuide";
import { TutorialContext, type TutorialContextValue } from "../components/tutorial/TutorialContext";
import { getFeatureTutorial } from "../lib/tutorialFeatures";

jest.mock("expo-router", () => ({ usePathname: () => "/tasks-adult", router: { push: jest.fn() } }));

/** 計測済みのボタンを使い、実際の暗幕・説明の配置と操作を確認する。 */
function tutorialValue(explanation = false): TutorialContextValue {
  const steps = getFeatureTutorial("parent", "tasks").steps;
  return {
    role: "parent", feature: "tasks", mode: "running", index: 0, total: steps.length,
    step: explanation ? steps.find((step) => step.id === "parent-task-summary") : steps[0],
    storageError: false, home: jest.fn(), start: jest.fn(), stop: jest.fn(), advance: jest.fn(), retrySave: jest.fn(),
    target: { id: "parent-daily", rect: { x: 20, y: 60, width: 100, height: 50 }, activate: jest.fn() },
  };
}

test("操作対象を暗幕から抜き、その下に説明を置き、他の部分のタッチを止める", () => {
  const value = tutorialValue();
  render(<TutorialContext.Provider value={value}><TutorialGuide /></TutorialContext.Provider>);
  const panel = StyleSheet.flatten(screen.getByTestId("tutorial-guide").props.style);
  expect(panel.position).toBe("absolute");
  expect(panel.top).toBe(122);
  expect(StyleSheet.flatten(screen.getByTestId("tutorial-shade-0", { includeHiddenElements: true }).props.style).height).toBe(60);
  expect(screen.getByTestId("tutorial-shade-1", { includeHiddenElements: true }).props.onStartShouldSetResponder()).toBe(true);
  expect(screen.getByTestId("tutorial-shade-2", { includeHiddenElements: true }).props.onMoveShouldSetResponder()).toBe(true);
  fireEvent.press(screen.getByText("対象のボタンを押す"));
  expect(value.target.activate).toHaveBeenCalledTimes(1);
});

test("対象を示さない説明は全体を暗くして画面中央に置く", () => {
  render(<TutorialContext.Provider value={tutorialValue(true)}><TutorialGuide /></TutorialContext.Provider>);
  expect(screen.queryByTestId("tutorial-shade-1", { includeHiddenElements: true })).toBeNull();
  const panel = StyleSheet.flatten(screen.getByTestId("tutorial-guide").props.style);
  const height = Dimensions.get("window").height;
  expect(panel.top).toBeGreaterThan(100);
  expect(panel.top).toBeLessThan(height - 260);
  expect(screen.getByText("次へ")).toBeTruthy();
});
