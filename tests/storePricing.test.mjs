import assert from "node:assert/strict";
import test from "node:test";
import { describeChildPriceIndex, getStoreItemDisplayPrice } from "../lib/storePricing.ts";

test("販売価格があれば基準価格より優先して表示する", () => {
  assert.equal(getStoreItemDisplayPrice({ price: 120, sale_price: 130 }), 130);
  assert.equal(getStoreItemDisplayPrice({ price: 120 }), 120);
});

test("物価指数を子ども向けの表現へ変換する", () => {
  assert.deepEqual(
    [95, 100, 105, 110].map((index) => describeChildPriceIndex(index)),
    [
      "おかいどき（デフレ）",
      "いつもの ねだん（安定）",
      "すこし たかめ（インフレ気味）",
      "かなり たかめ（強いインフレ）",
    ],
  );
});
