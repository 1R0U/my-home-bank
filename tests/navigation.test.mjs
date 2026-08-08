import assert from "node:assert/strict";
import test from "node:test";
import fs from "node:fs";
import path from "node:path";

test("HomeScreen: ソースに銀行リンク (href=\"/bank\") が含まれている", () => {
  const p = path.resolve("app/index.tsx");
  const src = fs.readFileSync(p, "utf8");
  assert.ok(src.includes('href="/bank"'), "app/index.tsx に href=\"/bank\" が含まれるはずです");
});

test("BankScreen: ソースに戻るリンク (href=\"/\") が含まれている", () => {
  const p = path.resolve("app/bank.tsx");
  const src = fs.readFileSync(p, "utf8");
  assert.ok(src.includes('href="/"'), "app/bank.tsx に href=\"/\" が含まれるはずです");
});
