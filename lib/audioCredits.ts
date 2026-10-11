/**
 * アプリ内に表示するBGMクレジット（Issue #393）。
 *
 * CC BY 4.0 は利用にクレジット表記が必要なライセンス。ここに載せた3曲は
 * `docs/audio-assets.md` に記録した通りPeriTuneのCC BY 4.0の曲で、設定画面の
 * 「音楽クレジット」から表示する（1R0Uさんレビュー指摘：アプリ内にクレジット
 * 表示の仕組みが無いままCC BY 4.0の曲を同梱していた）。
 */
export type AudioCredit = {
  title: string;
  author: string;
  authorUrl: string;
  license: string;
  licenseUrl: string;
  note: string;
};

export const AUDIO_CREDITS: readonly AudioCredit[] = [
  {
    author: "PeriTune",
    authorUrl: "https://peritune.com/blog/2024/04/12/village_fete/",
    license: "CC BY 4.0",
    licenseUrl: "https://creativecommons.org/licenses/by/4.0/",
    note: "我が家タウンBGM（1曲目）として、ビットレートを変換して使用",
    title: "Village_Fete",
  },
  {
    author: "PeriTune",
    authorUrl: "https://peritune.com/blog/2015/08/04/positive/",
    license: "CC BY 4.0",
    licenseUrl: "https://creativecommons.org/licenses/by/4.0/",
    note: "クエスト画面BGMとして、ビットレートを変換して使用",
    title: "Positive",
  },
  {
    author: "PeriTune",
    authorUrl: "https://peritune.com/blog/2021/04/06/laid_back3/",
    license: "CC BY 4.0",
    licenseUrl: "https://creativecommons.org/licenses/by/4.0/",
    note: "ストア画面BGMとして、ビットレートを変換して使用",
    title: "Laid_Back3",
  },
];
