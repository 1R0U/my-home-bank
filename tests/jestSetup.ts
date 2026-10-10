import { afterEach } from "@jest/globals";
import { cleanup } from "@testing-library/react-native";
import { clearResourceCache } from "../lib/resourceCache";

// 取得結果のキャッシュはモジュールに1つだけあるため、テストごとに消す。
// 消さないと、前のテストで取得した一覧が次のテストに残り、取得が省かれる。
//
// 先に画面を片付けてから消す。表示中の画面はキャッシュが消えると取り直すので、
// 残っていると次のテスト用に用意したモックの応答を先に使ってしまう。
afterEach(() => {
  cleanup();
  clearResourceCache();
});
