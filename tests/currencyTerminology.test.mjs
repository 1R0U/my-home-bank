import assert from "node:assert/strict";
import { readdirSync, readFileSync } from "node:fs";
import path from "node:path";
import test from "node:test";

const ROOT = path.resolve(import.meta.dirname, "..");
const UI_SOURCE_DIRS = ["app", "components", "constants", "lib", "store", "types", "webview"];

const FORBIDDEN_TERMS = [
  { label: "ポイント", pattern: /ポイント/u },
  { label: "HMC", pattern: /\bHMC\b/u },
  { label: "pt/PT/Pt表記", pattern: /["'](?:pt|PT|Pt)["']|[>}]\s*(?:pt|PT|Pt)\s*</u },
  { label: "数値付き旧単位", pattern: /\b\d[\d,]*(?:\.\d+)?\s*(?:pt|PT|Pt)\b(?!-)/u },
  { label: "旧単位定数", pattern: /AMOUNT_UNITS|formatAmountWithUnit|formatYen/u },
  { label: "単独のP表記", pattern: /["']P["']|>P</u },
];

function sourceFiles(directory) {
  return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const entryPath = path.join(directory, entry.name);
    if (entry.isDirectory()) return sourceFiles(entryPath);
    return /\.(?:ts|tsx)$/.test(entry.name) ? [entryPath] : [];
  });
}

test("利用者向けソースに家庭内通貨の旧表記を追加しない", () => {
  const violations = [];

  for (const relativeDirectory of UI_SOURCE_DIRS) {
    for (const file of sourceFiles(path.join(ROOT, relativeDirectory))) {
      const source = readFileSync(file, "utf8");
      for (const rule of FORBIDDEN_TERMS) {
        if (rule.pattern.test(source)) {
          violations.push(`${path.relative(ROOT, file)}: ${rule.label}`);
        }
      }
    }
  }

  assert.deepEqual(violations, []);
});

test("旧ポイント単位の検出ではスタイル名を誤検出しない", () => {
  const legacyUnitRules = FORBIDDEN_TERMS.filter(({ label }) =>
    ["pt/PT/Pt表記", "数値付き旧単位"].includes(label),
  );

  for (const source of ['"pt"', "'PT'", ">Pt<", "100pt", "1,000 PT", "12.5 Pt"]) {
    assert.ok(legacyUnitRules.some(({ pattern }) => pattern.test(source)), `${source} を検出できること`);
  }

  for (const source of ["pt-2", "px-4 pt-2", "100 gol", "¥1,000", "￥1,000"]) {
    assert.ok(
      legacyUnitRules.every(({ pattern }) => !pattern.test(source)),
      `${source} を誤検出しないこと`,
    );
  }
});
