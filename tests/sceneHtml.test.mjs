import assert from "node:assert/strict";
import test from "node:test";
import { buildRpgHubHtml } from "../components/rpg-hub-web/sceneHtml.ts";

test("characterTypeをJSONとして安全に埋め込む", () => {
  const html = buildRpgHubHtml("/* babylon */", "/* scene */", "cat");

  assert.match(html, /window\.__RPG_HUB_INITIAL_CHARACTER_TYPE__ = "cat";/);
  // 埋め込みスクリプトは、babylon・sceneのスクリプトより前に置く
  // （scene.ts が起動時に読む値のため、後だと間に合わない）
  const initialIndex = html.indexOf("__RPG_HUB_INITIAL_CHARACTER_TYPE__");
  const babylonIndex = html.indexOf("/* babylon */");
  const sceneIndex = html.indexOf("/* scene */");
  assert.ok(initialIndex < babylonIndex);
  assert.ok(initialIndex < sceneIndex);
});

test("値は必ずJSON.stringifyを通すため、閉じタグやクォートを含んでいても安全", () => {
  const html = buildRpgHubHtml("", "", '"; alert(1); //');

  assert.match(html, /window\.__RPG_HUB_INITIAL_CHARACTER_TYPE__ = "\\"; alert\(1\); \/\/";/);
});

test("babylon・sceneのソース中の</scriptは早期終了しないようエスケープする", () => {
  const html = buildRpgHubHtml("</script>evil", "", "frog");
  assert.doesNotMatch(html, /<\/script>evil/);
});
