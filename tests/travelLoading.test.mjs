// 我が家タウンから建物へ入るときの「いどうちゅう」の画面（Issue #261）を、いつ閉じるかのテスト。
import assert from "node:assert/strict";
import test from "node:test";
import { TRAVEL_MAX_MS, TRAVEL_MIN_MS, getTravelHideDelay } from "../lib/travelLoading.ts";
import { useTravelStore } from "../store/travelStore.ts";

const travel = (waiting) => ({ id: 1, startedAt: 10_000, waiting });

test("入った先がすぐ用意できても、最低限の時間は見せる", () => {
  assert.equal(getTravelHideDelay(travel(false), 10_000), TRAVEL_MIN_MS);
  assert.equal(getTravelHideDelay(travel(false), 10_000 + 200), TRAVEL_MIN_MS - 200);
});

test("最低限の時間を過ぎてから用意できたら、すぐ閉じる", () => {
  assert.equal(getTravelHideDelay(travel(false), 10_000 + TRAVEL_MIN_MS + 500), 0);
});

test("入った先が読み込み中の間は、最長の時間まで待つ", () => {
  assert.equal(getTravelHideDelay(travel(true), 10_000 + 1000), TRAVEL_MAX_MS - 1000);
  // 読み込みが終わらなくても、最長の時間を過ぎたら閉じる（閉じ込めない）
  assert.equal(getTravelHideDelay(travel(true), 10_000 + TRAVEL_MAX_MS + 1), 0);
});

test("移動を始め、読み込み中かを知らせ、終える", () => {
  useTravelStore.setState({ travel: null });
  useTravelStore.getState().startTravel();
  const started = useTravelStore.getState().travel;
  assert.equal(started.waiting, false);

  useTravelStore.getState().setWaiting(started.id, true);
  assert.equal(useTravelStore.getState().travel.waiting, true);

  useTravelStore.getState().endTravel(started.id);
  assert.equal(useTravelStore.getState().travel, null);
});

test("終わった移動についての知らせや後始末は、次の移動に効かない", () => {
  useTravelStore.setState({ travel: null });
  useTravelStore.getState().startTravel();
  const first = useTravelStore.getState().travel;
  useTravelStore.getState().startTravel();
  const second = useTravelStore.getState().travel;
  assert.notEqual(first.id, second.id);

  useTravelStore.getState().setWaiting(first.id, true);
  useTravelStore.getState().endTravel(first.id);
  assert.deepEqual(useTravelStore.getState().travel, second);

  // id を省くと、今の移動を終える（町へ戻ってきたとき）
  useTravelStore.getState().endTravel();
  assert.equal(useTravelStore.getState().travel, null);
});
