# 音声素材

Issue #260 で導入したSE・BGMの出典と利用条件を記録する。Issue #393 で、RPGハブ（我が家タウン）
のBGMを別の曲へ差し替え、クエスト・ストア画面にもBGMを追加した。

## 再生方針

- 再生には Expo SDK 57 の `expo-audio` を使う。
- 端末のマナーモードを尊重し、マナーモード中は鳴らさない。
- 他アプリの音声を中断せず、バックグラウンド再生もしない。
- 録音機能は使わないため、`expo-audio` の設定でマイク権限を無効にする。
- SEは成功がはっきり伝わる操作に限定し、最初はストア購入成功時だけ鳴らす。
- BGMは画面がフォーカスされている間だけ流し、離れたら停止して先頭へ戻す。
- 我が家タウンだけは2曲を約5分おきに交互に流す（`lib/audio.ts` の `useTownBgm`）。
  クロスフェードはせず、今の曲を止めて次の曲を頭から再生する単純な切り替え。
  「約5分おき」は実際に鳴っていた時間の積算で数えるため、タウンと他の画面を数分おきに
  行き来しても毎回0から数え直されることはない。画面を離れて戻ったときは、直前に鳴って
  いた曲（1曲目/2曲目のどちらだったか）を頭から再生する。13行目の「停止して先頭へ戻す」
  は再生位置の話で、町BGMでもここは他の画面と同じ（曲の途中から再開したりはしない）。
  違うのは「次の切り替えまでの残り時間」だけで、これは引き継がれる。アプリが
  バックグラウンドに回っている間は再生とタイマーを止め、前面に戻ったときに再開する。

## 使用素材

| アプリ内ファイル | 用途 | 元ファイル | 作者・配布元 | ライセンス | 変更 |
| --- | --- | --- | --- | --- | --- |
| `assets/audio/purchase-success.mp3` | ストア購入成功SE | `confirmation_001.ogg`（Interface Sounds） | [Kenney](https://kenney.nl/assets/interface-sounds) | [CC0 1.0](https://creativecommons.org/publicdomain/zero/1.0/) | iOSを含む再生互換性のためMP3へ変換し、ファイル名を変更 |
| `assets/audio/rpg-hub-bgm-1.mp3` | 我が家タウンBGM（1曲目） | `PeriTune_Village_Fete_loop.mp3` | [PeriTune](https://peritune.com/blog/2024/04/12/village_fete/) | [CC BY 4.0](https://creativecommons.org/licenses/by/4.0/)（2026年3月より前に公開された曲のため） | ファイル名を変更し、192kbpsから112kbpsへ再エンコード（1R0Uさんレビュー指摘：アプリ本体・OTA更新のサイズ削減） |
| `assets/audio/rpg-hub-bgm-2.mp3` | 我が家タウンBGM（2曲目） | `First village`（作：こおろぎ） | [OpenTracks（旧DOVA-SYNDROME）](https://opentracks.com/bgm/detail/2359) | サイト標準ライセンス（商用利用可、BGM用途ならクレジット表記不要） | ファイル名を変更し、192kbpsから112kbpsへ再エンコード |
| `assets/audio/quest-bgm.mp3` | クエスト画面BGM | `PerituneMaterial_Positive_loop.mp3` | [PeriTune](https://peritune.com/blog/2015/08/04/positive/) | [CC BY 4.0](https://creativecommons.org/licenses/by/4.0/)（2026年3月より前に公開された曲のため） | ファイル名を変更し、192kbpsから112kbpsへ再エンコード |
| `assets/audio/store-bgm.mp3` | ストア画面BGM | `PerituneMaterial_Laid_Back3_loop.mp3` | [PeriTune](https://peritune.com/blog/2021/04/06/laid_back3/) | [CC BY 4.0](https://creativecommons.org/licenses/by/4.0/)（2026年3月より前に公開された曲のため） | ファイル名を変更し、192kbpsから112kbpsへ再エンコード |

`purchase-success.mp3` はCC0のためクレジット表記は必須ではない。`rpg-hub-bgm-2.mp3`
（OpenTracks）もサイトの標準ライセンス上、BGM用途であればクレジット表記は不要。

**PeriTuneの3曲（CC BY 4.0）:** PeriTuneは2026年3月以降公開の曲は独自規約（クレジット表記は
任意）だが、上記3曲はいずれもそれより前に公開されており、継続してCC BY 4.0が適用される。
CC BY 4.0はクレジット表記が必要なライセンスのため、設定画面の「音楽クレジット」
（`lib/audioCredits.ts` / `components/SettingsScreen.tsx`）に作者・曲名・ライセンス・
変更内容を表示している（1R0Uさんレビュー指摘）。
