import assert from "node:assert/strict";
import test from "node:test";
import {
  fetchHouseFurnitureLayouts,
  saveHouseFurnitureLayout,
  storeHouseFurniture,
  toHouseFurnitureLayouts,
} from "../lib/houseFurnitureService.ts";

/**
 * 家の中の家具の位置と向き（house_furniture_layouts。Issue #477）の読み書き。
 */

function makeFetchClient({ data, error }) {
  return {
    from(table) {
      assert.equal(table, "house_furniture_layouts");
      return {
        select(columns) {
          assert.equal(columns, "furniture_id, position_x, position_z, rotation_y, stored");
          return {
            async eq(column, value) {
              assert.equal(column, "user_id");
              assert.equal(value, "user-1");
              return { data, error };
            },
          };
        },
      };
    },
  };
}

test("取得した行を、アプリで使う形にする（numeric が文字列で返っても数値にする）", async () => {
  const client = makeFetchClient({
    data: [
      { furniture_id: "house-closet", position_x: "-3.3", position_z: -79.55, rotation_y: "1.5707963267948966", stored: false },
      { furniture_id: "house-sofa", position_x: 0, position_z: 0, rotation_y: 0, stored: true },
    ],
    error: null,
  });

  assert.deepEqual(await fetchHouseFurnitureLayouts("user-1", client), [
    { furnitureId: "house-closet", rotationY: Math.PI / 2, stored: false, x: -3.3, z: -79.55 },
    { furnitureId: "house-sofa", rotationY: 0, stored: true, x: 0, z: 0 },
  ]);
});

test("動かせない家具の行や、数値でない行は捨てる（家具が最初の位置に出るだけにする）", () => {
  assert.deepEqual(
    toHouseFurnitureLayouts([
      { furniture_id: "house-window", position_x: 0, position_z: 0, rotation_y: 0, stored: false },
      { furniture_id: "house-closet", position_x: "NaN", position_z: 0, rotation_y: 0, stored: false },
      { furniture_id: "house-closet", position_x: 1, position_z: 2, rotation_y: 0, stored: false },
    ]),
    [{ furnitureId: "house-closet", rotationY: 0, stored: false, x: 1, z: 2 }],
  );
});

test("町に最初からある飾りの行も、家具と同じく読む。建物の行は捨てる（Issue #509）", () => {
  assert.deepEqual(
    toHouseFurnitureLayouts([
      { furniture_id: "scatter-0-1", position_x: "1.35", position_z: 2.25, rotation_y: 0, stored: false },
      { furniture_id: "tree-north", position_x: 0, position_z: 0, rotation_y: 0, stored: true },
      { furniture_id: "bank-building", position_x: 0, position_z: 0, rotation_y: 0, stored: false },
    ]),
    [
      { furnitureId: "scatter-0-1", rotationY: 0, stored: false, x: 1.35, z: 2.25 },
      { furnitureId: "tree-north", rotationY: 0, stored: true, x: 0, z: 0 },
    ],
  );
});

test("取得に失敗したらエラーを投げる", async () => {
  const client = makeFetchClient({ data: null, error: new Error("boom") });
  await assert.rejects(() => fetchHouseFurnitureLayouts("user-1", client), /boom/);
});

function makeSaveClient({ error }) {
  const calls = [];
  return {
    calls,
    from(table) {
      assert.equal(table, "house_furniture_layouts");
      return {
        async upsert(payload, options) {
          calls.push({ options, payload });
          return { error };
        },
      };
    },
  };
}

test("保存は、利用者と家具の組で1行にする（無ければ作り、あれば書き換える）", async () => {
  const client = makeSaveClient({ error: null });

  await saveHouseFurnitureLayout("user-1", { furnitureId: "house-closet", rotationY: Math.PI, x: 1.2, z: -78 }, client);

  assert.equal(client.calls.length, 1);
  const { options, payload } = client.calls[0];
  assert.deepEqual(options, { onConflict: "user_id,furniture_id" });
  assert.equal(payload.user_id, "user-1");
  assert.equal(payload.furniture_id, "house-closet");
  assert.equal(payload.position_x, 1.2);
  assert.equal(payload.position_z, -78);
  assert.equal(payload.rotation_y, Math.PI);
  assert.ok(!Number.isNaN(Date.parse(payload.updated_at)));
});

test("保存に失敗したらエラーを投げる", async () => {
  const client = makeSaveClient({ error: new Error("denied") });
  await assert.rejects(
    () => saveHouseFurnitureLayout("user-1", { furnitureId: "house-closet", rotationY: 0, x: 0, z: 0 }, client),
    /denied/,
  );
});

test("家具をしまうのはDBの関数に任せる（持ち物を増やすのはDB。Issue #506）", async () => {
  const calls = [];
  const client = {
    async rpc(name, args) {
      calls.push({ args, name });
      return { error: null };
    },
  };

  await storeHouseFurniture("house-sofa", client);

  assert.deepEqual(calls, [{ args: { p_furniture_id: "house-sofa" }, name: "store_house_furniture" }]);
});

test("しまえなかったらエラーを投げる", async () => {
  const client = { rpc: async () => ({ error: new Error("この家具はしまえません") }) };
  await assert.rejects(() => storeHouseFurniture("house-closet", client), /しまえません/);
});
