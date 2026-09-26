import assert from "node:assert/strict";
import { readdirSync, readFileSync } from "node:fs";
import path from "node:path";
import test from "node:test";

const ROOT = path.resolve(import.meta.dirname, "..");
const UI_SOURCE_DIRS = ["app", "components", "constants", "lib"];

function sourceFiles(directory) {
  return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const entryPath = path.join(directory, entry.name);
    if (entry.isDirectory()) return sourceFiles(entryPath);
    return /\.(?:ts|tsx)$/.test(entry.name) ? [entryPath] : [];
  });
}

test("利用者向けソースに家庭内通貨の旧表記を追加しない", () => {
  const forbidden = [
    { label: "ポイント", pattern: /ポイント/u },
    { label: "HMC", pattern: /\bHMC\b/u },
    { label: "日本円記号", pattern: /[¥￥]/u },
    { label: "旧単位定数", pattern: /AMOUNT_UNITS|formatAmountWithUnit|formatYen/u },
    { label: "単独のP表記", pattern: /["']P["']|>P</u },
  ];
  const violations = [];

  for (const relativeDirectory of UI_SOURCE_DIRS) {
    for (const file of sourceFiles(path.join(ROOT, relativeDirectory))) {
      const source = readFileSync(file, "utf8");
      for (const rule of forbidden) {
        if (rule.pattern.test(source)) {
          violations.push(`${path.relative(ROOT, file)}: ${rule.label}`);
        }
      }
    }
  }

  assert.deepEqual(violations, []);
});
