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

// SDK 58の expo-asset は react-native の AssetRegistry を直接読むが、jest-expo のモックは
// `react-native/asset-registry` にしか効かず、アイコンのフォントなどを読むと
// 「Module "1" is missing from the asset registry」で落ちる。jest-expo は画像・フォントを
// すべて id 1 として読み込むので、id 1 のアセットを登録しておく（Issue #485）
jest.requireActual<typeof import("react-native")>("react-native").AssetRegistry.registerAsset({
  fileSystemLocation: "/full/path/to/directory",
  hash: "md5",
  height: 1,
  httpServerLocation: "/assets/full/path/to/directory",
  name: "name",
  scales: [1],
  type: "type",
  width: 1,
});
