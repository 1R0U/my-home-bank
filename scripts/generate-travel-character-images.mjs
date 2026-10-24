// 移動中の画像がまだ用意できていないときに使う姿を、実際の3Dモデルから作る。
// 実行例: node scripts/generate-travel-character-images.mjs "ブラウザ実行ファイルのパス"
import { spawnSync } from "node:child_process";
import { mkdirSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { build } from "esbuild";

const browser = process.argv[2];
if (!browser) throw new Error("Chromium系ブラウザの実行ファイルを引数で指定してください");
const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const temporary = mkdtempSync(join(tmpdir(), "travel-character-images-"));
const bundled = await build({
  bundle: true,
  entryPoints: [join(root, "webview/rpg-hub/wardrobePreview.ts")],
  format: "iife",
  write: false,
  target: ["es2017", "ios13", "chrome80"],
});
const babylon = readFileSync(join(root, "node_modules/babylonjs/babylon.js"), "utf8");
// 一覧を手書きせず、アプリが使う型の一覧を同じバンドラで読み出す。
const typesBundle = await build({
  stdin: { contents: 'export { CHARACTER_TYPES } from "./lib/rpg-hub/characterTypes.ts"', resolveDir: root },
  bundle: true, format: "esm", platform: "node", write: false,
});
const { CHARACTER_TYPES: types } = await import(`data:text/javascript;base64,${Buffer.from(typesBundle.outputFiles[0].text).toString("base64")}`);
const escapeScript = (source) => source.replace(/<\/script/gi, "<\\/script");
const html = `<!doctype html><html><body>
<canvas id="renderCanvas" style="width:512px;height:512px"></canvas><pre id="result">waiting</pre>
<script>${escapeScript(babylon)}</script><script>
const types = ${JSON.stringify(types)};
const results = {};
function next() {
  const type = types[Object.keys(results).length];
  if (!type) {
    document.getElementById('result').textContent = JSON.stringify(results);
    document.querySelectorAll('script').forEach(element => element.remove());
    return;
  }
  window.dispatchEvent(new MessageEvent('message', {data: JSON.stringify({
    type:'setLook',renderPortrait:true,look:{characterType:type,equipment:{},palette:{},season:'spring'}
  })}));
}
window.ReactNativeWebView = {postMessage(raw) {
  const event = JSON.parse(raw);
  if (event.event === 'ready') setTimeout(next, 0);
  if (event.event === 'portrait') {
    const image = new Image();
    image.onload = () => {
      const canvas = document.createElement('canvas');canvas.width=256;canvas.height=256;
      const context = canvas.getContext('2d');context.drawImage(image,0,0);
      const pixels=context.getImageData(0,0,256,256).data;
      let visible=0;for(let i=3;i<pixels.length;i+=4)if(pixels[i]>0)visible++;
      if(!visible) throw new Error('キャラクターが描かれていません');
      results[types[Object.keys(results).length]]=event.dataUrl;
      setTimeout(next, 0);
    };
    image.src=event.dataUrl;
  }
}};
</script><script>${escapeScript(bundled.outputFiles[0].text)}</script></body></html>`;
const page = join(temporary, "render.html");
writeFileSync(page, html);
const result = spawnSync(browser, [
  "--headless", "--enable-unsafe-swiftshader", "--use-angle=swiftshader", "--no-first-run",
  `--user-data-dir=${join(temporary, "profile")}`, "--virtual-time-budget=15000", "--dump-dom",
  pathToFileURL(page).href,
], { encoding: "utf8", maxBuffer: 32 * 1024 * 1024, timeout: 60000, windowsHide: true });
if (result.error) throw result.error;
const match = result.stdout.match(/<pre id="result">([^<]*)<\/pre>/);
const images = match && JSON.parse(match[1]);
if (!images || types.some((type) => !images[type]?.startsWith("data:image/png;base64,"))) {
  throw new Error("6種類の画像を作れませんでした。ブラウザのWebGL対応を確認してください");
}
const destination = join(root, "assets/travel-characters");
mkdirSync(destination, { recursive: true });
for (const type of types) {
  writeFileSync(join(destination, `${type}.png`), Buffer.from(images[type].split(",")[1], "base64"));
  console.log(`${type}: 256px四方・描画済みのPNGを保存しました`);
}
