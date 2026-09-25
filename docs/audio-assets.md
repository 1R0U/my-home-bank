# 音声素材

Issue #260 で導入したSE・BGMの出典と利用条件を記録する。

## 再生方針

- 再生には Expo SDK 57 の `expo-audio` を使う。
- 端末のマナーモードを尊重し、マナーモード中は鳴らさない。
- 他アプリの音声を中断せず、バックグラウンド再生もしない。
- 録音機能は使わないため、`expo-audio` の設定でマイク権限を無効にする。
- SEは成功がはっきり伝わる操作に限定し、最初はストア購入成功時だけ鳴らす。
- RPGハブのBGMは画面がフォーカスされている間だけループし、離れたら停止して先頭へ戻す。

## 使用素材

| アプリ内ファイル | 用途 | 元ファイル | 作者・配布元 | ライセンス | 変更 |
| --- | --- | --- | --- | --- | --- |
| `assets/audio/purchase-success.mp3` | ストア購入成功SE | `confirmation_001.ogg`（Interface Sounds） | [Kenney](https://kenney.nl/assets/interface-sounds) | [CC0 1.0](https://creativecommons.org/publicdomain/zero/1.0/) | iOSを含む再生互換性のためMP3へ変換し、ファイル名を変更 |
| `assets/audio/rpg-hub-bgm.mp3` | RPGハブBGM | `menumusicloop-tiggo.ogg`（Two Simple Game Music Loops） | [qubodup / OpenGameArt](https://opengameart.org/content/two-simple-game-music-loops) | [CC0 1.0](https://creativecommons.org/publicdomain/zero/1.0/) | iOSを含む再生互換性のためMP3へ変換し、ファイル名を変更 |

どちらもCC0のためクレジット表記は必須ではないが、差し替え時に利用条件を追跡できるよう出典を残す。
