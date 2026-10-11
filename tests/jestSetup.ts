import { afterEach, jest } from "@jest/globals";
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

// expo-audio はネイティブのモジュールが無いと読み込めない。効果音（playSoundEffect）は
// 戻るボタンなど多くの画面から鳴るので、音を確かめないテストでも読み込めるよう、
// 何も鳴らさない代わりを全体に入れておく。音を確かめるテスト（audio.render.test.tsx など）は
// 自分で jest.mock("expo-audio") し直している。
jest.mock("expo-audio", () => {
  const createPlayer = () => ({
    loop: false,
    pause: () => undefined,
    play: () => undefined,
    remove: () => undefined,
    replace: () => undefined,
    seekTo: () => Promise.resolve(),
    volume: 1,
  });
  return {
    createAudioPlayer: createPlayer,
    setAudioModeAsync: () => Promise.resolve(),
    useAudioPlayer: createPlayer,
  };
});
