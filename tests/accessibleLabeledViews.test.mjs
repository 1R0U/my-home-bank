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

// accessible を付けない理由がある View は、要素の直前の行（または開始タグの中）に
// `a11y-allow: 理由` と書いたコメントを置いて個別に許可する。
// 例: {/* a11y-allow: 子のボタンを個別に操作させるため */}
// ファイルやラベル文字列で許可すると、同じファイルに後から足した付け忘れまで見逃したり、
// ラベルに変数を埋め込んだ View を許可できなかったりするため。理由は必ず書く。
const ALLOW_PATTERN = /a11y-allow:\s*[^\s*/}]/;

function listTsx(dir) {
  return readdirSync(dir).flatMap((name) => {
    const path = join(dir, name);
    if (statSync(path).isDirectory()) return listTsx(path);
    return path.endsWith(".tsx") ? [path] : [];
  });
}

/**
 * accessible 属性の値を、ソースから読み取れる範囲で判定する。
 * 変数や式で渡している場合は false になり得るので "unknown" とし、付け忘れと同じく扱う。
 */
function accessibleState(attr) {
  if (!attr) return "missing";
  if (!attr.initializer) return "true"; // <View accessible>
  if (ts.isJsxExpression(attr.initializer)) {
    const kind = attr.initializer.expression?.kind;
    if (kind === ts.SyntaxKind.TrueKeyword) return "true";
    if (kind === ts.SyntaxKind.FalseKeyword) return "false";
  }
  return "unknown";
}

function findLabeledViewsWithoutAccessible(file, text = readFileSync(file, "utf8")) {
  const source = ts.createSourceFile(file, text, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
  const lines = text.split("\n");
  const found = [];
  const visit = (node) => {
    if (ts.isJsxOpeningElement(node) || ts.isJsxSelfClosingElement(node)) {
      const tag = node.tagName.getText(source);
      const props = node.attributes.properties;
      const attrs = props.filter((prop) => ts.isJsxAttribute(prop));
      const findAttr = (name) => attrs.find((prop) => prop.name.getText(source) === name);
      const label = findAttr("accessibilityLabel");
      // {...props} などでまとめて渡していると、accessibilityLabel や accessible が
      // 含まれているかをソースから判断できない。判断できないものは通さない。
      const hasSpread = props.some((prop) => ts.isJsxSpreadAttribute(prop));
      const isAccessible = accessibleState(findAttr("accessible")) === "true";
      const { line } = source.getLineAndCharacterOfPosition(node.getStart(source));
      const isAllowed = ALLOW_PATTERN.test(lines[line - 1] ?? "") || ALLOW_PATTERN.test(node.getText(source));
      if (/(^|\.)View$/.test(tag) && (label || hasSpread) && !isAccessible && !isAllowed) {
        found.push(`${file}:${line + 1}`);
      }
    }
    ts.forEachChild(node, visit);
  };
  visit(source);
  return found;
}

test("accessibilityLabel を付けた View には accessible も付いている（Issue #239）", () => {
  const files = [...listTsx("components"), ...listTsx("app")];
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
  const withLabel = (attrs) => missing.replace("<View", `<View ${attrs}`);
  assert.deepEqual(findLabeledViewsWithoutAccessible("x.tsx", missing), ["x.tsx:2"]);
  assert.deepEqual(findLabeledViewsWithoutAccessible("x.tsx", missing.replace("<View", "<Animated.View")), ["x.tsx:2"]);
  assert.deepEqual(findLabeledViewsWithoutAccessible("x.tsx", withLabel("accessible")), []);
  assert.deepEqual(findLabeledViewsWithoutAccessible("x.tsx", withLabel("accessible={true}")), []);
  assert.deepEqual(findLabeledViewsWithoutAccessible("x.tsx", withLabel("accessible={false}")), ["x.tsx:2"]);
  assert.deepEqual(findLabeledViewsWithoutAccessible("x.tsx", '<Pressable accessibilityLabel="x" />'), []);

  // 1. accessible を変数や式で渡していると false になり得るので、判断できないものとして検出する
  assert.deepEqual(findLabeledViewsWithoutAccessible("x.tsx", withLabel("accessible={isReady}")), ["x.tsx:2"]);
  assert.deepEqual(findLabeledViewsWithoutAccessible("x.tsx", withLabel("accessible={!hidden}")), ["x.tsx:2"]);

  // 2. {...props} でまとめて渡していると中身を判断できないので、ラベルが見えていなくても検出する
  assert.deepEqual(findLabeledViewsWithoutAccessible("x.tsx", "<View {...props} />"), ["x.tsx:1"]);
  assert.deepEqual(findLabeledViewsWithoutAccessible("x.tsx", '<View {...props} accessibilityLabel="x" />'), ["x.tsx:1"]);
  assert.deepEqual(findLabeledViewsWithoutAccessible("x.tsx", "<View accessible {...props} />"), []);
  assert.deepEqual(findLabeledViewsWithoutAccessible("x.tsx", "<View className=\"flex-1\" />"), []);

  // 3. ラベルに変数を埋め込んだ View も検出し、a11y-allow で個別に許可できる
  const templateLabel = `const a = (
  <View accessibilityLabel={\`所持額 \${balance}\`}>
    <Text>1</Text>
  </View>
);`;
  assert.deepEqual(findLabeledViewsWithoutAccessible("x.tsx", templateLabel), ["x.tsx:2"]);
  assert.deepEqual(
    findLabeledViewsWithoutAccessible("x.tsx", templateLabel.replace("const a = (", "const a = (\n  // a11y-allow: 子を個別に読ませるため")),
    [],
  );
});

test("a11y-allow は理由付きで、直前の行か開始タグの中にあるときだけ、その要素にだけ効く", () => {
  const text = `const a = (
  <View>
    {/* a11y-allow: 子のボタンを個別に操作させるため */}
    <View accessibilityLabel="許可したもの">
      <View accessibilityLabel="別のラベル" />
    </View>
    <View
      // a11y-allow: panHandlers だけを渡しており、ラベルは含まない
      {...panHandlers}
    />
    {/* a11y-allow: */}
    <View accessibilityLabel="理由なし" />
  </View>
);`;
  assert.deepEqual(findLabeledViewsWithoutAccessible("x.tsx", text), ["x.tsx:5", "x.tsx:12"]);
});
