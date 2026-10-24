# 移動中の代わりの姿

自分の色・装備の画像や歩行コマ絵を待つ間にも、選んだ種類を表示するための画像です。
町・プレビューと同じモデルを、元の色・装備なしで撮影しています。
実行時に追加の3Dシーンや通信を必要としません。

モデルを変更したときは、Chromium系ブラウザの実行ファイルを指定して再生成します。

```powershell
node scripts/generate-travel-character-images.mjs "C:\Program Files (x86)\Microsoft\Edge\Application\msedge.exe"
```

生成時に、全種類のPNGに透明でない画素が含まれることも確認します。
