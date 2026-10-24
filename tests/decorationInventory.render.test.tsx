import { render, screen } from "@testing-library/react-native";
import { expect, jest, test } from "@jest/globals";
import DecorationMode from "../components/rpg-hub-web/DecorationMode";

const handlers = {
  onDeselect: jest.fn(),
  onDragCancel: jest.fn(),
  onDragEnd: jest.fn(),
  onDragMove: jest.fn(),
  onDragStart: jest.fn(),
  onExit: jest.fn(),
  onRemove: jest.fn(),
  onResetView: jest.fn(),
  onRotate: jest.fn(),
};

test("持っている装飾がなければストアの棚を案内する", async () => {
  await render(
    <DecorationMode
      assetIds={[]}
      availableCounts={{}}
      busy={false}
      message={null}
      placedCount={0}
      selected={null}
      {...handlers}
    />,
  );

  expect(screen.getByText("ストアの「かざり」の棚で買うと使えるよ")).toBeTruthy();
});

test("未配置の所有がなくても、置いた装飾を選べば「しまう」を使える", async () => {
  await render(
    <DecorationMode
      assetIds={["decoration-tree"]}
      availableCounts={{ "decoration-tree": 0 }}
      busy={false}
      message={null}
      placedCount={1}
      selected={{ canRemove: true, label: "き" }}
      {...handlers}
    />,
  );

  expect(screen.getByRole("button", { name: "えらんだかざりをしまう" }).props.accessibilityState.disabled).toBe(false);
});
