import assert from "node:assert/strict";
import test from "node:test";
import { createStaleGuard } from "../lib/staleGuard.ts";

test("最新のリクエストIDはisCurrentでtrueになる", () => {
  const guard = createStaleGuard();
  const id = guard.start();
  assert.equal(guard.isCurrent(id), true);
});

test("後から開始したリクエストがあると、先に開始したリクエストのIDはisCurrentでfalseになる", () => {
  const guard = createStaleGuard();
  const firstId = guard.start();
  const secondId = guard.start();

  assert.equal(guard.isCurrent(firstId), false);
  assert.equal(guard.isCurrent(secondId), true);
});

test("先に開始したリクエストが後から完了しても、最新でなければ古いレスポンスとして無視できる", () => {
  const guard = createStaleGuard();
  const staleId = guard.start(); // 1回目のリクエスト開始
  guard.start(); // 2回目のリクエスト開始（1回目より新しい）

  // 1回目のリクエストが後から完了したケースを想定
  assert.equal(guard.isCurrent(staleId), false);
});
