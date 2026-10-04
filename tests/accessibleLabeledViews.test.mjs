import assert from "node:assert/strict";
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import test from "node:test";
import ts from "typescript";

/**
 * View に accessibilityLabel だけを付けても、React Native では accessible が
 * 既定で true にならないため、実機のスクリーンリーダーではラベルが読まれず、
 * 子の Text が個別に読み上げられてしまう（Issue #239）。
 * @testing-library/react-native の getByLabelText は props を直接見るので
 * 描画テストでは気づけない。ソースを構文解析して、付け忘れをここで止める。
 */

// accessible を付けない理由があるものだけを並べる。足すときは理由をコメントで残す。
const ALLOWED = new Set([
  // 子にRPGハブの3D表示と重ねたボタン類がまるごと入っており、1要素にまとめると
  // 中のボタンがスクリーンリーダーから操作できなくなる。
  "components/rpg-hub-web/WebVirtualPad.tsx",
]);

function listTsx(dir) {
  return readdirSync(dir).flatMap((name) => {
    const path = join(dir, name);
    if (statSync(path).isDirectory()) return listTsx(path);
    return path.endsWith(".tsx") ? [path] : [];
  });
}

function findLabeledViewsWithoutAccessible(file, text = readFileSync(file, "utf8")) {
  const source = ts.createSourceFile(file, text, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
  const found = [];
  const visit = (node) => {
    if (ts.isJsxOpeningElement(node) || ts.isJsxSelfClosingElement(node)) {
      const tag = node.tagName.getText(source);
      const names = node.attributes.properties
        .filter((prop) => ts.isJsxAttribute(prop))
        .map((prop) => prop.name.getText(source));
      if (/(^|\.)View$/.test(tag) && names.includes("accessibilityLabel") && !names.includes("accessible")) {
        const { line } = source.getLineAndCharacterOfPosition(node.getStart(source));
        found.push(`${file}:${line + 1}`);
      }
    }
    ts.forEachChild(node, visit);
  };
  visit(source);
  return found;
}

test("accessibilityLabel を付けた View には accessible も付いている（Issue #239）", () => {
  const files = [...listTsx("components"), ...listTsx("app")].filter(
    (file) => !ALLOWED.has(file.replaceAll("\\", "/")),
  );
  assert.ok(files.length > 0);
  assert.deepEqual(files.flatMap((file) => findLabeledViewsWithoutAccessible(file)), []);
});

test("付け忘れを検出し、付いていれば通す（このテスト自体が空振りしていないことの確認）", () => {
  const missing = `const a = (
  <View
    accessibilityLabel="所持額"
    style={styles.wallet}
  >
    <Text>1</Text>
  </View>
);`;
  assert.deepEqual(findLabeledViewsWithoutAccessible("x.tsx", missing), ["x.tsx:2"]);
  assert.deepEqual(findLabeledViewsWithoutAccessible("x.tsx", missing.replace("<View", "<Animated.View")), ["x.tsx:2"]);
  assert.deepEqual(findLabeledViewsWithoutAccessible("x.tsx", missing.replace("<View", "<View accessible")), []);
  assert.deepEqual(findLabeledViewsWithoutAccessible("x.tsx", '<Pressable accessibilityLabel="x" />'), []);
});
