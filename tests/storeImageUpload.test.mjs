import assert from "node:assert/strict";
import { afterEach, beforeEach, test } from "node:test";
import { deleteStoreItemImage, uploadStoreItemImage } from "../lib/storeImageUpload.ts";

const originalFetch = globalThis.fetch;

function mockFetch(arrayBuffer) {
  globalThis.fetch = async (uri) => {
    mockFetch.calledWith = uri;
    return { arrayBuffer: async () => arrayBuffer };
  };
}

function makeClient({
  uploadError = null,
  removeError = null,
  publicUrl = "https://example.supabase.co/storage/v1/object/public/store-item-images/fam-1/x.jpg",
} = {}) {
  const uploadCalls = [];
  const removeCalls = [];
  return {
    client: {
      storage: {
        from(bucket) {
          assert.equal(bucket, "store-item-images");
          return {
            getPublicUrl(path) {
              return { data: { publicUrl: publicUrl.replace("x.jpg", path.split("/").pop()) } };
            },
            async upload(path, body, options) {
              uploadCalls.push({ body, options, path });
              return { data: uploadError ? null : { path }, error: uploadError };
            },
            async remove(paths) {
              removeCalls.push(paths);
              return { data: removeError ? null : paths.map((path) => ({ path })), error: removeError };
            },
          };
        },
      },
    },
    removeCalls,
    uploadCalls,
  };
}

beforeEach(() => {
  mockFetch(new ArrayBuffer(4));
});

afterEach(() => {
  globalThis.fetch = originalFetch;
});

test("アップロードに成功したら公開URLを返す", async () => {
  const { client, uploadCalls } = makeClient();

  const url = await uploadStoreItemImage("file:///tmp/photo.jpg", "fam-1", client);

  assert.equal(uploadCalls.length, 1);
  assert.equal(uploadCalls[0].path.split("/")[0], "fam-1");
  assert.ok(uploadCalls[0].path.endsWith(".jpg"));
  assert.equal(uploadCalls[0].options.contentType, "image/jpeg");
  assert.ok(url.startsWith("https://example.supabase.co/"));
});

test("アップロード先のパスは家庭IDをフォルダにする（INSERTポリシーの前提）", async () => {
  const { client, uploadCalls } = makeClient();

  await uploadStoreItemImage("file:///tmp/photo.png", "family-xyz", client);

  assert.equal(uploadCalls[0].path.split("/")[0], "family-xyz");
  assert.equal(uploadCalls[0].options.contentType, "image/png");
});

test("拡張子を読み取れない場合はjpg扱いにする", async () => {
  const { client, uploadCalls } = makeClient();

  await uploadStoreItemImage("file:///tmp/photo-without-extension", "fam-1", client);

  assert.ok(uploadCalls[0].path.endsWith(".jpg"));
  assert.equal(uploadCalls[0].options.contentType, "image/jpeg");
});

test("アップロードに失敗したら日本語メッセージのエラーを投げる", async () => {
  const { client } = makeClient({ uploadError: { message: "network error" } });

  await assert.rejects(
    () => uploadStoreItemImage("file:///tmp/photo.jpg", "fam-1", client),
    /画像のアップロードに失敗しました/,
  );
});

test("毎回異なるファイル名になる（同時に選んだ画像が上書きされない）", async () => {
  const { client, uploadCalls } = makeClient();

  await uploadStoreItemImage("file:///tmp/a.jpg", "fam-1", client);
  await uploadStoreItemImage("file:///tmp/b.jpg", "fam-1", client);

  assert.notEqual(uploadCalls[0].path, uploadCalls[1].path);
});

test("公開URLから家庭ID付きのパスを取り出して削除する", async () => {
  const { client, removeCalls } = makeClient();

  await deleteStoreItemImage(
    "https://example.supabase.co/storage/v1/object/public/store-item-images/fam-1/1700000000-abcd1234.jpg",
    client,
  );

  assert.deepEqual(removeCalls, [["fam-1/1700000000-abcd1234.jpg"]]);
});

test("削除に失敗したら日本語メッセージのエラーを投げる", async () => {
  const { client } = makeClient({ removeError: { message: "network error" } });

  await assert.rejects(
    () =>
      deleteStoreItemImage(
        "https://example.supabase.co/storage/v1/object/public/store-item-images/fam-1/x.jpg",
        client,
      ),
    /画像の削除に失敗しました/,
  );
});

test("公開URLの形式でなければ何もしない（削除先が特定できない）", async () => {
  const { client, removeCalls } = makeClient();

  await deleteStoreItemImage("file:///tmp/photo.jpg", client);

  assert.equal(removeCalls.length, 0);
});
