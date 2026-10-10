import { afterEach } from "@jest/globals";
import { clearResourceCache } from "../lib/resourceCache";

// 取得結果のキャッシュはモジュールに1つだけあるため、テストごとに消す。
// 消さないと、前のテストで取得した一覧が次のテストに残り、取得が省かれる。
afterEach(() => {
  clearResourceCache();
});
